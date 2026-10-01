import {
  type DecorationSource,
  type Editor,
  type EditorNode,
  type EditorState,
  type InlineDecoration,
  type Position,
  ReplaceInlineStep,
  type Step,
  TextSelection,
  type Transaction,
  comparePositions,
  inlineLength,
  nodeAtPath,
  pathsEqual,
  pos,
  positionFromDOMPoint,
  textblocks,
} from '@trevixal/core'

/**
 * More than one caret, as a code editor has them: Alt+click puts another
 * caret where it points, and Add next match selects the next place the
 * selected words occur. Typing, Backspace and Delete then happen at every
 * caret at once, in one undo step. Escape, or a plain click, goes back to
 * one caret.
 *
 * The extra carets are the editor's, not the browser's, which can only
 * show one: each is drawn as a mark in the text, and an edit at the real
 * caret is repeated at each of them inside the same transaction.
 */

/** One extra caret, or a selection when `from` and `to` differ; both in one textblock. */
interface Extra {
  readonly from: Position
  readonly to: Position
}

export interface MultipleCarets {
  /** How many carets there are beyond the browser's own. */
  readonly count: number
  /** Add a caret at a position, as Alt+click does. */
  add(position: Position): void
  /** Select the next place the selected words occur, or the word at the caret first. */
  addNextMatch(): boolean
  clear(): void
  destroy(): void
}

/** Transactions this module makes, which it does not repeat. */
const OWN = 'multipleCarets$'

/** The primary selection as one range in one textblock, or null when it spans blocks. */
function primaryRange(state: EditorState): Extra | null {
  const selection = state.selection
  if (!(selection instanceof TextSelection)) return null
  if (!pathsEqual(selection.from.path, selection.to.path)) return null
  return { from: selection.from, to: selection.to }
}

/**
 * The edit a transaction made, as one replacement in one block, when it is
 * one: a single step, or typing over a selection, which takes the selection
 * out and then puts the typing in.
 */
function netEdit(tr: Transaction): ReplaceInlineStep | null {
  const [first, second, ...rest] = tr.steps
  if (rest.length > 0 || !(first instanceof ReplaceInlineStep)) return null
  if (!second) return first
  if (
    second instanceof ReplaceInlineStep &&
    pathsEqual(first.blockPath, second.blockPath) &&
    first.insertLength === 0 &&
    second.from === first.from &&
    second.to === first.from
  ) {
    return new ReplaceInlineStep(first.blockPath, first.from, first.to, second.insert)
  }
  return null
}

/** The word around an offset in a block's text: letters, digits and underscores. */
function wordAround(text: string, offset: number): [number, number] | null {
  let start = offset
  let end = offset
  while (start > 0 && /\w/.test(text[start - 1] as string)) start -= 1
  while (end < text.length && /\w/.test(text[end] as string)) end += 1
  return end > start ? [start, end] : null
}

/** A textblock's content as text, an atom a placeholder, so offsets are the editor's. */
function blockText(node: EditorNode): string {
  return node.content.children.map((child) => (child.isText ? child.textContent : '￼')).join('')
}

export function enableMultipleCarets(editor: Editor): MultipleCarets {
  const view = editor.view
  let extras: Extra[] = []

  const draw = (): void => {
    if (!view) return
    if (extras.length === 0) {
      view.setDecorationLayer('multiple-carets', null)
      return
    }
    const byNode = new Map<EditorNode, InlineDecoration[]>()
    const document = view.dom.ownerDocument
    for (const extra of extras) {
      const node = nodeAtPath(editor.state.doc, extra.from.path)
      if (!node) continue
      const list = byNode.get(node) ?? []
      if (extra.to.offset > extra.from.offset) {
        list.push({
          from: extra.from.offset,
          to: extra.to.offset,
          className: 'trevixal-extra-selection',
        })
      }
      list.push({
        from: extra.to.offset,
        to: extra.to.offset,
        className: 'trevixal-extra-caret',
        widget: () => document.createElement('span'),
      })
      byNode.set(node, list)
    }
    const source: DecorationSource = (node) => byNode.get(node) ?? null
    view.setDecorationLayer('multiple-carets', source)
  }

  const set = (next: Extra[]): void => {
    extras = next
    view?.dom.classList.toggle('trevixal-content--multiple-carets', extras.length > 0)
    draw()
  }

  /** Map every caret through a transaction the editor made, with nothing repeated. */
  const follow = (tr: Transaction): Extra[] =>
    extras.map((extra) => ({ from: tr.mapPosition(extra.from), to: tr.mapPosition(extra.to) }))

  /**
   * Repeat a typing-shaped edit at every extra caret: text typed over the
   * selection or at the caret, or one character taken out either side of it.
   * Anything else, a paste or an autocorrection, stays where it happened,
   * and the carets only move with it.
   */
  const repeat = (tr: Transaction, state: EditorState): Transaction | null => {
    if (extras.length === 0 || !tr.docChanged || tr.getMeta(OWN)) return null
    const primary = primaryRange(state)
    const step = netEdit(tr)
    if (!primary || !step) {
      extras = follow(tr)
      return null
    }
    const dFrom = step.from - primary.from.offset
    const dTo = step.to - primary.to.offset
    const typed = dFrom === 0 && dTo === 0
    const deletedOne =
      step.insertLength === 0 &&
      primary.from.offset === primary.to.offset &&
      dFrom + dTo !== 0 &&
      Math.abs(dFrom) + Math.abs(dTo) === 1
    if (!pathsEqual(step.blockPath, primary.from.path) || !(typed || deletedOne)) {
      extras = follow(tr)
      return null
    }
    const inserted = step.insertLength
    // Last in the document first, each mapped through the edits already made.
    const ordered = [...extras].sort((a, b) => comparePositions(b.from, a.from))
    const placed: { at: Position; after: number }[] = []
    for (const extra of ordered) {
      const from = tr.mapPosition(extra.from)
      const to = tr.mapPosition(extra.to)
      const block = nodeAtPath(tr.doc, from.path)
      if (!block?.isTextblock) continue
      const start = from.offset + dFrom
      const end = to.offset + dTo
      if (start < 0 || end > inlineLength(block.content) || start > end) continue
      if (!tr.maybeStep(new ReplaceInlineStep(from.path, start, end, step.insert))) continue
      placed.push({ at: pos(from.path, start + inserted), after: tr.steps.length })
    }
    // Where each caret ended, through the edits made after its own.
    extras = placed.map(({ at, after }) => {
      let mapped = at
      for (const later of tr.steps.slice(after) as Step[]) mapped = later.mapPosition(mapped, 1)
      return { from: mapped, to: mapped }
    })
    return tr.setMeta(OWN, true)
  }
  const removeTransform = editor.addDispatchTransform(repeat)
  const offTransaction = editor.on('transaction', () => draw())

  const add = (position: Position): void => {
    const primary = primaryRange(editor.state)
    if (primary && comparePositions(primary.from, position) === 0) return
    if (extras.some((extra) => comparePositions(extra.from, position) === 0)) return
    set([...extras, { from: position, to: position }])
  }

  const addNextMatch = (): boolean => {
    const primary = primaryRange(editor.state)
    if (!primary) return false
    const block = nodeAtPath(editor.state.doc, primary.from.path)
    if (!block?.isTextblock) return false
    if (primary.from.offset === primary.to.offset) {
      // Nothing selected: the word at the caret first, as a code editor does.
      const word = wordAround(blockText(block), primary.from.offset)
      if (!word) return false
      editor.dispatch(
        editor.state.tr.setSelection(
          new TextSelection(pos(primary.from.path, word[0]), pos(primary.from.path, word[1])),
        ),
      )
      return true
    }
    const needle = blockText(block).slice(primary.from.offset, primary.to.offset)
    if (!needle) return false
    const taken = [primary, ...extras]
    const last = taken.reduce((a, b) => (comparePositions(a.to, b.to) >= 0 ? a : b))
    const blocks = textblocks(editor.state.doc)
    const startIndex = blocks.findIndex((entry) => pathsEqual(entry.path, last.to.path))
    // Search on from the last one, wrapping round to the start.
    for (let step = 0; step <= blocks.length; step++) {
      const entry = blocks[(startIndex + step) % blocks.length]
      if (!entry) continue
      const text = blockText(entry.node)
      let from = step === 0 ? last.to.offset : 0
      for (;;) {
        const found = text.indexOf(needle, from)
        if (found < 0) break
        const range = { from: pos(entry.path, found), to: pos(entry.path, found + needle.length) }
        const isTaken = taken.some((each) => comparePositions(each.from, range.from) === 0)
        if (!isTaken) {
          set([...extras, range])
          return true
        }
        from = found + 1
      }
    }
    return false
  }

  const clear = (): void => {
    if (extras.length > 0) set([])
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!view || event.button !== 0) return
    if (!event.altKey) {
      clear()
      return
    }
    const document = view.dom.ownerDocument as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
      caretRangeFromPoint?: (x: number, y: number) => Range | null
    }
    const point = document.caretPositionFromPoint?.(event.clientX, event.clientY)
    const range = point ? null : document.caretRangeFromPoint?.(event.clientX, event.clientY)
    const node = point?.offsetNode ?? range?.startContainer
    const offset = point?.offset ?? range?.startOffset ?? 0
    if (!node || !view.dom.contains(node)) return
    const position = positionFromDOMPoint(view.dom, view.renderer, node, offset)
    if (!position) return
    event.preventDefault()
    add(position)
  }
  view?.dom.addEventListener('mousedown', onMouseDown, true)
  const removeKeys = view?.addKeydownInterceptor((event) => {
    if (event.key !== 'Escape' || extras.length === 0) return false
    clear()
    return true
  })

  return {
    get count() {
      return extras.length
    },
    add,
    addNextMatch,
    clear,
    destroy() {
      removeTransform()
      offTransaction()
      removeKeys?.()
      view?.dom.removeEventListener('mousedown', onMouseDown, true)
      view?.setDecorationLayer('multiple-carets', null)
    },
  }
}
