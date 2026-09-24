import {
  ADD_TO_HISTORY,
  type Command,
  type Editor,
  type EditorNode,
  type EditorState,
  Fragment,
  type ListNumberingScheme,
  type Path,
  type Position,
  ReplaceNodesStep,
  SetNodeAttrsStep,
  TextSelection,
  documentListSchemes,
  inlineLength,
  isListItemTypeName,
  nodeAtPath,
  pathOfElement,
  pathsEqual,
  pos,
  safeAssignee,
  safeTaskDate,
  setDocumentAttrs,
  setListNumbering,
  storedListSchemesAttr,
} from '@trevixal/core'

/**
 * The list tools Format ▸ Lists adds to the core's list commands: sort a
 * list, fold an item's subtree shut, and give a task a due date and an
 * assignee. The fold and the task details are the items' own attributes, so
 * they save with the document; folding is a view preference, as a toggle
 * block's is, so it stays out of the undo history.
 */

interface Found {
  readonly path: Path
  readonly node: EditorNode
}

/** The innermost list item on a path. */
function itemOn(doc: EditorNode, path: Path, accept: (item: EditorNode) => boolean): Found | null {
  for (let depth = path.length - 1; depth >= 1; depth--) {
    const itemPath = path.slice(0, depth)
    const node = nodeAtPath(doc, itemPath)
    if (node && isListItemTypeName(node.type.name) && accept(node)) return { path: itemPath, node }
  }
  return null
}

const anyItem = (): boolean => true

// ---------------------------------------------------------------------- sort

export type ListSortDirection = 'ascending' | 'descending'

/**
 * Sort the list at the selection by its items' text, A to Z or Z to A, as
 * Word's Sort does a run of paragraphs: numbers in order (`2` before `10`),
 * case and accents aside, items with no text last, ties as they were. Each
 * item takes the items nested in it along, and the caret stays in its item.
 * Declines when the list is already in that order.
 */
export function sortList(direction: ListSortDirection): Command {
  return (state) => {
    const item = itemOn(state.doc, state.selection.from.path, anyItem)
    if (!item) return null
    const listPath = item.path.slice(0, -1)
    const list = nodeAtPath(state.doc, listPath)
    if (!list || list.childCount < 2) return null
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
    const keyed = list.content.children.map((node, index) => ({
      node,
      index,
      key: (node.content.maybeChild(0)?.textContent ?? '').trim(),
    }))
    keyed.sort((a, b) => {
      if ((a.key === '') !== (b.key === '')) return a.key === '' ? 1 : -1
      const order = collator.compare(a.key, b.key)
      if (order !== 0) return direction === 'ascending' ? order : -order
      return a.index - b.index
    })
    if (keyed.every((entry, index) => entry.index === index)) return null
    const follow = (position: Position): Position => {
      const inList =
        position.path.length > listPath.length &&
        pathsEqual(position.path.slice(0, listPath.length), listPath)
      if (!inList) return position
      const moved = keyed.findIndex((entry) => entry.index === position.path[listPath.length])
      return pos([...listPath, moved, ...position.path.slice(listPath.length + 1)], position.offset)
    }
    const tr = state.tr.step(
      new ReplaceNodesStep(
        listPath,
        0,
        list.childCount,
        Fragment.from(keyed.map((entry) => entry.node)),
      ),
    )
    // A caret follows its item; anything else selected is left to the step to map.
    const { selection } = state
    if (!(selection instanceof TextSelection)) return tr
    return tr.setSelection(new TextSelection(follow(selection.anchor), follow(selection.head)))
  }
}

// ---------------------------------------------------------------------- fold

/** Whether an item has anything to fold away: a block past its first. */
export function isFoldable(item: EditorNode): boolean {
  return item.childCount > 1
}

/** Whether a position is in a block an item's fold hides: any past its first. */
function hiddenBy(itemPath: Path, position: Position): boolean {
  return (
    position.path.length > itemPath.length &&
    pathsEqual(position.path.slice(0, itemPath.length), itemPath) &&
    (position.path[itemPath.length] as number) > 0
  )
}

/** The end of an item's first textblock, where a caret its fold hides goes. */
function endOfFirstBlock(item: EditorNode, itemPath: Path): Position | null {
  let path = [...itemPath, 0]
  let node = item.content.maybeChild(0)
  while (node && !node.isTextblock) {
    node = node.content.maybeChild(0)
    path = [...path, 0]
  }
  return node ? pos(path, inlineLength(node.content)) : null
}

/**
 * Fold the list item at `itemPath` shut, or open it again. Folding one with
 * the caret in what it hides takes the caret to the end of its first block,
 * so what the writer types stays in sight. Declines for an item with nothing
 * to fold, and for one already as asked.
 */
export function setListItemFolded(itemPath: Path, folded: boolean): Command {
  return (state) => {
    const item = nodeAtPath(state.doc, itemPath)
    if (!item || !isListItemTypeName(item.type.name) || !('folded' in item.attrs)) return null
    if ((item.attrs.folded === true) === folded || (folded && !isFoldable(item))) return null
    const tr = state.tr
      .step(new SetNodeAttrsStep(itemPath, { ...item.attrs, folded }))
      .setMeta(ADD_TO_HISTORY, false)
    const { from, to } = state.selection
    if (folded && (hiddenBy(itemPath, from) || hiddenBy(itemPath, to))) {
      const caret = endOfFirstBlock(item, itemPath)
      if (caret) tr.setSelection(new TextSelection(caret))
    }
    return tr
  }
}

/**
 * Fold the item at the selection, or unfold it: the innermost one with
 * something to fold, so a caret in an item with nothing under it folds the
 * item it sits in.
 */
export const toggleListItemFold: Command = (state) => {
  const found = itemOn(
    state.doc,
    state.selection.from.path,
    (item) => isFoldable(item) || item.attrs.folded === true,
  )
  return found ? setListItemFolded(found.path, found.node.attrs.folded !== true)(state) : null
}

/**
 * Unfold every item whose fold hides the selection, so a caret that lands
 * there, from Find or an arrow key, is never out of sight. Declines when
 * nothing hides it.
 */
export const revealSelection: Command = (state) => {
  const tr = state.tr
  for (const position of [state.selection.from, state.selection.to]) {
    for (let depth = position.path.length - 1; depth >= 1; depth--) {
      const itemPath = position.path.slice(0, depth)
      const item = nodeAtPath(tr.doc, itemPath)
      if (item?.attrs.folded !== true || !hiddenBy(itemPath, position)) continue
      tr.step(new SetNodeAttrsStep(itemPath, { ...item.attrs, folded: false }))
    }
  }
  return tr.docChanged ? tr.setMeta(ADD_TO_HISTORY, false) : null
}

/**
 * A press on a fold's chevron, which the stylesheet draws before an item's
 * first block, out past its marker. The chevron is a `::before`, so the press
 * lands on the block itself, left of its box (right of it in text that runs
 * right to left), where nothing else of the block can be. `mousedown`, and
 * the default prevented, so the caret stays where the writer left it.
 */
export function bindListFolding(editor: Editor): () => void {
  const view = editor.view
  if (!view) return () => undefined
  const root = view.dom

  const onMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0) return
    const block = event.target as HTMLElement | null
    const item = block?.parentElement
    if (!block || item?.tagName !== 'LI' || item.firstElementChild !== block) return
    const box = block.getBoundingClientRect()
    const rtl = block.ownerDocument.defaultView?.getComputedStyle(block).direction === 'rtl'
    if (rtl ? event.clientX <= box.right : event.clientX >= box.left) return
    const path = pathOfElement(root, view.renderer, item)
    const node = path ? nodeAtPath(editor.state.doc, path) : null
    if (!path || !node || !(isFoldable(node) || node.attrs.folded === true)) return
    event.preventDefault()
    editor.exec(setListItemFolded(path, node.attrs.folded !== true))
  }

  // Wherever the selection goes, typed into, found or arrowed to, it goes
  // into sight: every transaction, not only edits, since a move is not one.
  const onTransaction = (): void => {
    const tr = revealSelection(editor.state)
    if (tr) editor.dispatch(tr)
  }

  root.addEventListener('mousedown', onMouseDown)
  const stop = editor.on('transaction', onTransaction)
  return () => {
    root.removeEventListener('mousedown', onMouseDown)
    stop()
  }
}

// --------------------------------------------------------------- task details

/** A task's due date (`2026-10-01`) and who it is assigned to; null for none. */
export interface TaskDetails {
  readonly due: string | null
  readonly assignee: string | null
}

/** The task item holding the selection: the innermost list item, when it is a task. */
function taskAt(state: EditorState): Found | null {
  const item = itemOn(state.doc, state.selection.from.path, anyItem)
  return item?.node.type.name === 'taskItem' ? item : null
}

/** The details of the task at the selection, for a dialog to open on; null outside a task. */
export function taskDetailsAt(state: EditorState): TaskDetails | null {
  const task = taskAt(state)
  if (!task) return null
  return {
    due: safeTaskDate(task.node.attrs.due),
    assignee: safeAssignee(task.node.attrs.assignee),
  }
}

/**
 * Give the task at the selection a due date and an assignee, or clear them
 * with null (or empty text). Declines outside a task, for a date that is not
 * one, and when nothing would change.
 */
export function setTaskDetails(details: TaskDetails): Command {
  return (state) => {
    const task = taskAt(state)
    if (!task) return null
    const wantsDate = details.due !== null && details.due.trim() !== ''
    const due = wantsDate ? safeTaskDate(details.due) : null
    if (wantsDate && due === null) return null
    const assignee = safeAssignee(details.assignee)
    const { attrs } = task.node
    if ((attrs.due ?? null) === due && (attrs.assignee ?? null) === assignee) return null
    return state.tr.step(new SetNodeAttrsStep(task.path, { ...attrs, due, assignee }))
  }
}

/** Today, as a task's due date is written: the local calendar date. */
export function localToday(now: Date = new Date()): string {
  const two = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`
}

/**
 * Mark each unfinished task whose due date has passed with
 * `data-overdue`, which the stylesheet colours its chip by. Only the editor
 * does this: a print or a saved page is not read on any one day. The mark
 * is the view's, never the document's, and is redrawn after every render.
 */
export function highlightOverdueTasks(
  editor: Editor,
  today: () => string = () => localToday(),
): () => void {
  const view = editor.view
  if (!view) return () => undefined
  const mark = (): void => {
    const now = today()
    for (const item of view.dom.querySelectorAll('li[data-type="taskItem"][data-due]')) {
      const overdue =
        item.getAttribute('data-checked') !== 'true' && (item.getAttribute('data-due') ?? '') < now
      if (item.hasAttribute('data-overdue') !== overdue)
        item.toggleAttribute('data-overdue', overdue)
    }
  }
  mark()
  return editor.on('update', mark)
}

// ------------------------------------------------------------ defined schemes

/**
 * Save a defined scheme to the document, in place of one with its id or
 * after the rest, and number the list at the selection with it: Word's
 * Define New Multilevel List, whose list goes into the gallery as it is
 * made. Outside a list, the selected blocks become one first. One undoable
 * step, the scheme and the list together.
 */
export function defineListNumbering(scheme: ListNumberingScheme): Command {
  return (state) => {
    if (!scheme.custom || !('listSchemes' in (state.doc.type.spec.attrs ?? {}))) return null
    const schemes = documentListSchemes(state.doc)
    const index = schemes.findIndex((each) => each.id === scheme.id)
    const next =
      index >= 0 ? schemes.map((each, at) => (at === index ? scheme : each)) : [...schemes, scheme]
    const saved = setDocumentAttrs({ listSchemes: storedListSchemesAttr(next) })(state) ?? state.tr
    const numbered = setListNumbering(scheme.id)(state.apply(saved))
    if (!numbered) return saved.docChanged ? saved : null
    for (const step of numbered.steps) saved.step(step)
    return saved.setSelection(numbered.selection)
  }
}

/** The id a newly defined scheme takes: one past the highest the document has. */
export function nextListSchemeId(doc: EditorNode): string {
  const numbers = documentListSchemes(doc).map((scheme) =>
    Number(scheme.id.slice('custom-'.length)),
  )
  return `custom-${Math.max(0, ...numbers) + 1}`
}
