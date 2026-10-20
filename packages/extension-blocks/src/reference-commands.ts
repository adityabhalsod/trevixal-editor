import {
  type Command,
  type EditorNode,
  type EditorState,
  Fragment,
  NodeSelection,
  type Path,
  ReplaceNodesStep,
  SetNodeAttrsStep,
  TextSelection,
  blocksInRange,
  inlineLength,
  insertInlineNode,
  mergeInline,
  nodeAtPath,
  pos,
  safeElementId,
  setMark,
  sliceInline,
} from '@trevixal/core'
import { type ReferenceTarget, documentIds, freshId } from './fields'
import {
  acceptsBlock,
  emptyParagraph,
  findAncestor,
  findChildIndex,
  insertBlockHere,
} from './helpers'
import { safeAnchorId } from './ids'
import { type CaptionKind, type CrossReferenceFormat, captionKind, indexWords } from './references'

/** Where a caption goes relative to what it captions. */
export type CaptionPosition = 'above' | 'below'

export interface CaptionOptions {
  /** The words before the number, in the document's language: "Figure", "Table". */
  readonly label: string
  /** The caption's own text, after the number. */
  readonly text?: string
  /** Word's default: tables are captioned above, everything else below. */
  readonly position?: CaptionPosition
}

const CAPTION_PREFIX: Readonly<Record<CaptionKind, string>> = {
  figure: 'fig',
  table: 'tab',
  equation: 'eq',
}

/** A caption's inline content: "Figure", the number, and the text after it. */
function captionContent(
  state: EditorState,
  kind: CaptionKind,
  options: CaptionOptions,
): EditorNode[] {
  const schema = state.schema
  const id = freshId(CAPTION_PREFIX[kind], documentIds(state.doc))
  const label = options.label.trim()
  const text = options.text?.trim() ?? ''
  const content: EditorNode[] = []
  if (label) content.push(schema.text(`${label} `))
  content.push(schema.nodeType('captionNumber').create({ kind, id }))
  if (text) content.push(schema.text(`: ${text}`))
  return content
}

/** The figure the selection is on or in, if the schema has figures. */
function figureAt(state: EditorState): { path: Path; node: EditorNode } | { image: Path } | null {
  if (!state.schema.nodes.figure) return null
  const selection = state.selection
  const path = selection instanceof NodeSelection ? selection.path : selection.from.path
  const figure = findAncestor(state.doc, path, 'figure')
  if (figure) return figure
  const node = nodeAtPath(state.doc, path)
  return node?.type.name === 'image' ? { image: path } : null
}

/** The block-level node a caption should sit beside: a table, an equation, or the current block. */
function blockToCaption(state: EditorState): Path | null {
  const selection = state.selection
  if (selection instanceof NodeSelection) return selection.path
  return findAncestor(state.doc, selection.from.path, 'table')?.path ?? null
}

/**
 * Insert a numbered caption for what the selection is on: into an image's
 * figure (wrapping a bare image in one), above or below a table, below an
 * equation, or as a caption paragraph after the current block. The number is
 * a field, filled in by the field updater; the caret lands after the caption.
 */
export function insertCaption(kindValue: CaptionKind, options: CaptionOptions): Command {
  return (state) => {
    const kind = captionKind(kindValue)
    const schema = state.schema
    if (!schema.nodes.captionNumber) return null
    const content = captionContent(state, kind, options)
    const tr = state.tr

    const figure = kind === 'figure' ? figureAt(state) : null
    if (figure && 'image' in figure) {
      const image = nodeAtPath(state.doc, figure.image)
      const caption = schema.nodeType('caption').create(undefined, Fragment.from(content))
      if (!image) return null
      const parentPath = figure.image.slice(0, -1)
      const index = figure.image[figure.image.length - 1] as number
      const wrapped = schema.nodeType('figure').create(undefined, Fragment.of(image, caption))
      tr.step(new ReplaceNodesStep(parentPath, index, index + 1, Fragment.of(wrapped)))
      const captionPath = [...figure.image, 1]
      return tr.setSelection(new TextSelection(pos(captionPath, inlineLength(caption.content))))
    }
    if (figure) {
      const existing = figure.node.content.children.findIndex(
        (child) => child.type.name === 'caption',
      )
      if (existing >= 0) {
        const caption = figure.node.child(existing)
        // A caption already numbered stays as it is: a second number would
        // make one figure two.
        if (caption.content.children.some((child) => child.type.name === 'captionNumber'))
          return null
        const text = caption.content.childCount > 0 ? [schema.text(': ')] : []
        const merged = mergeInline(
          Fragment.from([...content, ...text, ...caption.content.children]),
        )
        const captionPath = [...figure.path, existing]
        tr.step(
          new ReplaceNodesStep(
            figure.path,
            existing,
            existing + 1,
            Fragment.of(caption.withContent(merged)),
          ),
        )
        const numbered = nodeAtPath(tr.doc, captionPath)
        return tr.setSelection(
          new TextSelection(pos(captionPath, inlineLength(numbered?.content ?? Fragment.empty))),
        )
      }
      const caption = schema.nodeType('caption').create(undefined, Fragment.from(content))
      const at = figure.node.childCount
      tr.step(new ReplaceNodesStep(figure.path, at, at, Fragment.of(caption)))
      return tr.setSelection(
        new TextSelection(pos([...figure.path, at], inlineLength(caption.content))),
      )
    }

    const paragraph = schema.firstTextblockType().create(undefined, Fragment.from(content))
    const beside = blockToCaption(state)
    if (beside) {
      const above = (options.position ?? (kind === 'table' ? 'above' : 'below')) === 'above'
      // Beside the nearest block with room for a paragraph next to it: an
      // image in a figure is captioned beside the figure, not inside it.
      for (let path = beside; path.length > 0; path = path.slice(0, -1)) {
        const parentPath = path.slice(0, -1)
        const parent = nodeAtPath(state.doc, parentPath)
        const index = (path[path.length - 1] as number) + (above ? 0 : 1)
        if (!parent || !acceptsBlock(parent, index, index, paragraph)) continue
        tr.step(new ReplaceNodesStep(parentPath, index, index, Fragment.of(paragraph)))
        return tr.setSelection(
          new TextSelection(pos([...parentPath, index], inlineLength(paragraph.content))),
        )
      }
      return null
    }
    const placed = insertBlockHere(state, paragraph)
    if (!placed) return null
    return placed.tr.setSelection(
      new TextSelection(pos(placed.path, inlineLength(paragraph.content))),
    )
  }
}

/** A heading's text as an id: `2-results`, lower case and dashed, always starting with a letter. */
function slugFor(text: string): string {
  const slug = text
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return /^[a-z]/.test(slug) && !slug.startsWith('tvx-') ? slug : `h-${slug || 'heading'}`
}

/**
 * Insert a cross-reference to `target` at the selection. A heading nothing
 * has pointed at yet is given an id from its text first; its reference then
 * reads whatever the field updater computes for the format, now and after
 * every renumbering.
 */
export function insertCrossReference(
  target: Pick<ReferenceTarget, 'id' | 'path'>,
  format: CrossReferenceFormat,
): Command {
  return (state) => {
    if (!state.schema.nodes.crossReference) return null
    let id = target.id
    const found = id === null ? nodeAtPath(state.doc, target.path) : null
    // A heading given an id since the target was listed keeps that one.
    if (found?.type.name === 'heading' && safeElementId(found.attrs.id))
      id = found.attrs.id as string
    const heading = id === null ? found : null
    if (id === null) {
      if (heading?.type.name !== 'heading') return null
      const taken = documentIds(state.doc)
      const base = slugFor(heading.textContent)
      id = base
      for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
    }
    if (!safeElementId(id)) return null
    const tr = insertInlineNode('crossReference', { target: id, format, text: '' })(state)
    if (!tr) return null
    if (heading) {
      // Replacing a selection that spans blocks joins them first, which can
      // move the heading up; it is found where the edit has taken it.
      const index = target.path[target.path.length - 1] as number
      const moved = tr.mapPosition(pos(target.path.slice(0, -1), index), 1)
      const path = [...moved.path, moved.offset]
      const current = nodeAtPath(tr.doc, path)
      if (current?.type.name !== 'heading' || current.textContent !== heading.textContent) {
        return null
      }
      tr.step(new SetNodeAttrsStep(path, { ...current.attrs, id }))
    }
    return tr
  }
}

/** Insert a table of figures (or of tables, or equations) after the current block. */
export function insertCaptionList(kind: CaptionKind): Command {
  return (state) => {
    const type = state.schema.nodes.captionList
    if (!type) return null
    return insertBlockHere(state, type.create({ kind: captionKind(kind) }))?.tr ?? null
  }
}

/** Insert the index after the current block. */
export const insertDocumentIndex: Command = (state) => {
  const type = state.schema.nodes.documentIndex
  if (!type) return null
  return insertBlockHere(state, type.create())?.tr ?? null
}

export interface IndexEntryOptions {
  /** What the entry is filed under; the selected words when left out. */
  readonly entry?: string
  /** A subentry under it: "red" under "apple". */
  readonly sub?: string
}

/** Mark the selected words as an index entry, as Word's Mark Index Entry does. */
export function markIndexEntry(options: IndexEntryOptions = {}): Command {
  return (state) => {
    const selection = state.selection
    if (!state.schema.marks.indexTerm || selection.empty || !(selection instanceof TextSelection)) {
      return null
    }
    const taken = new Set<string>()
    const collect = (node: EditorNode): void => {
      for (const mark of node.marks) {
        if (mark.type.name === 'indexTerm' && typeof mark.attrs.id === 'string') {
          taken.add(mark.attrs.id)
        }
      }
      for (const child of node.content.children) collect(child)
    }
    collect(state.doc)
    // Filed under the words as they are now, as Word writes them into its XE
    // field: typing on after the marked words, which the mark then covers
    // too, does not re-file the entry under everything typed.
    const words = blocksInRange(state.doc, selection.from, selection.to)
      .filter((block) => block.node.isTextblock)
      .map((block) => block.node.withContent(sliceInline(block.node.content, block.from, block.to)))
      .map((block) => block.textContent)
      .join(' ')
    return setMark('indexTerm', {
      id: freshId('xe', taken),
      entry: indexWords(options.entry) ?? indexWords(words),
      sub: indexWords(options.sub),
    })(state)
  }
}

/** The ids the endnote list's items have. */
function endnoteIds(doc: EditorNode): Set<string> {
  const taken = new Set<string>()
  const listIndex = findChildIndex(doc, 'endnoteList')
  if (listIndex !== null) {
    for (const item of doc.child(listIndex).content.children) {
      if (typeof item.attrs.id === 'string') taken.add(item.attrs.id)
    }
  }
  return taken
}

/** The lowest positive integer id no endnote item has yet. */
function nextEndnoteId(doc: EditorNode): string {
  const taken = endnoteIds(doc)
  let n = 1
  while (taken.has(String(n))) n++
  return String(n)
}

/**
 * Insert an endnote: its reference at the caret and its body in the endnote
 * list, created at the very end of the document the first time. It mirrors
 * {@link insertFootnote}; the two lists keep that order, footnotes first.
 */
export function insertEndnote(id?: string): Command {
  return (state) => {
    const schema = state.schema
    if (!schema.nodes.endnoteRef) return null
    if (findAncestor(state.doc, state.selection.from.path, 'endnoteList')) return null
    const endnoteId = id === undefined ? nextEndnoteId(state.doc) : safeAnchorId(id)
    if (!endnoteId) return null
    // A duplicate id would make two refs point at one item, decline.
    if (id !== undefined && endnoteIds(state.doc).has(endnoteId)) return null
    const tr = insertInlineNode('endnoteRef', { id: endnoteId })(state)
    if (!tr) return null
    const item = schema
      .nodeType('endnoteItem')
      .create({ id: endnoteId }, Fragment.of(emptyParagraph(schema)))
    const listIndex = findChildIndex(tr.doc, 'endnoteList')
    if (listIndex === null) {
      const list = schema.nodeType('endnoteList').create(undefined, Fragment.of(item))
      const at = tr.doc.childCount
      tr.step(new ReplaceNodesStep([], at, at, Fragment.of(list)))
    } else {
      const list = tr.doc.child(listIndex)
      tr.step(
        new ReplaceNodesStep([listIndex], list.childCount, list.childCount, Fragment.of(item)),
      )
    }
    return tr
  }
}
