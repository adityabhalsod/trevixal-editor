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
  type Transaction,
  inlineSize,
  insertInlineNode,
  nodeAtPath,
  pos,
  selectionNear,
} from '@trevixal/core'
import {
  type CitationStyle,
  DEFAULT_CITATION_STYLE,
  type ImportedSource,
  citationLabel,
  formatReference,
  isCitationStyle,
  parseSource,
  referenceSortKey,
} from './citation-styles'
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

    const style = citationStyleOf(state.doc)
    const source =
      existingIndex >= 0 ? parseSource(existing?.list.child(existingIndex).attrs.source) : null
    const label = citationLabel(source, style, position)
    const tr = insertInlineNode('citation', { id: referenceId, label })(state)
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
  const list = referenceList(state.doc)
  const tr = state.tr
  if (!relabelCitations(tr, list ? labelsOf(list.list) : new Map())) return null
  // Swapping atoms never moves the caret, so the selection is kept as is.
  tr.setSelection(state.selection)
  return tr
}

/** Each entry's in-text label, in its list's style, by the entry's id. */
function labelsOf(list: EditorNode): Map<string, string> {
  const style = isCitationStyle(list.attrs.style) ? list.attrs.style : DEFAULT_CITATION_STYLE
  const labels = new Map<string, string>()
  list.content.children.forEach((item, index) => {
    const id = item.attrs.id
    if (typeof id === 'string' && !labels.has(id)) {
      labels.set(id, citationLabel(parseSource(item.attrs.source), style, index))
    }
  })
  return labels
}

/**
 * Give every citation in `tr`'s document its label from `labels`; one whose
 * entry is gone reads `?`. Whether anything changed.
 */
function relabelCitations(tr: Transaction, labels: ReadonlyMap<string, string>): boolean {
  let changed = false
  const visit = (node: EditorNode, path: Path): void => {
    if (node.isTextblock) {
      let offset = 0
      for (const child of node.content.children) {
        const size = inlineSize(child)
        if (child.type.name === 'citation') {
          const label = labels.get(child.attrs.id as string) ?? '?'
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
  visit(tr.doc, [])
  return changed
}

/** The style the document's reference list is in; IEEE when it has none. */
export function citationStyleOf(doc: EditorNode): CitationStyle {
  const style = referenceList(doc)?.list.attrs.style
  return isCitationStyle(style) ? style : DEFAULT_CITATION_STYLE
}

/** The ids of the entries in the order the text first cites them. */
function citationOrder(doc: EditorNode): string[] {
  const order: string[] = []
  const visit = (node: EditorNode): void => {
    if (node.type.name === 'citation' && typeof node.attrs.id === 'string') {
      if (!order.includes(node.attrs.id)) order.push(node.attrs.id)
      return
    }
    for (const child of node.content.children) visit(child)
  }
  visit(doc)
  return order
}

/**
 * Set the reference list in a style. An author-date style (APA, MLA,
 * Chicago) puts its entries in author order; IEEE numbers them in the order
 * the text cites them. Every entry with details is written out again, and
 * every citation gets its new label, in one undoable step. An entry typed
 * by hand, with no details, keeps its words.
 */
export function setCitationStyle(style: CitationStyle): Command {
  return (state) => {
    const found = referenceList(state.doc)
    if (!found) return null
    const schema = state.schema
    const items = [...found.list.content.children]
    const cited = citationOrder(state.doc)
    const rank = (item: EditorNode): number => {
      const at = cited.indexOf(item.attrs.id as string)
      return at < 0 ? cited.length + items.indexOf(item) : at
    }
    const ordered =
      style === 'ieee'
        ? items.sort((a, b) => rank(a) - rank(b))
        : items.sort((a, b) =>
            referenceSortKey(parseSource(a.attrs.source), a.textContent).localeCompare(
              referenceSortKey(parseSource(b.attrs.source), b.textContent),
            ),
          )
    const written = ordered.map((item) => {
      const source = parseSource(item.attrs.source)
      if (!source) return item
      return item.type.create(item.attrs, Fragment.of(schema.text(formatReference(source, style))))
    })
    const list = found.list.type.create({ ...found.list.attrs, style }, Fragment.from(written))
    const tr = state.tr
    tr.step(new ReplaceNodesStep([], found.index, found.index + 1, Fragment.of(list)))
    relabelCitations(tr, labelsOf(list))
    tr.setSelection(selectionNear(tr.doc, state.selection.from))
    return tr
  }
}

/**
 * Add sources to the reference list, written out in its style, and start a
 * list at the end of the document when there is none. A source whose id is
 * already an entry is left alone, so importing the same file twice adds
 * nothing the second time.
 */
export function importSources(sources: readonly ImportedSource[]): Command {
  return (state) => {
    const schema = state.schema
    const found = referenceList(state.doc)
    const style = found ? citationStyleOf(state.doc) : DEFAULT_CITATION_STYLE
    const taken = new Set(found?.list.content.children.map((item) => item.attrs.id) ?? [])
    const items: EditorNode[] = []
    for (const { id, source } of sources) {
      const safe = safeAnchorId(id.replace(/[^A-Za-z0-9_-]/g, '-'))
      if (!safe || taken.has(safe)) continue
      taken.add(safe)
      items.push(
        schema
          .nodeType('referenceItem')
          .create(
            { id: safe, source: JSON.stringify(source) },
            Fragment.of(schema.text(formatReference(source, style))),
          ),
      )
    }
    if (items.length === 0) return null
    const tr = state.tr
    if (found) {
      const end = found.list.childCount
      tr.step(new ReplaceNodesStep([found.index], end, end, Fragment.from(items)))
    } else {
      const list = schema.nodeType('referenceList').create(undefined, Fragment.from(items))
      const at = state.doc.childCount
      tr.step(new ReplaceNodesStep([], at, at, Fragment.of(list)))
    }
    return tr
  }
}

/** The entries a citation can point at: each id, with its text to pick it by. */
export function referenceChoices(doc: EditorNode): readonly { id: string; label: string }[] {
  return (referenceList(doc)?.list.content.children ?? []).flatMap((item) =>
    typeof item.attrs.id === 'string'
      ? [{ id: item.attrs.id, label: item.textContent.slice(0, 80) || item.attrs.id }]
      : [],
  )
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
