import {
  type Attrs,
  type Command,
  type EditorNode,
  type EditorState,
  Fragment,
  NodeSelection,
  type Path,
  ReplaceNodesStep,
  SetNodeAttrsStep,
  TextSelection,
  type Transaction,
  insertInlineNode,
  nodeAtPath,
  pos,
} from '@trevixal/core'
import { EMBED_BLOCK_NODES, embedProvider } from './schema'
import {
  type EmbedNodesOptions,
  hostnameOf,
  parseEmbedURL,
  safeEmbedSrc,
  safeMediaSrc,
  safeWebURL,
} from './url'

export interface VideoAttrs {
  readonly src: string
  readonly poster?: string | null
  readonly width?: string | number | null
  readonly height?: string | number | null
  readonly controls?: boolean
  readonly title?: string | null
}

export interface AudioAttrs {
  readonly src: string
  readonly title?: string | null
  readonly controls?: boolean
}

export interface IframeAttrs {
  readonly src: string
  readonly title?: string | null
  readonly width?: string | number | null
  readonly height?: string | number | null
  /** Derived from the host when omitted. */
  readonly provider?: 'youtube' | 'vimeo' | 'generic'
}

export interface LinkCardAttrs {
  readonly href: string
  readonly title?: string | null
  readonly description?: string | null
  readonly image?: string | null
  readonly siteName?: string | null
}

export interface AttachmentAttrs {
  readonly href: string
  readonly name: string
  readonly size?: number | null
  readonly type?: string | null
  readonly storageKey?: string | null
  readonly uploadId?: string | null
}

/** Metadata a link preview service returns for a URL. */
export interface LinkPreview {
  readonly title?: string
  readonly description?: string
  readonly image?: string
  readonly siteName?: string
}

/**
 * Resolves a URL to its preview, or null when none is available. Fetching
 * happens outside the editor (a server endpoint, an oEmbed proxy…) because
 * the browser cannot read a third-party page's metadata directly.
 */
export type LinkPreviewFetcher = (url: string) => Promise<LinkPreview | null>

/** A block that holds only the caret: replaced, not pushed down, by an insert. */
function isEmptyTextblock(node: EditorNode | null): boolean {
  return node?.isTextblock === true && node.childCount === 0
}

/**
 * Insert a block atom at the selection: it replaces the current block when
 * that is an empty paragraph (so a fresh document does not keep a blank line
 * above every embed), and lands after it otherwise. The caret ends up just
 * past the new block, as `insertContent` leaves it.
 */
function insertEmbedBlock(state: EditorState, node: EditorNode): Transaction | null {
  const selection = state.selection
  const blockPath = selection instanceof NodeSelection ? selection.path : selection.to.path
  if (blockPath.length === 0) return null
  const parentPath = blockPath.slice(0, -1)
  const index = blockPath[blockPath.length - 1] as number
  const parent = nodeAtPath(state.doc, parentPath)
  if (!parent || parent.isTextblock) return null
  const replaceInPlace =
    !(selection instanceof NodeSelection) && isEmptyTextblock(nodeAtPath(state.doc, blockPath))
  const at = replaceInPlace ? index : index + 1
  const tr = state.tr
  tr.step(new ReplaceNodesStep(parentPath, at, replaceInPlace ? index + 1 : at, Fragment.of(node)))
  tr.setSelection(new TextSelection(pos(parentPath, at + 1)))
  return tr
}

/** Insert a `<video>` block. Declines when the source is not a playable URL. */
export function insertVideo(attrs: VideoAttrs): Command {
  return (state) => {
    const src = safeMediaSrc(attrs.src)
    if (!src) return null
    const node = state.schema.nodeType('video').create({
      src,
      poster: attrs.poster ?? null,
      width: attrs.width === undefined || attrs.width === null ? null : String(attrs.width),
      height: attrs.height === undefined || attrs.height === null ? null : String(attrs.height),
      controls: attrs.controls ?? true,
      title: attrs.title ?? null,
    })
    return insertEmbedBlock(state, node)
  }
}

/** Insert an `<audio>` block. Declines when the source is not a playable URL. */
export function insertAudio(attrs: AudioAttrs): Command {
  return (state) => {
    const src = safeMediaSrc(attrs.src)
    if (!src) return null
    const node = state.schema.nodeType('audio').create({
      src,
      title: attrs.title ?? null,
      controls: attrs.controls ?? true,
    })
    return insertEmbedBlock(state, node)
  }
}

/**
 * Insert an `<iframe>` embed. The source must pass the same allowlist the
 * schema was created with; anything else declines rather than storing a
 * frame the renderer would then refuse to give a `src`.
 */
export function insertIframe(attrs: IframeAttrs, options: EmbedNodesOptions = {}): Command {
  return (state) => {
    const src = safeEmbedSrc(attrs.src, options)
    if (!src) return null
    const node = state.schema.nodeType('iframeEmbed').create({
      src,
      title: attrs.title ?? null,
      width: attrs.width === undefined || attrs.width === null ? null : String(attrs.width),
      height: attrs.height === undefined || attrs.height === null ? null : String(attrs.height),
      provider: embedProvider(attrs.provider, src),
    })
    return insertEmbedBlock(state, node)
  }
}

/** Insert a link preview card. Declines unless `href` is an absolute http(s) URL. */
export function insertLinkCard(attrs: LinkCardAttrs): Command {
  return (state) => {
    const href = safeWebURL(attrs.href)
    if (!href) return null
    const node = state.schema.nodeType('linkCard').create({
      href,
      title: attrs.title ?? null,
      description: attrs.description ?? null,
      image: attrs.image ?? null,
      siteName: attrs.siteName ?? null,
    })
    return insertEmbedBlock(state, node)
  }
}

/**
 * Paste-a-link: recognise the URL and insert the matching node, a YouTube
 * or Vimeo player, a direct video or audio file, or a generic iframe when
 * the host is allowlisted. Declines for anything it does not recognise, so
 * a caller can fall through to a plain link or a {@link insertLinkCardFor}.
 */
export function insertEmbed(url: string, options: EmbedNodesOptions = {}): Command {
  return (state) => {
    const target = parseEmbedURL(url, options)
    if (!target) return null
    switch (target.kind) {
      case 'video':
        return insertVideo({ src: target.src })(state)
      case 'audio':
        return insertAudio({ src: target.src })(state)
      case 'youtube':
        return insertIframe({ src: target.src, provider: 'youtube' }, options)(state)
      case 'vimeo':
        return insertIframe({ src: target.src, provider: 'vimeo' }, options)(state)
      default:
        return insertIframe({ src: target.src, provider: 'generic' }, options)(state)
    }
  }
}

/** Insert an inline attachment chip at the cursor. */
export function insertAttachment(attrs: AttachmentAttrs): Command {
  return (state) => {
    // A pending upload has no href yet; a finished one must have a safe one.
    const href = attrs.href ? safeMediaSrc(attrs.href) : ''
    if (href === null) return null
    if (!href && !attrs.uploadId) return null
    return insertInlineNode('attachment', {
      href,
      name: attrs.name,
      size: attrs.size ?? null,
      type: attrs.type ?? null,
      storageKey: attrs.storageKey ?? null,
      uploadId: attrs.uploadId ?? null,
    })(state)
  }
}

/**
 * Build a link card for a URL, asking `fetchPreview` for its metadata. Without
 * a fetcher, or when it fails or finds nothing. The card falls back to the
 * hostname as its title. Resolves null when the URL is not an http(s) link.
 */
export async function insertLinkCardFor(
  url: string,
  fetchPreview?: LinkPreviewFetcher,
): Promise<Command | null> {
  const href = safeWebURL(url)
  if (!href) return null
  let preview: LinkPreview | null = null
  if (fetchPreview) {
    try {
      preview = await fetchPreview(href)
    } catch {
      preview = null
    }
  }
  return insertLinkCard({
    href,
    title: preview?.title || hostnameOf(href) || href,
    description: preview?.description ?? null,
    image: preview?.image ?? null,
    siteName: preview?.siteName ?? null,
  })
}

/** True for a node this package renders as a block atom. */
export function isEmbedBlock(node: EditorNode | null | undefined): boolean {
  return node !== null && node !== undefined && EMBED_BLOCK_NODES.includes(node.type.name)
}

/**
 * The embed block the selection addresses: the node-selected block, the
 * block at the caret, one of its ancestors, or, because inserting an embed
 * leaves the caret just before it and atoms hold no caret of their own, the
 * block right after the caret's.
 */
export function embedAtSelection(state: EditorState): { path: Path; node: EditorNode } | null {
  const selection = state.selection
  if (selection instanceof NodeSelection) {
    const node = nodeAtPath(state.doc, selection.path)
    return isEmbedBlock(node) ? { path: selection.path, node: node as EditorNode } : null
  }
  const path = selection.from.path
  for (let depth = path.length; depth >= 1; depth--) {
    const candidatePath = path.slice(0, depth)
    const node = nodeAtPath(state.doc, candidatePath)
    if (isEmbedBlock(node)) return { path: candidatePath, node: node as EditorNode }
  }
  // A block-level position (path of the parent, offset = child index) is how
  // `insertEmbedBlock` leaves the caret; the embed sits just before it.
  const parent = nodeAtPath(state.doc, path)
  if (parent && !parent.isTextblock) {
    for (const index of [selection.from.offset - 1, selection.from.offset]) {
      const node = nodeAtPath(state.doc, [...path, index])
      if (isEmbedBlock(node)) return { path: [...path, index], node: node as EditorNode }
    }
  }
  const index = path[path.length - 1]
  if (index === undefined) return null
  const siblingPath = [...path.slice(0, -1), index + 1]
  const sibling = nodeAtPath(state.doc, siblingPath)
  return isEmbedBlock(sibling) ? { path: siblingPath, node: sibling as EditorNode } : null
}

/** Patch attributes on the embed block at the selection. */
export function updateEmbedAttrs(attrs: Attrs): Command {
  return (state) => {
    const target = embedAtSelection(state)
    if (!target) return null
    return state.tr.step(new SetNodeAttrsStep(target.path, { ...target.node.attrs, ...attrs }))
  }
}

/** Remove the embed block at the selection, leaving a paragraph if it was the last block. */
export const deleteEmbed: Command = (state) => {
  const target = embedAtSelection(state)
  if (!target) return null
  const parentPath = target.path.slice(0, -1)
  const index = target.path[target.path.length - 1] as number
  const parent = nodeAtPath(state.doc, parentPath)
  if (!parent) return null
  const tr = state.tr
  if (parent.childCount === 1) {
    const paragraph = state.schema.firstTextblockType().create()
    tr.step(new ReplaceNodesStep(parentPath, index, index + 1, Fragment.of(paragraph)))
    tr.setSelection(new TextSelection(pos([...parentPath, index], 0)))
    return tr
  }
  tr.step(new ReplaceNodesStep(parentPath, index, index + 1, Fragment.empty))
  tr.setSelection(new TextSelection(pos(parentPath, index)))
  return tr
}
