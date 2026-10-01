import {
  type EditorNode,
  type EditorState,
  Fragment,
  type Path,
  ReplaceNodesStep,
  type Schema,
  TextSelection,
  type Transaction,
  inlineLength,
  nodeAtPath,
  pos,
} from '@trevixal/core'

/** An empty paragraph, the filler every fresh container starts with. */
export function emptyParagraph(schema: Schema): EditorNode {
  return schema.firstTextblockType().create()
}

/** Whether `parent` still holds valid content with `node` spliced into it. */
export function acceptsBlock(
  parent: EditorNode,
  from: number,
  to: number,
  node: EditorNode,
): boolean {
  const children = [...parent.content.children]
  children.splice(from, to - from, node)
  return parent.type.validContent(Fragment.from(children))
}

/**
 * Insert a block at the selection, replacing the current block when it is an
 * empty paragraph (so a fresh document does not keep a blank line above every
 * insert) and appending after it otherwise. Returns the path the new block
 * landed at, or null when there is nowhere to put it.
 *
 * A parent whose content expression forbids the block is climbed past rather
 * than broken: a tab item takes only `tabTitle tabContent`, so a callout asked
 * for from a tab title lands after the whole tabs block instead of being
 * written into a slot that cannot hold it. Pass `replaceEmpty: false` for a
 * block that should always land *after* the current one.
 */
export function insertBlockHere(
  state: EditorState,
  node: EditorNode,
  replaceEmpty = true,
): { tr: Transaction; path: Path } | null {
  let blockPath = state.selection.to.path
  while (blockPath.length > 0) {
    const parentPath = blockPath.slice(0, -1)
    const parent = nodeAtPath(state.doc, parentPath)
    const index = blockPath[blockPath.length - 1] as number
    if (parent) {
      const current = nodeAtPath(state.doc, blockPath)
      const replaceInPlace =
        replaceEmpty &&
        current?.isTextblock === true &&
        current.textContent.length === 0 &&
        current.childCount === 0
      if (replaceInPlace && acceptsBlock(parent, index, index + 1, node)) {
        const tr = state.tr
        tr.step(new ReplaceNodesStep(parentPath, index, index + 1, Fragment.of(node)))
        return { tr, path: [...parentPath, index] }
      }
      if (acceptsBlock(parent, index + 1, index + 1, node)) {
        const at = index + 1
        const tr = state.tr
        tr.step(new ReplaceNodesStep(parentPath, at, at, Fragment.of(node)))
        return { tr, path: [...parentPath, at] }
      }
    }
    blockPath = parentPath
  }
  return null
}

/** Place the cursor in the first textblock inside `node`, addressed from `path`. */
export function selectFirstTextblock(node: EditorNode, path: Path): TextSelection {
  let current = node
  const trail: number[] = [...path]
  while (!current.isTextblock && current.childCount > 0) {
    current = current.child(0)
    trail.push(0)
  }
  return new TextSelection(pos(trail, 0))
}

/**
 * Select the whole text of the textblock at `path`, so typing replaces a
 * placeholder title ("Tab 1") instead of appending to it.
 */
export function selectTextblockContent(block: EditorNode, path: Path): TextSelection {
  return new TextSelection(pos(path, 0), pos(path, inlineLength(block.content)))
}

/** Nearest ancestor of the given type along a path, with the path to it. */
export function findAncestor(
  doc: EditorNode,
  path: Path,
  name: string,
): { node: EditorNode; path: Path } | null {
  for (let depth = path.length; depth >= 0; depth--) {
    const candidate = nodeAtPath(doc, path.slice(0, depth))
    if (candidate?.type.name === name) return { node: candidate, path: path.slice(0, depth) }
  }
  return null
}

/** Index of the first top-level child of the given type. */
export function findChildIndex(doc: EditorNode, name: string): number | null {
  for (let i = 0; i < doc.childCount; i++) {
    if (doc.child(i).type.name === name) return i
  }
  return null
}

/** Clamp a requested item count into `[min, max]`, treating junk as `min`. */
export function clampCount(value: unknown, min: number, max: number): number {
  const count = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : min
  return Math.min(max, Math.max(min, count))
}
