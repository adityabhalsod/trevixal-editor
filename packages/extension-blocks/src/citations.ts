import {
  type Command,
  type EditorNode,
  Fragment,
  type Path,
  ReplaceInlineStep,
  ReplaceNodesStep,
  SetNodeAttrsStep,
  SplitNodeStep,
  TextSelection,
  inlineSize,
  insertInlineNode,
  nodeAtPath,
  pos,
} from '@trevixal/core'
import { findAncestor, findChildIndex } from './helpers'
import { safeAnchorId } from './schema'

/** A reference item located in the document's reference list. */
export interface ReferenceMatch {
  readonly item: EditorNode
  readonly path: Path
  /** Zero-based position in the list; the citation label is `index + 1`. */
  readonly index: number
}

/** The reference list a citation resolves against: the first one in the document. */
function referenceList(doc: EditorNode): { list: EditorNode; index: number } | null {
  const index = findChildIndex(doc, 'referenceList')
  if (index === null) return null
  return { list: doc.child(index), index }
}

/** The reference item a citation points at, or null when none carries its id. */
export function referenceFor(doc: EditorNode, citation: EditorNode): ReferenceMatch | null {
  const id = citation.attrs.id
  if (typeof id !== 'string') return null
  const found = referenceList(doc)
  if (!found) return null
  for (let i = 0; i < found.list.childCount; i++) {
    const item = found.list.child(i)
    if (item.attrs.id === id) return { item, path: [found.index, i], index: i }
  }
  return null
}

/** The lowest `ref<n>` not already used by a reference item. */
function nextReferenceId(doc: EditorNode): string {
  const taken = new Set<string>()
  const found = referenceList(doc)
  if (found) {
    for (const item of found.list.content.children) {
      if (typeof item.attrs.id === 'string') taken.add(item.attrs.id)
    }
  }
  let n = 1
  while (taken.has(`ref${n}`)) n++
  return `ref${n}`
}

/**
 * Cite a source: a numbered marker at the cursor plus its entry in the
 * reference list, which is created at the end of the document when this is
 * the first citation. The label is the entry's 1-based position. An explicit
 * `id` is validated (fragment-safe or the command declines); when it already
 * names an entry, the new marker cites that entry and `text` is ignored, so
 * one source can be cited many times.
 */
export function insertCitation(text?: string, id?: string): Command {
  return (state) => {
    const schema = state.schema
    // A citation inside the reference list would cite from within the
    // apparatus it points at; decline rather than tangle the two.
    if (findAncestor(state.doc, state.selection.from.path, 'referenceList')) return null
    const referenceId = id === undefined ? nextReferenceId(state.doc) : safeAnchorId(id)
    if (!referenceId) return null

    const existing = referenceList(state.doc)
    const existingIndex = existing
      ? existing.list.content.children.findIndex((item) => item.attrs.id === referenceId)
      : -1
    const position = existingIndex >= 0 ? existingIndex : existing ? existing.list.childCount : 0

    const tr = insertInlineNode('citation', { id: referenceId, label: String(position + 1) })(state)
    if (!tr) return null
    if (existingIndex >= 0) return tr

    const item = schema
      .nodeType('referenceItem')
      .create({ id: referenceId }, text ? Fragment.of(schema.text(text)) : undefined)
    if (!existing) {
      const list = schema.nodeType('referenceList').create(undefined, Fragment.of(item))
      const at = tr.doc.childCount
      tr.step(new ReplaceNodesStep([], at, at, Fragment.of(list)))
    } else {
      const list = tr.doc.child(existing.index)
      tr.step(
        new ReplaceNodesStep([existing.index], list.childCount, list.childCount, Fragment.of(item)),
      )
    }
    return tr
  }
}

/**
 * Add an empty reference list at the end of the document and put the cursor
 * in its first entry. Declines when the document already has one.
 */
export const insertReferenceList: Command = (state) => {
  if (referenceList(state.doc)) return null
  const schema = state.schema
  const item = schema.nodeType('referenceItem').create({ id: nextReferenceId(state.doc) })
  const list = schema.nodeType('referenceList').create(undefined, Fragment.of(item))
  const at = state.doc.childCount
  const tr = state.tr
  tr.step(new ReplaceNodesStep([], at, at, Fragment.of(list)))
  tr.setSelection(new TextSelection(pos([at, 0], 0)))
  return tr
}

/**
 * Bring every citation's label back in line with its entry's position in the
 * reference list, after entries were reordered or removed. A citation whose
 * entry is gone reads `?`. Declines when every label is already right.
 */
export const renumberCitations: Command = (state) => {
  const doc = state.doc
  const list = referenceList(doc)
  const positions = new Map<string, number>()
  if (list) {
    for (let i = 0; i < list.list.childCount; i++) {
      const id = list.list.child(i).attrs.id
      if (typeof id === 'string' && !positions.has(id)) positions.set(id, i + 1)
    }
  }
  const tr = state.tr
  let changed = false
  const visit = (node: EditorNode, path: Path): void => {
    if (node.isTextblock) {
      let offset = 0
      for (const child of node.content.children) {
        const size = inlineSize(child)
        if (child.type.name === 'citation') {
          const at = positions.get(child.attrs.id as string)
          const label = at === undefined ? '?' : String(at)
          if (child.attrs.label !== label) {
            // An atom swapped for an atom keeps every later offset intact, so
            // the offsets computed from the original block stay valid.
            tr.step(
              new ReplaceInlineStep(
                path,
                offset,
                offset + size,
                Fragment.of(child.type.create({ ...child.attrs, label })),
              ),
            )
            changed = true
          }
        }
        offset += size
      }
      return
    }
    for (let i = 0; i < node.childCount; i++) visit(node.child(i), [...path, i])
  }
  visit(doc, [])
  if (!changed) return null
  // Swapping atoms never moves the caret, so the selection is kept as is.
  tr.setSelection(state.selection)
  return tr
}

/**
 * Enter inside a reference entry splits it into two entries, the second one
 * carrying a freshly allocated id.
 *
 * Core's `splitBlock` cannot do this safely here: mid-entry it clones the
 * entry's id, leaving two entries answering to one citation (and the second
 * unreachable, since `referenceFor` and `renumberCitations` both take the
 * first match), and at the end of an entry it starts a paragraph, which a
 * `referenceItem+` list cannot hold at all.
 *
 * Declines outside a reference entry, and for a selection spanning two blocks,
 * which is not this command's business.
 */
export const splitReferenceItem: Command = (state) => {
  const { from, to } = state.selection
  const block = nodeAtPath(state.doc, from.path)
  if (block?.type.name !== 'referenceItem') return null
  if (from.path.length !== to.path.length || from.path.some((step, i) => step !== to.path[i])) {
    return null
  }
  const listPath = from.path.slice(0, -1)
  const at = (from.path[from.path.length - 1] as number) + 1
  // The id is allocated from the document as it stands, so it cannot collide
  // with the clone the split is about to make.
  const id = nextReferenceId(state.doc)
  const tr = state.tr
  if (!state.selection.empty) {
    tr.step(new ReplaceInlineStep(from.path, from.offset, to.offset, Fragment.empty))
  }
  tr.step(new SplitNodeStep(from.path, from.offset))
  tr.step(new SetNodeAttrsStep([...listPath, at], { ...block.attrs, id }))
  tr.setSelection(new TextSelection(pos([...listPath, at], 0)))
  return tr
}

/** The citation node at `path`/`offset`, when the inline child there is one. */
export function citationAt(doc: EditorNode, path: Path, offset: number): EditorNode | null {
  const block = nodeAtPath(doc, path)
  if (!block?.isTextblock) return null
  let at = 0
  for (const child of block.content.children) {
    const size = inlineSize(child)
    if (offset >= at && offset < at + size) return child.type.name === 'citation' ? child : null
    at += size
  }
  return null
}
