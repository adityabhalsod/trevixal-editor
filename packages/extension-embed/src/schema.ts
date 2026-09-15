import type { NodeSpec } from '@trevixal/core'
import { escapeHTML, safeHref, safeImageSrc, safeLength } from '@trevixal/core'
import { formatBytes } from './format'
import {
  type EmbedNodesOptions,
  type EmbedProvider,
  embedProviderFor,
  hostnameOf,
  safeEmbedSrc,
  safeMediaSrc,
  safeWebURL,
} from './url'

export type { EmbedNodesOptions, EmbedProvider } from './url'

/** The block-level embed node names, for "is the selection on an embed" checks. */
export const EMBED_BLOCK_NODES: readonly string[] = ['video', 'audio', 'iframeEmbed', 'linkCard']

/** Every node this package adds, block and inline. */
export const EMBED_NODES: readonly string[] = [...EMBED_BLOCK_NODES, 'attachment']

const PROVIDERS = new Set<string>(['youtube', 'vimeo', 'generic'])

/**
 * The permissions and loading attributes every rendered `<iframe>` carries.
 * `sandbox` is the load-bearing one: it keeps the framed page from
 * navigating the top window or reading the document, whatever the host.
 */
export const IFRAME_ATTRIBUTES: Readonly<Record<string, string>> = {
  allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
  allowfullscreen: '',
  loading: 'lazy',
  referrerpolicy: 'strict-origin-when-cross-origin',
  sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups',
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** A `width`/`height` HTML attribute: unitless pixels, or a CSS length as-is. */
function dimensionAttr(value: unknown): string | null {
  const length = safeLength(value)
  return length ? length.replace(/px$/, '') : null
}

function sizeAttr(value: unknown): number | null {
  const size = typeof value === 'string' ? Number(value) : value
  return typeof size === 'number' && Number.isFinite(size) && size >= 0 ? Math.round(size) : null
}

/** A MIME type worth keeping: `type/subtype` with no room for markup. */
function mimeAttr(value: unknown): string | null {
  return typeof value === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(value) ? value : null
}

/**
 * Coerce any input to a known provider, deriving it from the source if
 * needed. `'generic'` is the attribute's default rather than a claim, so a
 * node that never named a provider still renders as the YouTube or Vimeo
 * player its source points at.
 */
export function embedProvider(value: unknown, src?: string): EmbedProvider {
  if (typeof value === 'string' && value !== 'generic' && PROVIDERS.has(value)) {
    return value as EmbedProvider
  }
  return src ? embedProviderFor(src) : 'generic'
}

/**
 * Media and embed node specs to merge into a schema:
 * `new Schema({ nodes: { ...defaultNodes(), ...embedNodes(options) }, marks: … })`.
 *
 * `options` decides which hosts an `<iframe>` may point at. The core HTML
 * parser drops `<iframe>` wholesale unless a schema rule claims the tag; the
 * `iframeEmbed` rule below is that claim, and its `getAttrs` is what stands
 * between a pasted frame and the document, so the same allowlist is
 * consulted on import, on insert and on render.
 *
 * The `attachment` and `linkCard` nodes render as `<a>` so exported HTML
 * stays a working download link / preview card without this package's
 * stylesheet. Note that core's `link` mark claims every `<a href>` on import
 * and marks are matched before nodes, so when a schema also includes
 * `defaultMarks()` those two nodes re-import as plain links to the same
 * target rather than as nodes; `video`, `audio` and `iframeEmbed` round-trip
 * in every schema.
 */
export function embedNodes(options: EmbedNodesOptions = {}): Record<string, NodeSpec> {
  return {
    video: {
      group: 'block',
      atom: true,
      attrs: {
        src: { default: '' },
        poster: { default: null },
        width: { default: null },
        height: { default: null },
        controls: { default: true },
        title: { default: null },
      },
      toHTML: (node) => {
        const attrs: Record<string, string> = { class: 'trevixal-video' }
        if (node.attrs.controls !== false) attrs.controls = ''
        const src = safeMediaSrc(node.attrs.src)
        if (src) attrs.src = src
        const poster = safeImageSrc(node.attrs.poster)
        if (poster) attrs.poster = poster
        const width = dimensionAttr(node.attrs.width)
        if (width) attrs.width = width
        const height = dimensionAttr(node.attrs.height)
        if (height) attrs.height = height
        const title = stringOrNull(node.attrs.title)
        if (title) attrs.title = title
        return { tag: 'video', attrs }
      },
      parseHTML: [
        {
          tag: 'video',
          getAttrs: (element) => {
            const src = safeMediaSrc(element.getAttribute('src') ?? firstSourceOf(element))
            if (!src) return false
            return {
              src,
              poster: safeImageSrc(element.getAttribute('poster')),
              width: safeLength(element.getAttribute('width')),
              height: safeLength(element.getAttribute('height')),
              // Always on: the schema carries no `autoplay`, `loop` or
              // `muted`, so importing a control-less background video as it
              // stands would leave a frame the reader cannot start.
              controls: true,
              title: stringOrNull(element.getAttribute('title')),
            }
          },
        },
      ],
    },

    audio: {
      group: 'block',
      atom: true,
      attrs: {
        src: { default: '' },
        title: { default: null },
        controls: { default: true },
      },
      toHTML: (node) => {
        const attrs: Record<string, string> = { class: 'trevixal-audio' }
        if (node.attrs.controls !== false) attrs.controls = ''
        const src = safeMediaSrc(node.attrs.src)
        if (src) attrs.src = src
        const title = stringOrNull(node.attrs.title)
        if (title) attrs.title = title
        return { tag: 'audio', attrs }
      },
      parseHTML: [
        {
          tag: 'audio',
          getAttrs: (element) => {
            const src = safeMediaSrc(element.getAttribute('src') ?? firstSourceOf(element))
            if (!src) return false
            return {
              src,
              title: stringOrNull(element.getAttribute('title')),
              // As with `<video>`: an imported autoplaying clip loses its
              // autoplay, so it needs controls to stay playable.
              controls: true,
            }
          },
        },
      ],
    },

    iframeEmbed: {
      group: 'block',
      atom: true,
      attrs: {
        src: { default: '' },
        title: { default: null },
        width: { default: null },
        height: { default: null },
        provider: { default: 'generic' },
      },
      toHTML: (node) => {
        // The render path re-vets the source: a document that arrived by
        // JSON, with no parser in between, gets the same allowlist.
        const src = safeEmbedSrc(node.attrs.src, options)
        const provider = embedProvider(node.attrs.provider, src ?? undefined)
        const attrs: Record<string, string> = {
          class: `trevixal-embed trevixal-embed--${provider}`,
        }
        if (src) attrs.src = src
        const title = stringOrNull(node.attrs.title)
        if (title) attrs.title = title
        Object.assign(attrs, IFRAME_ATTRIBUTES)
        const width = dimensionAttr(node.attrs.width)
        if (width) attrs.width = width
        const height = dimensionAttr(node.attrs.height)
        if (height) attrs.height = height
        return { tag: 'iframe', attrs }
      },
      parseHTML: [
        {
          tag: 'iframe',
          getAttrs: (element) => {
            // Returning false hands the element back to the parser, which
            // drops an unclaimed <iframe> along with its subtree.
            const src = safeEmbedSrc(element.getAttribute('src'), options)
            if (!src) return false
            return {
              src,
              title: stringOrNull(element.getAttribute('title')),
              width: safeLength(element.getAttribute('width')),
              height: safeLength(element.getAttribute('height')),
              provider: embedProviderFor(src),
            }
          },
        },
      ],
    },

    attachment: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: {
        href: { default: '' },
        name: { default: '' },
        size: { default: null },
        type: { default: null },
        /** Storage handle, kept so the backend can delete the object later. */
        storageKey: { default: null },
        /** Set while an upload is running; cleared when it resolves. */
        uploadId: { default: null },
      },
      toHTML: (node) => {
        const name = typeof node.attrs.name === 'string' ? node.attrs.name : ''
        const uploading = typeof node.attrs.uploadId === 'string'
        const attrs: Record<string, string> = {
          class: 'trevixal-attachment',
          'data-trevixal-attachment': 'true',
        }
        const href = safeMediaSrc(node.attrs.href)
        if (href) attrs.href = href
        if (name) attrs.download = name
        const size = sizeAttr(node.attrs.size)
        if (size !== null) attrs['data-size'] = String(size)
        const type = mimeAttr(node.attrs.type)
        if (type) attrs['data-type'] = type
        if (uploading) attrs['data-trevixal-uploading'] = node.attrs.uploadId as string
        const sizeText = uploading ? 'Uploading…' : size !== null ? formatBytes(size) : ''
        const innerHTML = [
          '<span class="trevixal-attachment__icon" aria-hidden="true">📎</span>',
          `<span class="trevixal-attachment__name">${escapeHTML(name)}</span>`,
          `<span class="trevixal-attachment__size">${escapeHTML(sizeText)}</span>`,
        ].join('')
        return { tag: 'a', attrs, innerHTML }
      },
      parseHTML: [
        {
          tag: 'a',
          attribute: 'data-trevixal-attachment',
          getAttrs: (element) => {
            const href = safeMediaSrc(element.getAttribute('href'))
            if (!href) return false
            const label = element.querySelector('.trevixal-attachment__name')?.textContent
            return {
              href,
              name: element.getAttribute('download') || label || href,
              size: sizeAttr(element.getAttribute('data-size')),
              type: mimeAttr(element.getAttribute('data-type')),
            }
          },
        },
      ],
    },

    linkCard: {
      group: 'block',
      atom: true,
      attrs: {
        href: { default: '' },
        title: { default: null },
        description: { default: null },
        image: { default: null },
        siteName: { default: null },
      },
      toHTML: (node) => {
        const href = safeWebURL(node.attrs.href) ?? safeHref(node.attrs.href)
        const attrs: Record<string, string> = {
          class: 'trevixal-linkcard',
          target: '_blank',
          rel: 'noopener noreferrer',
          'data-trevixal-linkcard': 'true',
        }
        if (href) attrs.href = href
        const hostname = href ? hostnameOf(href) : null
        const title = stringOrNull(node.attrs.title)
        const description = stringOrNull(node.attrs.description)
        const image = safeImageSrc(node.attrs.image)
        const siteName = stringOrNull(node.attrs.siteName)
        if (title) attrs['data-title'] = title
        if (description) attrs['data-description'] = description
        if (image) attrs['data-image'] = image
        if (siteName) attrs['data-site'] = siteName
        const site = siteName ?? hostname ?? ''
        const heading = title ?? hostname ?? href ?? ''
        const innerHTML = [
          image ? `<img class="trevixal-linkcard__image" src="${escapeHTML(image)}" alt="">` : '',
          '<span class="trevixal-linkcard__body">',
          `<span class="trevixal-linkcard__title">${escapeHTML(heading)}</span>`,
          `<span class="trevixal-linkcard__description">${escapeHTML(description ?? '')}</span>`,
          `<span class="trevixal-linkcard__site">${escapeHTML(site)}</span>`,
          '</span>',
        ].join('')
        return { tag: 'a', attrs, innerHTML }
      },
      parseHTML: [
        {
          tag: 'a',
          attribute: 'data-trevixal-linkcard',
          getAttrs: (element) => {
            const href = safeWebURL(element.getAttribute('href'))
            if (!href) return false
            return {
              href,
              title: stringOrNull(element.getAttribute('data-title')),
              description: stringOrNull(element.getAttribute('data-description')),
              image: safeImageSrc(element.getAttribute('data-image')),
              siteName: stringOrNull(element.getAttribute('data-site')),
            }
          },
        },
      ],
    },
  }
}

/** The `src` of the first `<source>` child, for `<video><source src></video>`. */
function firstSourceOf(element: HTMLElement): string | null {
  for (const child of [...element.children]) {
    if (child.tagName.toLowerCase() !== 'source') continue
    const src = child.getAttribute('src')
    if (src) return src
  }
  return null
}
