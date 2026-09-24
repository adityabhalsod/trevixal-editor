import type { Attrs } from '../model/attrs'
import { attrsEq } from '../model/attrs'
import { blocksInRange } from '../model/blocks'
import { Fragment } from '../model/fragment'
import {
  coerceInlineFor,
  inlineLength,
  marksAtInlineOffset,
  nextInlineBoundary,
  previousInlineBoundary,
  rangeHasMark,
  rangesWithMark,
  sliceInline,
} from '../model/inline'
import type { Mark } from '../model/mark'
import type { EditorNode, TextNode } from '../model/node'
import { pos } from '../model/position'
import { nodeAtPath, pathsEqual } from '../model/tree'
import { MAX_INDENT, blockLayoutAttrs } from '../schema/basic'
import { followingStyle } from '../schema/named-styles'
import type { EditorState } from '../state/editor-state'
import { AllSelection, NodeSelection, TextSelection, selectionNear } from '../state/selection'
import { SetNodeAttrsStep } from '../state/steps/attrs-step'
import { AddMarkStep, RemoveMarkStep } from '../state/steps/mark-steps'
import { ReplaceInlineStep } from '../state/steps/replace-inline'
import { ReplaceNodesStep, replaceNodeAt } from '../state/steps/replace-nodes'
import { JoinNodesStep, SplitNodeStep, withoutId } from '../state/steps/split-join'
import { LiftNodesStep, WrapNodesStep } from '../state/steps/wrap-lift'
import type { Transaction } from '../state/transaction'
import { deleteRange } from './helpers'

/**
 * A command inspects a state and produces the transaction realizing it, or
 * null when it does not apply. Pure, dispatching is the caller's job.
 */
export type Command = (state: EditorState) => Transaction | null

/** Try commands in order; the first one that applies wins. */
export function chainCommands(...commands: readonly Command[]): Command {
  return (state) => {
    for (const command of commands) {
      const tr = command(state)
      if (tr) return tr
    }
    return null
  }
}

/** Insert text at the selection, replacing it, inheriting adjacent marks. */
export function insertText(text: string): Command {
  return (state) => {
    if (text.length === 0) return null
    const selection = state.selection
    if (!(selection instanceof TextSelection)) return null
    const tr = state.tr
    if (!selection.empty) deleteRange(tr, selection.from, selection.to)
    const point = selection.from
    const block = nodeAtPath(tr.doc, point.path)
    if (!block?.isTextblock) return null
    const inherited = state.storedMarks ?? marksAtInlineOffset(block.content, point.offset)
    const marks = inherited.filter((mark) => block.type.allowsMarkType(mark.type))
    tr.step(
      new ReplaceInlineStep(
        point.path,
        point.offset,
        point.offset,
        Fragment.of(state.schema.text(text, marks)),
      ),
    )
    tr.setSelection(new TextSelection(pos(point.path, point.offset + text.length)))
    return tr
  }
}

/** Delete the selected content. */
export const deleteSelection: Command = (state) => {
  const selection = state.selection
  if (selection.empty) return null
  const tr = state.tr
  if (selection instanceof AllSelection) {
    const paragraph = state.schema.firstTextblockType().create()
    tr.step(new ReplaceNodesStep([], 0, state.doc.childCount, Fragment.of(paragraph)))
    tr.setSelection(new TextSelection(pos([0], 0)))
    return tr
  }
  if (selection instanceof NodeSelection) {
    tr.step(
      new ReplaceNodesStep(
        selection.parentPath,
        selection.index,
        selection.index + 1,
        Fragment.empty,
      ),
    )
    tr.setSelection(selectionNear(tr.doc, selection.from))
    return tr
  }
  deleteRange(tr, selection.from, selection.to)
  tr.setSelection(new TextSelection(selection.from))
  return tr
}

/** Toggle a mark on the selection, or on the stored marks at a cursor. */
export function toggleMark(name: string, attrs?: Attrs): Command {
  return (state) => {
    const type = state.schema.markType(name)
    const mark = type.create(attrs)
    const selection = state.selection

    if (selection.empty && selection instanceof TextSelection) {
      const block = nodeAtPath(state.doc, selection.head.path)
      if (!block?.isTextblock || !block.type.allowsMarkType(type)) return null
      const current = state.storedMarks ?? marksAtInlineOffset(block.content, selection.head.offset)
      const active = current.some((candidate) => candidate.type === type)
      const next = active
        ? current.filter((candidate) => candidate.type !== type)
        : mark.addToSet(current)
      return state.tr.setStoredMarks(next)
    }

    const blocks = blocksInRange(state.doc, selection.from, selection.to).filter(
      (block) => block.from < block.to && block.node.type.allowsMarkType(type),
    )
    if (blocks.length === 0) return null
    const active = blocks.every((block) =>
      rangeHasMark(block.node.content, block.from, block.to, type),
    )
    const tr = state.tr
    for (const block of blocks) {
      if (active) {
        for (const range of rangesWithMark(block.node.content, block.from, block.to, type)) {
          tr.step(new RemoveMarkStep(block.path, range.from, range.to, range.mark))
        }
      } else {
        tr.step(new AddMarkStep(block.path, block.from, block.to, mark))
      }
    }
    return tr.docChanged ? tr : null
  }
}

/** Change every textblock touched by the selection to the given type. */
export function setBlockType(name: string, attrs?: Attrs): Command {
  return (state) => {
    const type = state.schema.nodeType(name)
    if (!type.inlineContent) return null
    const selection = state.selection
    const tr = state.tr
    let changed = false
    for (const block of blocksInRange(state.doc, selection.from, selection.to)) {
      const replacement = type.create(attrs, block.node.content)
      if (block.node.type === type && attrsEq(block.node.attrs, replacement.attrs)) continue
      tr.step(replaceNodeAt(block.path, Fragment.of(replacement)))
      changed = true
    }
    if (!changed) return null
    // Node replacement degrades interior positions; the shape is unchanged,
    // so the original selection is still valid, restate it explicitly.
    tr.setSelection(selection)
    return tr
  }
}

/**
 * Apply a mark with specific attributes, replacing any existing mark of the
 * same type in the range. Unlike {@link toggleMark} this is idempotent,
 * picking the same font size twice keeps it set.
 */
export function setMark(name: string, attrs: Attrs): Command {
  return (state) => {
    const type = state.schema.markType(name)
    const mark = type.create(attrs)
    const selection = state.selection

    if (selection.empty && selection instanceof TextSelection) {
      const block = nodeAtPath(state.doc, selection.head.path)
      if (!block?.isTextblock || !block.type.allowsMarkType(type)) return null
      const current = state.storedMarks ?? marksAtInlineOffset(block.content, selection.head.offset)
      return state.tr.setStoredMarks(mark.addToSet(current))
    }

    const blocks = blocksInRange(state.doc, selection.from, selection.to).filter(
      (block) => block.from < block.to && block.node.type.allowsMarkType(type),
    )
    if (blocks.length === 0) return null
    const tr = state.tr
    for (const block of blocks) {
      // Clear the old value first so attributes replace rather than stack.
      for (const range of rangesWithMark(block.node.content, block.from, block.to, type)) {
        tr.step(new RemoveMarkStep(block.path, range.from, range.to, range.mark))
      }
      tr.step(new AddMarkStep(block.path, block.from, block.to, mark))
    }
    return tr.docChanged ? tr : null
  }
}

/** Remove every mark of a type from the selection (or the stored marks). */
export function unsetMark(name: string): Command {
  return (state) => {
    const type = state.schema.markType(name)
    const selection = state.selection

    if (selection.empty && selection instanceof TextSelection) {
      const block = nodeAtPath(state.doc, selection.head.path)
      if (!block?.isTextblock) return null
      const current = state.storedMarks ?? marksAtInlineOffset(block.content, selection.head.offset)
      const next = current.filter((candidate) => candidate.type !== type)
      return next.length === current.length ? null : state.tr.setStoredMarks(next)
    }

    const tr = state.tr
    for (const block of blocksInRange(state.doc, selection.from, selection.to)) {
      if (block.from >= block.to) continue
      for (const range of rangesWithMark(block.node.content, block.from, block.to, type)) {
        tr.step(new RemoveMarkStep(block.path, range.from, range.to, range.mark))
      }
    }
    return tr.docChanged ? tr : null
  }
}

/** Strip every mark from the selection ("clear formatting"). */
export const clearFormatting: Command = (state) => {
  const selection = state.selection
  const tr = state.tr
  for (const block of blocksInRange(state.doc, selection.from, selection.to)) {
    if (block.from >= block.to) continue
    for (const type of Object.values(state.schema.marks)) {
      for (const range of rangesWithMark(block.node.content, block.from, block.to, type)) {
        tr.step(new RemoveMarkStep(block.path, range.from, range.to, range.mark))
      }
    }
  }
  return tr.docChanged ? tr : null
}

/**
 * Reset the paragraph-level layout: alignment, indent, line height and
 * spacing, on every block in the selection, leaving the text and its marks
 * alone. The counterpart of {@link clearFormatting}, which strips marks only.
 */
export const clearBlockFormatting: Command = (state) => {
  const tr = state.tr
  const defaults = blockLayoutAttrs()
  for (const block of blocksInRange(state.doc, state.selection.from, state.selection.to)) {
    const attrs = block.node.attrs
    const next: Record<string, unknown> = { ...attrs }
    for (const [name, spec] of Object.entries(defaults)) {
      if (name in next) next[name] = spec.default ?? null
    }
    if (attrsEq(attrs, next)) continue
    tr.step(new SetNodeAttrsStep(block.path, next))
  }
  return tr.docChanged ? tr : null
}

/** Strip marks and reset block layout in one undoable step. */
export const clearAllFormatting: Command = (state) => {
  const marks = clearFormatting(state)
  const layout = clearBlockFormatting(marks ? state.apply(marks) : state)
  if (!marks) return layout
  if (!layout) return marks
  // Removing marks leaves every block where it was, so the layout steps
  // apply unchanged on top of the mark steps.
  for (const step of layout.steps) marks.step(step)
  return marks
}

/**
 * Merge attributes into every block touched by the selection, keeping each
 * block's own type (alignment and indent apply to headings and paragraphs
 * alike).
 */
export function setBlockAttrs(attrs: Attrs): Command {
  return (state) => {
    const selection = state.selection
    const tr = state.tr
    for (const block of blocksInRange(state.doc, selection.from, selection.to)) {
      const next = { ...block.node.attrs, ...attrs }
      if (attrsEq(block.node.attrs, next)) continue
      tr.step(new SetNodeAttrsStep(block.path, next))
    }
    return tr.docChanged ? tr : null
  }
}

/** Set text alignment on the selected blocks; `null` clears it. */
export function setTextAlign(align: 'left' | 'center' | 'right' | 'justify' | null): Command {
  return setBlockAttrs({ align })
}

/** Step the selected blocks' indent by `delta`, clamped to the schema range. */
export function indentBlocks(delta: number): Command {
  return (state) => {
    const selection = state.selection
    const tr = state.tr
    for (const block of blocksInRange(state.doc, selection.from, selection.to)) {
      const current = typeof block.node.attrs.indent === 'number' ? block.node.attrs.indent : 0
      const next = Math.min(MAX_INDENT, Math.max(0, current + delta))
      if (next === current) continue
      tr.step(new SetNodeAttrsStep(block.path, { ...block.node.attrs, indent: next }))
    }
    return tr.docChanged ? tr : null
  }
}

/**
 * Set the line height on the selected blocks; `null` clears it. A bare number
 * is a multiplier of the font size, which is why it is stored as-is rather
 * than normalized to a length.
 */
export function setLineHeight(value: string | number | null): Command {
  return setBlockAttrs({ lineHeight: value === null ? null : String(value) })
}

/**
 * Set the space above and/or below the selected blocks. Only the keys present
 * in `opts` are touched, so spacing before and after can be set independently.
 */
export function setParagraphSpacing(opts: {
  before?: string | null
  after?: string | null
}): Command {
  const attrs: Record<string, unknown> = {}
  if ('before' in opts) attrs.spaceBefore = opts.before ?? null
  if ('after' in opts) attrs.spaceAfter = opts.after ?? null
  return (state) => (Object.keys(attrs).length === 0 ? null : setBlockAttrs(attrs)(state))
}

/** Apply letter spacing to the selection; `null` removes the mark. */
export function setLetterSpacing(spacing: string | null): Command {
  return spacing === null ? unsetMark('letterSpacing') : setMark('letterSpacing', { spacing })
}

/** Toggle small caps on the selection. */
export const toggleSmallCaps: Command = toggleMark('smallCaps')

/** How {@link convertCase} rewrites the selected text. */
export type CaseMode = 'upper' | 'lower' | 'title'

const WORD_CHARACTER = /[\p{L}\p{N}']/u

/**
 * Rewrite the case of the selected text. Each text node is replaced with a
 * same-length node built by {@link TextNode.withText}, so every node keeps
 * exactly the marks it had. A bold run stays bold. Title case threads a
 * "mid-word" flag across node and block boundaries so a word split by a mark
 * boundary is not capitalized twice.
 */
export function convertCase(mode: CaseMode): Command {
  return (state) => {
    const selection = state.selection
    if (selection.empty) return null
    const blocks = blocksInRange(state.doc, selection.from, selection.to).filter(
      (block) => block.from < block.to,
    )
    if (blocks.length === 0) return null

    const tr = state.tr
    // Carried across the text nodes within a block: was the previous
    // character part of a word? Only meaningful for title case. It resets at
    // every block, since a block boundary always ends a word.
    let inWord = false
    let changed = false
    // Case mapping is almost always length-preserving, but not universally
    // (German "ß" uppercases to "SS"). Track the drift so the selection is
    // only restated verbatim when it really is still valid.
    let lengthDelta = 0

    for (const block of blocks) {
      const slice = sliceInline(block.node.content, block.from, block.to)
      const out: EditorNode[] = []
      let blockChanged = false
      inWord = false
      for (const child of slice.children) {
        if (!child.isText) {
          out.push(child)
          inWord = false
          continue
        }
        const node = child as TextNode
        const next = convertText(node.text, mode, inWord)
        inWord = next.inWord
        if (next.text !== node.text) blockChanged = true
        out.push(node.withText(next.text))
        lengthDelta += next.text.length - node.text.length
      }
      if (!blockChanged) continue
      changed = true
      tr.step(new ReplaceInlineStep(block.path, block.from, block.to, Fragment.from(out)))
    }
    if (!changed) return null
    // Length-for-length in the common case, so the original range still spans
    // exactly the text the user had selected. When a case mapping did change
    // the length, let the steps map the selection instead of forcing a range
    // that no longer exists.
    if (lengthDelta === 0) tr.setSelection(selection)
    return tr
  }
}

/** Case-convert one run, reporting whether it ended mid-word. */
function convertText(
  text: string,
  mode: CaseMode,
  startsInWord: boolean,
): { text: string; inWord: boolean } {
  if (mode === 'upper') return { text: text.toUpperCase(), inWord: false }
  if (mode === 'lower') return { text: text.toLowerCase(), inWord: false }
  let inWord = startsInWord
  let out = ''
  for (const character of text) {
    const isWord = WORD_CHARACTER.test(character)
    out += isWord && !inWord ? character.toUpperCase() : character.toLowerCase()
    inWord = isWord
  }
  return { text: out, inWord }
}

/** Split the current textblock at the cursor (Enter). */
/**
 * Enter inside a block that preserves whitespace, a code block, inserts a
 * newline rather than splitting it; holding multi-line text is the whole
 * point of such a block. Two trailing newlines escape it instead, so the
 * user is never trapped: the blank line is dropped and a paragraph follows.
 */
/** Two spaces: narrow enough that deeply nested code still fits a column. */
const CODE_INDENT = '  '

/** Brackets the editor closes for you, and what closes them. */
const CODE_BRACKETS: ReadonlyMap<string, string> = new Map([
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
])
const CODE_QUOTES: ReadonlySet<string> = new Set(['"', "'", '`'])
/** Every character that opens a pair, mapped to its closer. */
const CODE_PAIRS: ReadonlyMap<string, string> = new Map([
  ...CODE_BRACKETS,
  ...[...CODE_QUOTES].map((quote): [string, string] => [quote, quote]),
])
const CODE_CLOSERS: ReadonlySet<string> = new Set(CODE_PAIRS.values())
/**
 * A pair only closes itself before one of these, or at the end of a line: in
 * the middle of a word the user is editing existing code, not opening a group.
 */
const CLOSE_BEFORE: ReadonlySet<string> = new Set([
  ';',
  ':',
  '.',
  ',',
  '=',
  ')',
  ']',
  '}',
  '>',
  ' ',
  '\t',
  '\n',
])
const CODE_WORD = /[\p{L}\p{N}_$]/u

/** The whitespace a line begins with, in full. */
function lineIndentation(text: string, lineStart: number): string {
  let end = lineStart
  while (end < text.length && (text[end] === ' ' || text[end] === '\t')) end++
  return text.slice(lineStart, end)
}

/** The preformatted textblock holding a single-block selection, or null. */
function preformattedAt(state: EditorState): EditorNode | null {
  const selection = state.selection
  if (!(selection instanceof TextSelection)) return null
  const block = nodeAtPath(state.doc, selection.from.path)
  if (!block?.isTextblock || !block.type.spec.preserveWhitespace) return null
  // A selection spanning two blocks is not an indent gesture.
  if (!pathsEqual(selection.from.path, selection.to.path)) return null
  return block
}

/** Insert literal text at an offset inside one textblock. */
function insertAt(
  tr: Transaction,
  state: EditorState,
  path: readonly number[],
  offset: number,
  text: string,
): void {
  tr.step(new ReplaceInlineStep(path, offset, offset, Fragment.from([state.schema.text(text)])))
}

/** Offsets of every line start within `[from, to]`. */
function lineStarts(text: string, from: number, to: number): number[] {
  const starts = [from]
  for (let index = from; index < to; index++) {
    if (text[index] === '\n') starts.push(index + 1)
  }
  return starts
}

/** How much indent a line begins with, capped at one level. */
function leadingIndent(text: string, start: number): number {
  if (text[start] === '\t') return 1
  let spaces = 0
  while (spaces < CODE_INDENT.length && text[start + spaces] === ' ') spaces++
  return spaces
}

/**
 * Tab inside a code block: insert an indent, or indent every line the
 * selection touches.
 *
 * Declines outside a preformatted block, so Tab keeps its list behaviour and
 * its focus-movement fallback everywhere else.
 */
export const indentInPreformatted: Command = (state) => {
  const block = preformattedAt(state)
  if (!block) return null
  const selection = state.selection as TextSelection
  const text = block.textContent
  const path = selection.from.path

  // A caret, or a selection inside one line: plain insertion.
  if (!text.slice(selection.from.offset, selection.to.offset).includes('\n')) {
    const tr = state.tr
    if (!selection.empty) deleteRange(tr, selection.from, selection.to)
    const at = tr.mapPosition(selection.from, -1)
    insertAt(tr, state, at.path, at.offset, CODE_INDENT)
    return tr.setSelection(new TextSelection(pos(at.path, at.offset + CODE_INDENT.length)))
  }

  // Multi-line: indent each line, back to front so earlier offsets stay valid.
  const firstLine = text.lastIndexOf('\n', selection.from.offset - 1) + 1
  const lastBreak = text.indexOf('\n', selection.to.offset)
  const starts = lineStarts(text, firstLine, lastBreak === -1 ? text.length : lastBreak)

  const tr = state.tr
  for (const start of [...starts].reverse()) insertAt(tr, state, path, start, CODE_INDENT)

  return tr.setSelection(
    new TextSelection(
      pos(path, selection.from.offset + CODE_INDENT.length),
      pos(path, selection.to.offset + CODE_INDENT.length * starts.length),
    ),
  )
}

/**
 * Shift-Tab inside a code block: remove one indent level from every line the
 * selection touches. Lines with no leading whitespace are left alone rather
 * than eating into their text, and a selection with nothing to outdent
 * declines so the binding can fall through.
 */
export const outdentInPreformatted: Command = (state) => {
  const block = preformattedAt(state)
  if (!block) return null
  const selection = state.selection as TextSelection
  const text = block.textContent
  const path = selection.from.path

  const firstLine = text.lastIndexOf('\n', selection.from.offset - 1) + 1
  const lastBreak = text.indexOf('\n', selection.to.offset)
  const starts = lineStarts(text, firstLine, lastBreak === -1 ? text.length : lastBreak)

  // Measured before anything is removed, so the offsets all refer to one text.
  const cuts = starts
    .map((start) => ({ start, length: leadingIndent(text, start) }))
    .filter((cut) => cut.length > 0)
  if (cuts.length === 0) return null

  const tr = state.tr
  for (const cut of [...cuts].reverse()) {
    deleteRange(tr, pos(path, cut.start), pos(path, cut.start + cut.length))
  }

  const removedBefore = cuts
    .filter((cut) => cut.start < selection.from.offset)
    .reduce((total, cut) => total + cut.length, 0)
  const removedTotal = cuts.reduce((total, cut) => total + cut.length, 0)
  const from = Math.max(firstLine, selection.from.offset - removedBefore)
  const to = Math.max(from, selection.to.offset - removedTotal)
  return tr.setSelection(new TextSelection(pos(path, from), pos(path, to)))
}

/**
 * Where the last newline this command inserted left the caret.
 *
 * Deliberately module state rather than editor state: it is a transient
 * keyboard gesture, and neither the document nor the history should ever
 * see it. A caret that moves for any other reason strands the marker,
 * which is exactly right. The gesture has been interrupted.
 */
let lastNewline: { path: readonly number[]; offset: number } | null = null

export const splitBlockInPreformatted: Command = (state) => {
  const selection = state.selection
  if (!(selection instanceof TextSelection)) return null
  const block = nodeAtPath(state.doc, selection.from.path)
  if (!block?.isTextblock || !block.type.spec.preserveWhitespace) return null

  const tr = state.tr
  if (!selection.empty) deleteRange(tr, selection.from, selection.to)

  const point = tr.mapPosition(selection.from, -1)
  const current = nodeAtPath(tr.doc, point.path)
  if (!current) return null
  const text = current.textContent
  const atEnd = point.offset === inlineLength(current.content)

  // Enter at the end of a blank line the user just created leaves the block.
  //
  // The document cannot tell "arrived on a blank line" from "made this blank
  // line", both are a newline before the caret, but only the second is a
  // request to leave. So the gesture is two *consecutive* Enters, tracked by
  // where the last one put the caret. Blank means nothing but indentation:
  // the auto-indent below leaves spaces on a line nobody has typed on.
  const lineStart = text.lastIndexOf('\n', point.offset - 1) + 1
  const onBlankLine = lineStart > 0 && /^[ \t]*$/.test(text.slice(lineStart, point.offset))
  const consecutive =
    lastNewline !== null &&
    lastNewline.offset === point.offset &&
    pathsEqual(lastNewline.path, point.path)

  if (atEnd && onBlankLine && consecutive) {
    const paragraph = state.schema.nodes.paragraph
    if (paragraph) {
      // Drop the newline that opened the blank line, indentation and all, so
      // escaping leaves the code exactly as it was.
      deleteRange(tr, pos(point.path, lineStart - 1), point)
      const end = tr.mapPosition(point, -1)
      tr.step(new SplitNodeStep(end.path, end.offset, paragraph.name))
      const parentPath = end.path.slice(0, -1)
      const index = end.path[end.path.length - 1] as number
      tr.setSelection(new TextSelection(pos([...parentPath, index + 1], 0)))
      lastNewline = null
      return tr
    }
  }

  // The new line keeps the current line's indentation, the way a code editor
  // does. After an opening bracket it goes one level deeper; and with the
  // caret between a bracket and its closer, the closer moves to a line of its
  // own below, so `{|}` opens into a block with the caret inside it.
  const indent = lineIndentation(text, lineStart)
  const before = text[point.offset - 1]
  const closer = before === undefined ? undefined : CODE_BRACKETS.get(before)
  const deeper = closer !== undefined
  const opensBlock = deeper && text[point.offset] === closer
  const inserted = `\n${indent}${deeper ? CODE_INDENT : ''}`
  const trailing = opensBlock ? `\n${indent}` : ''
  tr.step(
    new ReplaceInlineStep(
      point.path,
      point.offset,
      point.offset,
      Fragment.from([state.schema.text(inserted + trailing)]),
    ),
  )
  const caret = point.offset + inserted.length
  tr.setSelection(new TextSelection(pos(point.path, caret)))
  // Remember where this newline left the caret, so an immediately following
  // Enter is recognised as the second half of the escape gesture.
  lastNewline = { path: point.path, offset: caret }
  return tr
}

/**
 * Mod-Enter inside a code block: start a paragraph after it and move the
 * caret there. The two-Enter gesture only works from a blank last line; this
 * leaves from anywhere in the block, without hunting for its end.
 */
export const exitPreformatted: Command = (state) => {
  const block = preformattedAt(state)
  if (!block) return null
  const paragraph = state.schema.nodes.paragraph
  if (!paragraph) return null
  const path = (state.selection as TextSelection).from.path
  const parentPath = path.slice(0, -1)
  const index = path[path.length - 1] as number
  const tr = state.tr
  tr.step(new ReplaceNodesStep(parentPath, index + 1, index + 1, Fragment.of(paragraph.create())))
  tr.setSelection(new TextSelection(pos([...parentPath, index + 1], 0)))
  lastNewline = null
  return tr
}

/**
 * Whether `parent` would still satisfy its own content rule with the child at
 * `index` taken out, and whether `grandparent` accepts that child beside it.
 * Both have to hold or the escape would build a document the schema rejects.
 */
function canLiftChildOut(
  parent: EditorNode,
  index: number,
  grandparent: EditorNode,
  parentIndex: number,
  child: EditorNode,
): boolean {
  const kept = parent.content.children.filter((_, at) => at !== index)
  if (!parent.type.validContent(Fragment.from(kept))) return false
  const siblings = [...grandparent.content.children]
  siblings.splice(parentIndex + 1, 0, child)
  return grandparent.type.validContent(Fragment.from(siblings))
}

/**
 * Enter on the empty last block of a wrapper leaves the wrapper, the way a
 * second Enter leaves a code block. Without it a blockquote at the end of the
 * document traps the cursor: every Enter makes another paragraph inside it
 * and there is no way back out to the body.
 *
 * The empty block the gesture was made on is carried out rather than left
 * behind, so the wrapper does not keep a blank line where the cursor was.
 *
 * Declines unless the schema allows it on both sides, which is what keeps it
 * away from fixed-structure nodes: the single slot of a toggle or a tab is
 * not something to empty out, and its own extension handles those.
 */
export const escapeWrapperOnEnter: Command = (state) => {
  const selection = state.selection
  if (!(selection instanceof TextSelection) || !selection.empty) return null
  const path = selection.from.path
  // A top-level block has nothing to leave.
  if (path.length < 2) return null
  const block = nodeAtPath(state.doc, path)
  // Only an empty block is the gesture; Enter in written text must split.
  if (!block?.isTextblock || inlineLength(block.content) > 0) return null

  const wrapperPath = path.slice(0, -1)
  const wrapper = nodeAtPath(state.doc, wrapperPath)
  if (!wrapper) return null
  const index = path[path.length - 1] as number
  // Only the last child can leave without splitting the wrapper in two.
  if (index !== wrapper.childCount - 1) return null

  const outerPath = wrapperPath.slice(0, -1)
  const outer = nodeAtPath(state.doc, outerPath)
  if (!outer) return null
  const wrapperIndex = wrapperPath[wrapperPath.length - 1] as number
  if (!canLiftChildOut(wrapper, index, outer, wrapperIndex, block)) return null

  const tr = state.tr
  tr.step(new ReplaceNodesStep(wrapperPath, index, index + 1, Fragment.empty))
  tr.step(new ReplaceNodesStep(outerPath, wrapperIndex + 1, wrapperIndex + 1, Fragment.of(block)))
  tr.setSelection(new TextSelection(pos([...outerPath, wrapperIndex + 1], 0)))
  return tr
}

/**
 * Mod-Enter from anywhere nested: a new paragraph after the whole outermost
 * block, with the caret in it.
 *
 * The two-Enter gesture needs a blank last line, which not every structure
 * has one of: a table cell, a diagram, a timeline entry. This leaves from
 * wherever the caret is, and lands at the top level, where a paragraph is
 * always allowed, so it works the same way out of every one of them.
 *
 * Declines when the caret is already in a top-level block, leaving the key
 * free for anything else bound to it there.
 */
export const exitEnclosingBlock: Command = (state) => {
  const selection = state.selection
  if (!(selection instanceof TextSelection)) return null
  const path = selection.from.path
  if (path.length < 2) return null
  const paragraph = state.schema.nodes.paragraph
  if (!paragraph) return null
  const index = (path[0] as number) + 1
  const tr = state.tr
  tr.step(new ReplaceNodesStep([], index, index, Fragment.of(paragraph.create())))
  tr.setSelection(new TextSelection(pos([index], 0)))
  return tr
}

/**
 * Shift-Enter inside a code block: a plain newline, with none of the
 * indentation Enter adds. A hard break is not allowed in a code block, so
 * without this the key did nothing there.
 */
export const insertNewlineInPreformatted: Command = (state) => {
  if (!preformattedAt(state)) return null
  return insertText('\n')(state)
}

/**
 * Typing inside a code block, with a code editor's bracket and quote
 * behaviour: an opening bracket brings its closer along and leaves the caret
 * between the two; typing a closer that is already there steps past it; and
 * a bracket or quote typed over a selection wraps it. Declines whenever none
 * of that applies, so ordinary insertion runs.
 */
export function typeInPreformatted(text: string): Command {
  return (state) => {
    const block = preformattedAt(state)
    if (!block || text.length !== 1) return null
    const selection = state.selection as TextSelection
    const source = block.textContent
    const path = selection.from.path
    const closer = CODE_PAIRS.get(text)

    if (!selection.empty) {
      if (closer === undefined) return null
      const inner = source.slice(selection.from.offset, selection.to.offset)
      const tr = state.tr
      tr.step(
        new ReplaceInlineStep(
          path,
          selection.from.offset,
          selection.to.offset,
          Fragment.from([state.schema.text(`${text}${inner}${closer}`)]),
        ),
      )
      // The text stays selected inside the pair, so another bracket nests.
      return tr.setSelection(
        new TextSelection(pos(path, selection.from.offset + 1), pos(path, selection.to.offset + 1)),
      )
    }

    const offset = selection.from.offset
    const before = source[offset - 1]
    const after = source[offset]

    // The closer is already there: typically because this editor put it
    // there, so typing it steps over it rather than doubling it.
    if (CODE_CLOSERS.has(text) && after === text) {
      return state.tr.setSelection(new TextSelection(pos(path, offset + 1)))
    }
    if (closer === undefined) return null
    if (after !== undefined && !CLOSE_BEFORE.has(after)) return null
    // A quote after a word is an apostrophe or a closing quote, not an
    // opening one: `don'` must not become `don''`.
    if (
      CODE_QUOTES.has(text) &&
      before !== undefined &&
      (CODE_WORD.test(before) || before === text)
    ) {
      return null
    }

    const tr = state.tr
    tr.step(
      new ReplaceInlineStep(
        path,
        offset,
        offset,
        Fragment.from([state.schema.text(text + closer)]),
      ),
    )
    return tr.setSelection(new TextSelection(pos(path, offset + 1)))
  }
}

/**
 * Backspace inside a code block: between the two halves of an empty pair it
 * removes both, and inside a line's leading whitespace it steps back to the
 * previous indent stop rather than one space. Declines otherwise, so the
 * ordinary delete runs.
 */
export const deleteBackwardInPreformatted: Command = (state) => {
  const block = preformattedAt(state)
  if (!block) return null
  const selection = state.selection as TextSelection
  if (!selection.empty) return null
  const source = block.textContent
  const path = selection.from.path
  const offset = selection.from.offset
  const before = source[offset - 1]
  if (before === undefined) return null

  const closer = CODE_PAIRS.get(before)
  if (closer !== undefined && source[offset] === closer) {
    const tr = state.tr
    tr.step(new ReplaceInlineStep(path, offset - 1, offset + 1, Fragment.empty))
    return tr.setSelection(new TextSelection(pos(path, offset - 1)))
  }

  const lineStart = source.lastIndexOf('\n', offset - 1) + 1
  const leading = source.slice(lineStart, offset)
  if (leading.length > 1 && /^ +$/.test(leading)) {
    const remove = ((leading.length - 1) % CODE_INDENT.length) + 1
    const tr = state.tr
    tr.step(new ReplaceInlineStep(path, offset - remove, offset, Fragment.empty))
    return tr.setSelection(new TextSelection(pos(path, offset - remove)))
  }
  return null
}

/**
 * What a block Enter starts beside `block` takes from it: its format, as in
 * Word, bar its id and its drop cap, which are that block's alone; at the end
 * of a Title or Subtitle, the paragraph style that follows it.
 */
function attrsOfNewBlock(block: EditorNode, atEnd: boolean): Attrs {
  const attrs: Record<string, unknown> = { ...withoutId(block.attrs) }
  if (attrs.dropCap != null) {
    attrs.dropCap = null
    attrs.dropCapLines = null
  }
  if (atEnd && typeof attrs.paragraphStyle === 'string') {
    attrs.paragraphStyle = followingStyle(attrs.paragraphStyle)
  }
  return attrs
}

export const splitBlock: Command = (state) => {
  const selection = state.selection
  if (!(selection instanceof TextSelection)) return null
  const tr = state.tr
  if (!selection.empty) deleteRange(tr, selection.from, selection.to)
  const point = selection.from
  const block = nodeAtPath(tr.doc, point.path)
  if (!block?.isTextblock) return null
  // Enter at the end of a non-paragraph block starts a fresh paragraph.
  const paragraph = state.schema.nodes.paragraph
  const atEnd = point.offset === inlineLength(block.content)
  const parentPath = point.path.slice(0, -1)
  const index = point.path[point.path.length - 1] as number
  if (point.offset === 0 && !atEnd) {
    // Enter at the start opens an empty block above rather than splitting:
    // the block keeps its id, so every link to it stays with its words.
    const above = block.type.create(attrsOfNewBlock(block, false))
    tr.step(new ReplaceNodesStep(parentPath, index, index, Fragment.of(above)))
  } else {
    const afterType = atEnd && paragraph && block.type !== paragraph ? paragraph.name : undefined
    const afterAttrs = afterType ? undefined : attrsOfNewBlock(block, atEnd)
    tr.step(new SplitNodeStep(point.path, point.offset, afterType, afterAttrs))
  }
  tr.setSelection(new TextSelection(pos([...parentPath, index + 1], 0)))
  return tr
}

/**
 * Insert parsed content (paste): inline content merges into the current
 * block; block content is spliced in after splitting at the cursor.
 */
export function insertContent(nodes: readonly EditorNode[]): Command {
  return (state) => {
    if (nodes.length === 0) return null
    const selection = state.selection
    if (!(selection instanceof TextSelection)) return null
    const tr = state.tr
    if (!selection.empty) deleteRange(tr, selection.from, selection.to)
    const point = selection.from
    const block = nodeAtPath(tr.doc, point.path)
    if (!block?.isTextblock) return null

    const allInline = nodes.every((node) => node.isInline)
    const parentPath = point.path.slice(0, -1)
    const index = point.path[point.path.length - 1] as number
    const blockEmpty = inlineLength(block.content) === 0

    if (!allInline && blockEmpty) {
      // Pasting blocks into an empty block replaces it wholesale.
      tr.step(new ReplaceNodesStep(parentPath, index, index + 1, Fragment.from(nodes)))
      tr.setSelection(selectionAfterBlocks(parentPath, index - 1, nodes))
      return tr
    }

    const single = nodes.length === 1 ? nodes[0] : null
    if (allInline || single?.isTextblock) {
      const source = allInline ? nodes : (single as EditorNode).content.children
      // The payload came from somewhere else (another block, another
      // document, the clipboard) so it may carry marks and inline nodes this
      // block does not take. Reduce it to what fits rather than building a
      // document the schema would reject.
      const inline = Fragment.from(coerceInlineFor(block.type, source))
      if (inline.childCount === 0) return null
      const length = inlineLength(inline)
      tr.step(new ReplaceInlineStep(point.path, point.offset, point.offset, inline))
      tr.setSelection(new TextSelection(pos(point.path, point.offset + length)))
      return tr
    }

    if (point.offset === 0) {
      // At the very start the blocks go in before it, which keeps its id
      // with its words rather than on an empty first half.
      tr.step(new ReplaceNodesStep(parentPath, index, index, Fragment.from(nodes)))
      tr.setSelection(selectionAfterBlocks(parentPath, index - 1, nodes))
      return tr
    }
    // Multi-block payload: split the current block and splice between halves.
    tr.step(new SplitNodeStep(point.path, point.offset))
    tr.step(new ReplaceNodesStep(parentPath, index + 1, index + 1, Fragment.from(nodes)))
    tr.setSelection(selectionAfterBlocks(parentPath, index, nodes))
    return tr
  }
}

/** Cursor at the end of the last of `nodes`, inserted starting at `index + 1`. */
function selectionAfterBlocks(
  parentPath: readonly number[],
  index: number,
  nodes: readonly EditorNode[],
): TextSelection {
  const lastNode = nodes[nodes.length - 1] as EditorNode
  const lastPath = [...parentPath, index + nodes.length]
  return new TextSelection(
    lastNode.isTextblock
      ? pos(lastPath, inlineLength(lastNode.content))
      : pos(parentPath, index + nodes.length + 1),
  )
}

/** Backspace: delete the selection, one unit back, or join with the previous block. */
export const deleteCharBackward: Command = (state) => {
  const selection = state.selection
  if (!selection.empty) return deleteSelection(state)
  if (!(selection instanceof TextSelection)) return null
  const point = selection.head
  const block = nodeAtPath(state.doc, point.path)
  if (!block?.isTextblock) return null
  const boundary = previousInlineBoundary(block.content, point.offset)
  if (boundary < 0) return joinBackward(state)
  const tr = state.tr
  tr.step(new ReplaceInlineStep(point.path, boundary, point.offset, Fragment.empty))
  tr.setSelection(new TextSelection(pos(point.path, boundary)))
  return tr
}

/** Delete: remove the selection, one unit forward, or join with the next block. */
export const deleteCharForward: Command = (state) => {
  const selection = state.selection
  if (!selection.empty) return deleteSelection(state)
  if (!(selection instanceof TextSelection)) return null
  const point = selection.head
  const block = nodeAtPath(state.doc, point.path)
  if (!block?.isTextblock) return null
  const boundary = nextInlineBoundary(block.content, point.offset)
  if (boundary < 0) return joinForward(state)
  const tr = state.tr
  tr.step(new ReplaceInlineStep(point.path, point.offset, boundary, Fragment.empty))
  tr.setSelection(new TextSelection(point))
  return tr
}

/** Delete at the end of a block: join the next sibling into this one. */
export const joinForward: Command = (state) => {
  const selection = state.selection
  if (!(selection instanceof TextSelection) || !selection.empty) return null
  const point = selection.head
  const block = nodeAtPath(state.doc, point.path)
  if (!block?.isTextblock || point.offset !== inlineLength(block.content)) return null
  if (point.path.length === 0) return null
  const index = point.path[point.path.length - 1] as number
  const parentPath = point.path.slice(0, -1)
  const next = nodeAtPath(state.doc, [...parentPath, index + 1])
  if (!next) return null
  const tr = state.tr
  if (!next.isTextblock) {
    if (!next.isAtom) return null
    tr.step(new ReplaceNodesStep(parentPath, index + 1, index + 2, Fragment.empty))
    return tr
  }
  tr.step(new JoinNodesStep(point.path, point.offset))
  tr.setSelection(new TextSelection(point))
  return tr
}

/** Backspace at the start of a block: join with the previous sibling. */
export const joinBackward: Command = (state) => {
  const selection = state.selection
  if (!(selection instanceof TextSelection) || !selection.empty) return null
  const point = selection.head
  if (point.offset !== 0 || point.path.length === 0) return null
  const index = point.path[point.path.length - 1] as number
  if (index === 0) return null
  const parentPath = point.path.slice(0, -1)
  const previousPath = [...parentPath, index - 1]
  const previous = nodeAtPath(state.doc, previousPath)
  if (!previous) return null
  const tr = state.tr
  if (!previous.isTextblock) {
    // Backspace into an atom block (hr): delete it.
    if (!previous.isAtom) return null
    tr.step(new ReplaceNodesStep(parentPath, index - 1, index, Fragment.empty))
    return tr
  }
  const joinOffset = inlineLength(previous.content)
  tr.step(new JoinNodesStep(previousPath, joinOffset))
  tr.setSelection(new TextSelection(pos(previousPath, joinOffset)))
  return tr
}

/** Insert an inline atom node (hard break, …) at the selection. */
export function insertInlineNode(name: string, attrs?: Attrs): Command {
  return (state) => {
    const type = state.schema.nodeType(name)
    if (!type.isInline || !type.isAtom) return null
    const selection = state.selection
    if (!(selection instanceof TextSelection)) return null
    const tr = state.tr
    if (!selection.empty) deleteRange(tr, selection.from, selection.to)
    const point = selection.from
    tr.step(
      new ReplaceInlineStep(
        point.path,
        point.offset,
        point.offset,
        Fragment.of(type.create(attrs)),
      ),
    )
    tr.setSelection(new TextSelection(pos(point.path, point.offset + 1)))
    return tr
  }
}

/** Insert a block node (horizontal rule, …) after the current block. */
export function insertBlockAfter(name: string, attrs?: Attrs): Command {
  return (state) => {
    const type = state.schema.nodeType(name)
    if (type.isInline || type.inlineContent) return null
    const selection = state.selection
    const blockPath = selection.to.path
    if (blockPath.length === 0) return null
    const parentPath = blockPath.slice(0, -1)
    const index = blockPath[blockPath.length - 1] as number
    const tr = state.tr
    tr.step(new ReplaceNodesStep(parentPath, index + 1, index + 1, Fragment.of(type.create(attrs))))
    return tr
  }
}

/** Wrap the selected blocks in a node of the given type (blockquote, …). */
export function wrapIn(name: string, attrs?: Attrs): Command {
  return (state) => {
    const selection = state.selection
    const blocks = blocksInRange(state.doc, selection.from, selection.to)
    const first = blocks[0]
    const last = blocks[blocks.length - 1]
    if (!first || !last) return null
    const parentPath = first.path.slice(0, -1)
    if (!pathsEqual(parentPath, last.path.slice(0, -1))) return null
    const from = first.path[first.path.length - 1] as number
    const to = (last.path[last.path.length - 1] as number) + 1
    const tr = state.tr
    tr.step(new WrapNodesStep(parentPath, from, to, name, attrs))
    return tr
  }
}

/** Remove the wrapper around the block at the selection (un-blockquote, …). */
export const lift: Command = (state) => {
  const selection = state.selection
  const blockPath = selection.from.path
  if (blockPath.length < 2) return null
  const wrapperPath = blockPath.slice(0, -1)
  const wrapper = nodeAtPath(state.doc, wrapperPath)
  if (!wrapper || wrapper.isTextblock) return null
  const tr = state.tr
  tr.step(new LiftNodesStep(wrapperPath, wrapper.childCount))
  return tr
}

/** Select the whole document. */
export const selectAll: Command = (state) => {
  return state.tr.setSelection(new AllSelection(state.doc))
}

/** Stored-mark aware active-mark test, shared by toolbars and toggleMark. */
export function isMarkActive(state: EditorState, name: string): boolean {
  const type = state.schema.marks[name]
  if (!type) return false
  const selection = state.selection
  if (selection.empty && selection instanceof TextSelection) {
    const block = nodeAtPath(state.doc, selection.head.path)
    if (!block?.isTextblock) return false
    const current = state.storedMarks ?? marksAtInlineOffset(block.content, selection.head.offset)
    return current.some((mark: Mark) => mark.type === type)
  }
  const blocks = blocksInRange(state.doc, selection.from, selection.to).filter(
    (block) => block.from < block.to,
  )
  return (
    blocks.length > 0 &&
    blocks.every((block) => rangeHasMark(block.node.content, block.from, block.to, type))
  )
}
