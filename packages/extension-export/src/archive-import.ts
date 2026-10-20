import {
  type EditorNode,
  Fragment,
  type Schema,
  cleanPastedHTML,
  normalizeDoc,
  parseHTML,
  parseMarkdown,
} from '@trevixal/core'
import { base64Encode, mimeForExtension } from './shared'
import { ArchiveError, readZip } from './zip'

/**
 * What Notion and Google Docs export as a `.zip`: Notion's pages as
 * Markdown (or HTML) with their pictures in folders beside them, Google
 * Docs' "Web page" as one HTML file and an `images` folder. Either comes in
 * as one document, its pictures packed in as data so nothing points back at
 * the archive.
 */

const decoder = new TextDecoder()

/** A path inside the archive, from a link in a page there: relative to the page, `%20`s and all. */
function resolve(from: string, link: string): string {
  let target = link
  try {
    target = decodeURIComponent(link)
  } catch {
    // A malformed escape is taken literally.
  }
  const base = from.includes('/') ? from.slice(0, from.lastIndexOf('/') + 1) : ''
  const parts: string[] = []
  for (const piece of `${base}${target}`.split('/')) {
    if (piece === '..') parts.pop()
    else if (piece && piece !== '.') parts.push(piece)
  }
  return parts.join('/')
}

/** A picture in the archive as a `data:` URL, or null when it is not there. */
function dataURL(parts: ReadonlyMap<string, Uint8Array>, path: string): string | null {
  const bytes = parts.get(path)
  if (!bytes) return null
  const mime = mimeForExtension(path.split('.').pop() ?? '')
  return mime.startsWith('image/') ? `data:${mime};base64,${base64Encode(bytes)}` : null
}

/** Pages in reading order: the shallowest first, then by name, as Notion nests sub-pages. */
function byDepth(a: string, b: string): number {
  const depth = (name: string): number => name.split('/').length
  return depth(a) - depth(b) || a.localeCompare(b)
}

/**
 * Google Docs styles its export with classes, `.c3{font-weight:700}`, which
 * the HTML reader does not see. Put each class's declarations on the
 * elements that carry it, where it does.
 */
function inlineClassStyles(document: Document): void {
  const rules = new Map<string, string>()
  for (const style of document.querySelectorAll('style')) {
    for (const match of (style.textContent ?? '').matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) {
      const name = match[1] as string
      rules.set(name, `${rules.get(name) ?? ''}${match[2]};`)
    }
  }
  for (const element of document.querySelectorAll<HTMLElement>('[class]')) {
    const extra = [...element.classList].map((name) => rules.get(name) ?? '').join('')
    if (extra) element.setAttribute('style', `${extra}${element.getAttribute('style') ?? ''}`)
  }
}

/** Read a Notion or Google Docs export into a document of `schema`. */
export async function parseExportArchive(
  schema: Schema,
  file: Blob,
  document: Document,
): Promise<EditorNode> {
  const parts = await readZip(new Uint8Array(await file.arrayBuffer()))
  const names = [...parts.keys()].filter((name) => !name.startsWith('__MACOSX/'))
  const markdown = names.filter((name) => /\.md$/i.test(name)).sort(byDepth)
  const pages = names.filter((name) => /\.html?$/i.test(name)).sort(byDepth)
  const blocks: EditorNode[] = []

  if (markdown.length > 0) {
    for (const name of markdown) {
      // Pictures linked from the page come from the archive, packed in.
      const source = decoder
        .decode(parts.get(name))
        .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (whole, alt: string, link: string) => {
          if (/^[a-z]+:/i.test(link)) return whole
          const src = dataURL(parts, resolve(name, link))
          return src ? `![${alt}](${src})` : whole
        })
      blocks.push(...parseMarkdown(source, schema).content.children)
    }
  } else if (pages.length > 0) {
    for (const name of pages) {
      const page = new (document.defaultView?.DOMParser ?? DOMParser)().parseFromString(
        decoder.decode(parts.get(name)),
        'text/html',
      )
      inlineClassStyles(page)
      for (const image of page.querySelectorAll('img[src]')) {
        const link = image.getAttribute('src') ?? ''
        if (/^[a-z]+:/i.test(link)) continue
        const src = dataURL(parts, resolve(name, link))
        if (src) image.setAttribute('src', src)
      }
      const html = cleanPastedHTML(page.body.innerHTML, 'google-docs')
      blocks.push(...parseHTML(schema, html, document).content.children)
    }
  } else {
    throw new ArchiveError('Nothing in this archive can be read: it has no Markdown or HTML page')
  }
  const content = blocks.length > 0 ? blocks : [schema.nodeType('paragraph').create()]
  return normalizeDoc(schema.topType.create(undefined, Fragment.from(content)))
}
