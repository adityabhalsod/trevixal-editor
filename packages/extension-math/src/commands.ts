import {
  type Command,
  type EditorNode,
  type EditorState,
  Fragment,
  NodeSelection,
  type Path,
  ReplaceInlineStep,
  ReplaceNodesStep,
  SetNodeAttrsStep,
  TextSelection,
  inlineLength,
  inlineSize,
  insertInlineNode,
  nodeAtPath,
  pathsEqual,
  pos,
  sliceInline,
} from '@trevixal/core'
import { MATH_BLOCK_NODE, MATH_NODE } from './schema'

/** Whether a node is one of the two math atoms, whatever the schema calls them elsewhere. */
function isMathNode(node: EditorNode): boolean {
  return node.type.name === MATH_NODE || node.type.name === MATH_BLOCK_NODE
}

/**
 * A located math node. `path` addresses the node itself (so it feeds
 * `SetNodeAttrsStep` directly); `range` is its inline extent inside the
 * parent textblock, and is null for a `mathBlock`, whose parent addresses it
 * by child index instead.
 */
export interface MathHit {
  readonly path: Path
  readonly node: EditorNode
  /** True for `mathBlock`, false for the inline `math` atom. */
  readonly block: boolean
  readonly range: { readonly from: number; readonly to: number } | null
}

/** Inline offset of the child at `index` in a textblock's content. */
function offsetOfChild(block: EditorNode, index: number): number {
  let offset = 0
  for (let i = 0; i < index; i++) offset += inlineSize(block.child(i))
  return offset
}

function hitAt(doc: EditorNode, path: Path, node: EditorNode): MathHit | null {
  if (!isMathNode(node)) return null
  if (!node.isInline) return { path, node, block: true, range: null }
  const block = nodeAtPath(doc, path.slice(0, -1))
  if (!block?.isTextblock) return null
  const from = offsetOfChild(block, path[path.length - 1] as number)
  return { path, node, block: false, range: { from, to: from + inlineSize(node) } }
}

/** Index of the inline child whose extent starts exactly at `offset`, or -1. */
function childIndexAtOffset(block: EditorNode, offset: number): number {
  let at = 0
  for (let i = 0; i < block.childCount; i++) {
    if (at === offset) return i
    at += inlineSize(block.child(i))
    if (at > offset) return -1
  }
  return at === offset ? block.childCount : -1
}

/**
 * The math node the selection acts on: the node under a `NodeSelection`, the
 * inline atom on either side of a caret (before wins, matching how backspace
 * reads), or a `mathBlock` the selection sits on or beside. Null when the
 * selection is nowhere near a formula.
 */
export function findMathAt(state: EditorState): MathHit | null {
  const doc = state.doc
  const selection = state.selection

  if (selection instanceof NodeSelection) {
    const node = nodeAtPath(doc, selection.path)
    return node ? hitAt(doc, selection.path, node) : null
  }

  const point = selection.from
  const container = nodeAtPath(doc, point.path)
  if (!container) return null

  if (container.isTextblock) {
    const index = childIndexAtOffset(container, point.offset)
    if (index < 0) return null
    // Before the caret first: that is the node a user "is on" after typing it.
    const candidates = [index - 1, index]
    for (const candidate of candidates) {
      const child = container.content.maybeChild(candidate)
      if (child && isMathNode(child)) return hitAt(doc, [...point.path, candidate], child)
    }
    return null
  }

  // A block-level position (an `AllSelection` starts at one): `offset` is a
  // child index, not an inline offset, so look at the children on both sides.
  for (const candidate of [point.offset, point.offset - 1]) {
    const child = container.content.maybeChild(candidate)
    if (child && isMathNode(child)) return hitAt(doc, [...point.path, candidate], child)
  }
  return null
}

/** Plain text covered by the selection, when it stays inside one textblock. */
function selectedText(state: EditorState): string {
  const selection = state.selection
  if (!(selection instanceof TextSelection) || selection.empty) return ''
  const { from, to } = selection
  if (!pathsEqual(from.path, to.path)) return ''
  const block = nodeAtPath(state.doc, from.path)
  if (!block?.isTextblock) return ''
  const slice = sliceInline(block.content, from.offset, to.offset)
  return slice.children.map((child) => child.textContent).join('')
}

/**
 * Insert an inline formula at the caret. A non-empty text selection is taken
 * as the source, selecting `E=mc^2` and hitting the math button turns that
 * text into the formula rather than discarding it, so `latex` is only the
 * starting point for an empty selection.
 */
export function insertMath(latex = ''): Command {
  return (state) => {
    if (!state.schema.nodes[MATH_NODE]) return null
    const selected = selectedText(state).trim()
    return insertInlineNode(MATH_NODE, { latex: selected.length > 0 ? selected : latex })(state)
  }
}

/** Where a display formula goes: at child index `from`, displacing `[from, to)`. */
interface InsertionPoint {
  readonly parentPath: Path
  readonly from: number
  readonly to: number
}

/**
 * An empty paragraph at the caret is a placeholder the user is about to
 * fill, so the formula takes its place; any other block is content, so the
 * formula goes after it.
 */
function insertionPoint(state: EditorState): InsertionPoint | null {
  const selection = state.selection
  if (selection instanceof NodeSelection) {
    const after = selection.index + 1
    return { parentPath: selection.parentPath, from: after, to: after }
  }
  const blockPath = selection.to.path
  if (blockPath.length === 0) return null
  const parentPath = blockPath.slice(0, -1)
  const index = blockPath[blockPath.length - 1] as number
  const block = nodeAtPath(state.doc, blockPath)
  if (!block) return null
  const replaceable =
    block.isTextblock && block.type.name === 'paragraph' && inlineLength(block.content) === 0
  return replaceable
    ? { parentPath, from: index, to: index + 1 }
    : { parentPath, from: index + 1, to: index + 1 }
}

/**
 * Insert a display formula as its own block and select it, so the equation
 * editor opens on the node that was just created.
 */
export function insertMathBlock(latex = ''): Command {
  return (state) => {
    const type = state.schema.nodes[MATH_BLOCK_NODE]
    if (!type) return null
    const point = insertionPoint(state)
    if (!point) return null
    const tr = state.tr
    tr.step(
      new ReplaceNodesStep(
        point.parentPath,
        point.from,
        point.to,
        Fragment.of(type.create({ latex })),
      ),
    )
    tr.setSelection(new NodeSelection([...point.parentPath, point.from]))
    return tr
  }
}

/**
 * Rewrite the source of the formula at the selection: what an equation
 * editor's "apply" does. Attributes are replaced wholesale rather than
 * re-created, so the node keeps its identity and the selection survives.
 */
export function setMathLatex(latex: string): Command {
  return (state) => {
    const hit = findMathAt(state)
    if (!hit) return null
    const tr = state.tr
    tr.step(new SetNodeAttrsStep(hit.path, { ...hit.node.attrs, latex }))
    return tr
  }
}

/** Remove the formula at the selection, leaving the caret where it stood. */
export const deleteMath: Command = (state) => {
  const hit = findMathAt(state)
  if (!hit) return null
  const parentPath = hit.path.slice(0, -1)
  const index = hit.path[hit.path.length - 1] as number
  const tr = state.tr
  if (hit.range) {
    tr.step(new ReplaceInlineStep(parentPath, hit.range.from, hit.range.to, Fragment.empty))
    tr.setSelection(new TextSelection(pos(parentPath, hit.range.from)))
    return tr
  }
  tr.step(new ReplaceNodesStep(parentPath, index, index + 1, Fragment.empty))
  return tr
}
