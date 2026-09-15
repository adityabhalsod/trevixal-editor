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
  insertBlockAfter,
  nodeAtPath,
  pos,
  safeLength,
} from '@trevixal/core'
import type { ImageAlign } from './schema'

/** Where an image is and what it holds. The unit every command works on. */
export interface ImageHit {
  readonly path: Path
  readonly node: EditorNode
  /** Path of the wrapping `figure`, when the image has a caption. */
  readonly figurePath: Path | null
}

/**
 * The image the *user* is on: a node-selected image, a node-selected figure,
 * or a caret anywhere inside a figure (its caption, in practice). Deliberately
 * stricter than {@link findImage}, floating chrome must appear only when
 * something is really selected, never because an image happens to sit nearby.
 */
export function activeImage(state: EditorState): ImageHit | null {
  const doc = state.doc
  const selection = state.selection
  if (selection instanceof NodeSelection) {
    const hit = hitAt(doc, selection.path)
    if (hit) return hit
  }
  const path = selection.from.path
  for (let depth = path.length; depth > 0; depth--) {
    const hit = hitAt(doc, path.slice(0, depth))
    if (hit) return hit
  }
  return null
}

/**
 * The image a command should act on: {@link activeImage}, an explicit path, or,
 * because images are atoms that hold no caret, the block right after the
 * selection, which is where a freshly inserted image sits.
 */
export function findImage(state: EditorState, at?: Path): ImageHit | null {
  if (at) return hitAt(state.doc, at)
  const active = activeImage(state)
  if (active) return active
  const path = state.selection.from.path
  const index = path[path.length - 1]
  if (index === undefined) return null
  return hitAt(state.doc, [...path.slice(0, -1), index + 1])
}

/** Read a path as an image, unwrapping a figure to the image it holds. */
function hitAt(doc: EditorNode, path: Path): ImageHit | null {
  const node = nodeAtPath(doc, path)
  if (!node) return null
  if (node.type.name === 'image') {
    const parent = path.length > 0 ? nodeAtPath(doc, path.slice(0, -1)) : null
    return { path, node, figurePath: parent?.type.name === 'figure' ? path.slice(0, -1) : null }
  }
  if (node.type.name !== 'figure') return null
  for (let index = 0; index < node.childCount; index++) {
    const child = node.child(index)
    if (child.type.name === 'image') {
      return { path: [...path, index], node: child, figurePath: path }
    }
  }
  return null
}

/** Index of a node among its siblings; every structural edit needs it. */
function indexOf(path: Path): number | null {
  const index = path[path.length - 1]
  return index === undefined ? null : index
}

// ---------------------------------------------------------------- commands

/** Insert an image node after the current block. */
export function insertImage(attrs: {
  src: string
  alt?: string
  title?: string
  uploadId?: string
}): Command {
  return insertBlockAfter('image', attrs)
}

/**
 * Set attributes on the image the selection is on, or on `at` when the caller
 * already knows the path, toolbars do, and passing it keeps them working even
 * if a click moved the selection out from under them.
 */
export function updateImage(attrs: Attrs, at?: Path): Command {
  return (state) => {
    const hit = findImage(state, at)
    if (!hit) return null
    return state.tr.step(new SetNodeAttrsStep(hit.path, { ...hit.node.attrs, ...attrs }))
  }
}

/**
 * Float an image left/right, center it, or clear the alignment. The attribute
 * lives on the image even inside a figure, so a captioned image aligns the
 * same way an uncaptioned one does.
 */
export function setImageAlign(align: ImageAlign, at?: Path): Command {
  return updateImage({ align }, at)
}

/** Resize an image; pass null to clear an explicit dimension. */
export function resizeImage(
  width: string | null,
  height: string | null = null,
  at?: Path,
): Command {
  return updateImage({ width, height }, at)
}

/**
 * Set the width from a toolbar preset or a text field: bare numbers become
 * px, and a percentage clears any explicit height. A `%` width with a px
 * height stretches the image out of shape.
 */
export function setImageWidth(width: string | null, at?: Path): Command {
  const value = width === null ? null : safeLength(width)
  const attrs: Attrs = value?.endsWith('%') ? { width: value, height: null } : { width: value }
  return updateImage(attrs, at)
}

/** Set the alt text: the one image attribute that is not decoration. */
export function setImageAlt(alt: string, at?: Path): Command {
  return updateImage({ alt }, at)
}

/** Select an image as a whole node, the way clicking it does. */
export function selectImage(at: Path): Command {
  return (state) => {
    const hit = hitAt(state.doc, at)
    if (!hit) return null
    return state.tr.setSelection(new NodeSelection(hit.path))
  }
}

/** Remove the image (and its figure, if it has one) at `at` or the selection. */
export function removeImage(at?: Path): Command {
  return (state) => {
    const hit = findImage(state, at)
    if (!hit) return null
    const target = hit.figurePath ?? hit.path
    const index = indexOf(target)
    if (index === null) return null
    return state.tr.step(
      new ReplaceNodesStep(target.slice(0, -1), index, index + 1, Fragment.empty),
    )
  }
}

/** Remove the image containing the selection. */
export const deleteImage: Command = removeImage()

/**
 * Add a caption to an image, or take it away again: wrapping in a `figure`
 * and unwrapping back to the bare image are the same user-facing toggle, so
 * they are one command and one undo step. Wrapping leaves the caret in the
 * new caption, because the only reason to add one is to type in it.
 */
export function toggleImageCaption(at?: Path): Command {
  return (state) => {
    const hit = findImage(state, at)
    if (!hit) return null
    if (hit.figurePath) {
      const index = indexOf(hit.figurePath)
      if (index === null) return null
      const parentPath = hit.figurePath.slice(0, -1)
      const tr = state.tr.step(
        new ReplaceNodesStep(parentPath, index, index + 1, Fragment.of(hit.node)),
      )
      return tr.setSelection(new NodeSelection([...parentPath, index]))
    }
    const figure = buildFigure(state, hit.node, '')
    if (!figure) return null
    const index = indexOf(hit.path)
    if (index === null) return null
    const parentPath = hit.path.slice(0, -1)
    const tr = state.tr.step(
      new ReplaceNodesStep(parentPath, index, index + 1, Fragment.of(figure)),
    )
    return tr.setSelection(new TextSelection(pos([...parentPath, index, 1], 0)))
  }
}

/**
 * Replace an image's caption text, wrapping the image in a figure first when
 * it has none, so a host setting a caption from outside the editor does not
 * have to know whether one exists yet.
 */
export function setImageCaption(text: string, at?: Path): Command {
  return (state) => {
    const hit = findImage(state, at)
    if (!hit) return null
    const caption = buildCaption(state, text)
    if (!caption) return null
    if (hit.figurePath) {
      const figure = nodeAtPath(state.doc, hit.figurePath)
      if (!figure) return null
      return state.tr.step(
        new ReplaceNodesStep(hit.figurePath, 1, figure.childCount, Fragment.of(caption)),
      )
    }
    const figure = buildFigure(state, hit.node, text)
    if (!figure) return null
    const index = indexOf(hit.path)
    if (index === null) return null
    return state.tr.step(
      new ReplaceNodesStep(hit.path.slice(0, -1), index, index + 1, Fragment.of(figure)),
    )
  }
}

/** The caption text of an image, empty when it has none. */
export function imageCaptionText(state: EditorState, hit: ImageHit): string {
  if (!hit.figurePath) return ''
  const figure = nodeAtPath(state.doc, hit.figurePath)
  const caption = figure?.content.children.find((child) => child.type.name === 'caption')
  return caption?.textContent ?? ''
}

function buildCaption(state: EditorState, text: string): EditorNode | null {
  const type = state.schema.nodes.caption
  if (!type) return null
  return type.create(undefined, text ? Fragment.of(state.schema.text(text)) : Fragment.empty)
}

function buildFigure(state: EditorState, image: EditorNode, text: string): EditorNode | null {
  const type = state.schema.nodes.figure
  const caption = buildCaption(state, text)
  if (!type || !caption) return null
  return type.create(undefined, Fragment.of(image, caption))
}
