import {
  type Command,
  type EditorNode,
  type EditorState,
  Fragment,
  NodeSelection,
  type Path,
  ReplaceNodesStep,
  SetNodeAttrsStep,
  nodeAtPath,
} from '@trevixal/core'
import { galleryColumns } from './schema'

const MEDIA = new Set(['image', 'figure'])

/** The gallery the selection is in or on, with its path. */
export function galleryAt(state: EditorState): { path: Path; node: EditorNode } | null {
  const selection = state.selection
  const path = selection instanceof NodeSelection ? selection.path : selection.from.path
  for (let depth = path.length; depth > 0; depth--) {
    const candidate = path.slice(0, depth)
    const node = nodeAtPath(state.doc, candidate)
    if (node?.type.name === 'gallery') return { path: candidate, node }
  }
  return null
}

/**
 * The run of sibling images and captioned figures the selection covers, or
 * the one it is on and the images right beside it.
 */
function mediaRun(state: EditorState): { parent: Path; from: number; to: number } | null {
  const selection = state.selection
  const anchor = selection instanceof NodeSelection ? selection.path : null
  const start = anchor ?? selection.from.path.slice(0, 1)
  const end = anchor ?? selection.to.path.slice(0, 1)
  if (start.length === 0 || start.length !== end.length) return null
  const parent = start.slice(0, -1)
  const container = nodeAtPath(state.doc, parent)
  if (!container || container.type.name === 'gallery') return null
  let from = start[start.length - 1] as number
  let to = (end[end.length - 1] as number) + 1
  const isMedia = (index: number): boolean =>
    MEDIA.has(container.content.maybeChild(index)?.type.name ?? '')
  // One image picked: its neighbours come with it, a run of images is what
  // a gallery is made of.
  if (to - from === 1) {
    while (from > 0 && isMedia(from - 1)) from--
    while (to < container.childCount && isMedia(to)) to++
  }
  for (let index = from; index < to; index++) if (!isMedia(index)) return null
  return from < to ? { parent, from, to } : null
}

/**
 * Put the selected images into a gallery: a grid `columns` across, whose
 * images open full size in the editor's lightbox. With one image selected,
 * the images right beside it go in too. Declines when the selection is not
 * on images, or is already in a gallery.
 */
export function makeGallery(columns = 3): Command {
  return (state) => {
    const run = mediaRun(state)
    return run ? galleryOf(run.parent, run.from, run.to, columns)(state) : null
  }
}

/**
 * Put the siblings `from` to `to - 1` under `parent` into a gallery, when
 * every one of them is an image or a captioned figure.
 */
export function galleryOf(parent: Path, from: number, to: number, columns = 3): Command {
  return (state) => {
    const type = state.schema.nodes.gallery
    const container = nodeAtPath(state.doc, parent)
    if (!type || !container || from >= to) return null
    const items = container.content.children.slice(from, to)
    if (items.length !== to - from || !items.every((item) => MEDIA.has(item.type.name))) return null
    const gallery = type.create({ columns: galleryColumns(columns) }, Fragment.from(items))
    const tr = state.tr.step(new ReplaceNodesStep(parent, from, to, Fragment.of(gallery)))
    return tr.setSelection(new NodeSelection([...parent, from]))
  }
}

/** Take a gallery's images back out into the document, one after another. */
export const unwrapGallery: Command = (state) => {
  const found = galleryAt(state)
  if (!found) return null
  const parent = found.path.slice(0, -1)
  const index = found.path[found.path.length - 1] as number
  const tr = state.tr.step(
    new ReplaceNodesStep(parent, index, index + 1, Fragment.from(found.node.content.children)),
  )
  return tr.setSelection(new NodeSelection([...parent, index]))
}

/** How many images a gallery shows across, from 2 to 6. */
export function setGalleryColumns(columns: number): Command {
  return (state) => {
    const found = galleryAt(state)
    const value = galleryColumns(columns)
    if (!found || found.node.attrs.columns === value || value !== columns) return null
    return state.tr.step(new SetNodeAttrsStep(found.path, { ...found.node.attrs, columns: value }))
  }
}
