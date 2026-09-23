import {
  type CaseMode,
  type Command,
  clearAllFormatting,
  clearBlockFormatting,
  clearFormatting,
  convertCase,
  deleteSelection,
  indentBlocks,
  insertBlockAfter,
  insertInlineNode,
  insertText,
  isMarkActive,
  joinBackward,
  lift,
  selectAll,
  setBlockAttrs,
  setBlockType,
  setLetterSpacing,
  setLineHeight,
  setMark,
  setParagraphSpacing,
  setTextAlign,
  splitBlock,
  toggleMark,
  toggleSmallCaps,
  unsetMark,
  wrapIn,
} from '../commands/commands'
import {
  continueNumbering,
  continueNumberingFromPrevious,
  liftListItem,
  restartNumbering,
  setListNumbering,
  setListStyle,
  sinkListItem,
  splitListItem,
  toggleList,
  toggleTaskChecked,
  toggleTaskList,
  unwrapList,
} from '../commands/lists'
import { ADD_TO_HISTORY, History, type HistoryEntry, type HistoryOptions } from '../history/history'
import type { InputRule } from '../input-rules/input-rules'
import { type Attrs, attrsEq } from '../model/attrs'
import { blocksInRange } from '../model/blocks'
import { characterCount, paragraphCount, sentenceCount, wordCount } from '../model/counts'
import { marksAtInlineOffset, rangesWithMark } from '../model/inline'
import { type DocJSON, nodeFromJSON } from '../model/json'
import { EditorNode } from '../model/node'
import { normalizeDoc } from '../model/normalize'
import { pos } from '../model/position'
import type { Schema } from '../model/schema'
import { type Path, nodeAtPath } from '../model/tree'
import { serializeToHTML, serializeToText } from '../serialize/html'
import { EditorState } from '../state/editor-state'
import { type Selection, TextSelection, selectionNear } from '../state/selection'
import { ReplaceNodesStep } from '../state/steps/replace-nodes'
import type { Transaction } from '../state/transaction'
import { EditorView, type NodeViewFactory } from '../view/editor-view'
import type { Keymap } from '../view/keymap'

export interface EditorChange {
  readonly editor: Editor
  readonly json: DocJSON
  readonly html: string
}

export interface EditorOptions {
  readonly schema: Schema
  /** Initial content as canonical JSON. */
  readonly content?: DocJSON
  readonly doc?: EditorNode
  /** Mount point for the contenteditable view. Omit for a headless editor. */
  readonly element?: HTMLElement | null
  readonly autofocus?: boolean
  /** Extra key bindings for the view; they win over the base keymap. */
  readonly keymap?: Keymap
  /** Text shown while the document is empty. */
  readonly placeholder?: string
  /** Accessible name for the surface; see {@link EditorViewOptions.ariaLabel}. */
  readonly ariaLabel?: string
  /** Start read-only. Flip at runtime with {@link Editor.setEditable}. */
  readonly editable?: boolean
  /**
   * Browser spell checking on the editing surface. Left to the browser's
   * default when omitted; flip at runtime with {@link Editor.setSpellcheck}.
   */
  readonly spellcheck?: boolean
  /** Reject edits that would push the character count past this limit. */
  readonly maxLength?: number
  /** Replaces the default markdown-style input rules when provided. */
  readonly inputRules?: readonly InputRule[]
  /** Custom renderers per node type (framework components in the document). */
  readonly nodeViews?: Readonly<Record<string, NodeViewFactory>>
  /**
   * Announce structural edits to assistive technology; see
   * {@link EditorViewOptions.announce}. On by default. Ignored without an
   * `element`: a headless editor has no live region to write to.
   */
  readonly announce?: boolean
  readonly onChange?: (change: EditorChange) => void
  readonly history?: HistoryOptions
}

export type EditorEvent = 'transaction' | 'update' | 'selectionUpdate'

/** Payload delivered to {@link Editor.onTransaction} listeners. */
export interface TransactionEvent {
  readonly editor: Editor
  readonly transaction: Transaction
  /** State the transaction was applied to. */
  readonly before: EditorState
  /** State after applying it (=== `editor.state` at emit time). */
  readonly state: EditorState
}

/**
 * Rewrites a transaction before it is applied (track changes turns edits
 * into suggestions). Return null to keep the transaction as-is. The
 * replacement must start from the same state.
 */
export type DispatchTransform = (tr: Transaction, state: EditorState) => Transaction | null

export interface SetContentOptions {
  /** Record the replacement as an undoable step instead of clearing history. */
  readonly addToHistory?: boolean
}

/** Toolbar-facing snapshot of the current state. */
export interface EditorSnapshot {
  readonly activeMarks: readonly string[]
  /** Attributes of each active mark, keyed by mark name (font size, color…). */
  readonly markAttrs: Readonly<Record<string, Attrs>>
  readonly blockType: string | null
  readonly blockAttrs: Attrs | null
  /** Type name of the list wrapping the selection, when inside one. */
  readonly listType: string | null
  /** Text alignment of the block holding the selection head. */
  readonly align: string | null
  /** Indent level of the block holding the selection head. */
  readonly indent: number
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly selectionEmpty: boolean
}

/**
 * The headless editor: owns the state, dispatches transactions, records
 * history and exposes commands. A DOM view attaches to it when an element
 * is supplied.
 */
export class Editor {
  state: EditorState
  readonly commands: EditorCommands
  /** The attached DOM view, when an `element` was supplied. */
  view: EditorView | null = null
  private readonly history: History
  private readonly onChange?: (change: EditorChange) => void
  private readonly maxLength: number | null
  private listeners = new Map<EditorEvent, Set<() => void>>()
  private txListeners = new Set<(event: TransactionEvent) => void>()
  private transforms: DispatchTransform[] = []
  private destroyed = false
  private snapshotCache: EditorSnapshot | null = null
  /** The last snapshot handed out, kept so an unchanged one can be reused. */
  private lastSnapshot: EditorSnapshot | null = null

  constructor(options: EditorOptions) {
    this.state = EditorState.create({
      schema: options.schema,
      doc: options.doc,
      content: options.content,
    })
    this.history = new History(options.history)
    this.onChange = options.onChange
    this.maxLength = options.maxLength ?? null
    this.commands = new EditorCommands(this)
    if (options.element) {
      this.view = new EditorView(this, options.element, {
        autofocus: options.autofocus,
        keymap: options.keymap,
        placeholder: options.placeholder,
        ariaLabel: options.ariaLabel,
        editable: options.editable,
        spellcheck: options.spellcheck,
        inputRules: options.inputRules,
        nodeViews: options.nodeViews,
        announce: options.announce,
      })
    }
  }

  get schema(): Schema {
    return this.state.schema
  }

  get isDestroyed(): boolean {
    return this.destroyed
  }

  /** Run a command against the current state; dispatches when it applies. */
  exec(command: Command): boolean {
    if (this.destroyed) return false
    // The browser reports selection changes asynchronously, so a command
    // triggered outside the input pipeline (a toolbar click) must see the
    // live selection rather than the last one the view observed.
    this.view?.syncSelectionFromDOM()
    const tr = command(this.state)
    if (!tr) return false
    this.dispatch(tr)
    return true
  }

  dispatch(tr: Transaction): void {
    if (this.destroyed) return
    const before = this.state
    let transaction = tr
    for (const transform of this.transforms) {
      transaction = transform(transaction, before) ?? transaction
    }
    if (this.maxLength !== null && transaction.docChanged) {
      const next = characterCount(transaction.doc)
      if (next > this.maxLength && next > characterCount(before.doc)) return
    }
    this.history.record(transaction, before.selection)
    this.state = before.apply(transaction)
    this.snapshotCache = null
    this.emit('transaction')
    for (const listener of [...this.txListeners]) {
      listener({ editor: this, transaction, before, state: this.state })
    }
    if (transaction.docChanged) {
      this.emit('update')
      this.onChange?.({ editor: this, json: this.getJSON(), html: this.getHTML() })
    }
    if (!this.state.selection.eq(before.selection)) this.emit('selectionUpdate')
  }

  /** Listen to applied transactions with their before/after states. */
  onTransaction(listener: (event: TransactionEvent) => void): () => void {
    this.txListeners.add(listener)
    return () => this.txListeners.delete(listener)
  }

  /** Register a transform that can rewrite transactions before they apply. */
  addDispatchTransform(transform: DispatchTransform): () => void {
    this.transforms.push(transform)
    return () => {
      this.transforms = this.transforms.filter((entry) => entry !== transform)
    }
  }

  /** Start a chained command sequence: `editor.chain().focus().setHeading(2).run()`. */
  chain(): Chain {
    return new Chain(this)
  }

  undo(): boolean {
    const tr = this.history.undo(this.state)
    if (!tr) return false
    this.dispatch(tr)
    return true
  }

  redo(): boolean {
    const tr = this.history.redo(this.state)
    if (!tr) return false
    this.dispatch(tr)
    return true
  }

  get canUndo(): boolean {
    return this.history.canUndo
  }

  get canRedo(): boolean {
    return this.history.canRedo
  }

  /** The undo and redo stacks as a history panel lists them. */
  historyEntries(): {
    readonly undo: readonly HistoryEntry[]
    readonly redo: readonly HistoryEntry[]
  } {
    return { undo: this.history.undoEntries, redo: this.history.redoEntries }
  }

  /** Forget every undo and redo group. */
  clearHistory(): void {
    this.history.clear()
    this.snapshotCache = null
    this.emit('transaction')
  }

  /**
   * Replace the whole document: loading a saved file, switching documents,
   * restoring a draft. That is not an edit of the current text, so by default
   * the change stays out of the undo history and the history is cleared;
   * pass `addToHistory: true` to make the replacement undoable instead.
   */
  setContent(content: DocJSON | EditorNode, options: SetContentOptions = {}): void {
    if (this.destroyed) return
    const doc = normalizeDoc(
      content instanceof EditorNode ? content : nodeFromJSON(this.schema, content),
    )
    const tr = this.state.tr
    tr.step(new ReplaceNodesStep([], 0, this.state.doc.childCount, doc.content))
    tr.setSelection(selectionNear(tr.doc, pos([0], 0)))
    if (options.addToHistory !== true) tr.setMeta(ADD_TO_HISTORY, false)
    this.dispatch(tr)
    if (options.addToHistory !== true) this.history.clear()
  }

  getJSON(): DocJSON {
    return this.state.doc.toJSON()
  }

  getHTML(): string {
    return serializeToHTML(this.state.doc)
  }

  getText(): string {
    return serializeToText(this.state.doc)
  }

  getCharacterCount(): number {
    return characterCount(this.state.doc)
  }

  getWordCount(): number {
    return wordCount(this.state.doc)
  }

  getSentenceCount(): number {
    return sentenceCount(this.state.doc)
  }

  getParagraphCount(): number {
    return paragraphCount(this.state.doc)
  }

  /** Toggle read-only mode on the attached view. */
  setEditable(editable: boolean): void {
    this.view?.setEditable(editable)
  }

  /** Turn the browser's spell checking of the editing surface on or off. */
  setSpellcheck(enabled: boolean): void {
    this.view?.setSpellcheck(enabled)
  }

  get isEditable(): boolean {
    return this.view?.isEditable ?? true
  }

  isActive(markName: string): boolean {
    return isMarkActive(this.state, markName)
  }

  /**
   * Toolbar-facing snapshot.
   *
   * Reference-stable while its *contents* are unchanged, not merely between
   * transactions, so typing a character returns the very same object, and a
   * toolbar subscribed through `useSyncExternalStore`, a signal or a store
   * does not re-render on every keystroke. It changes identity when something
   * a toolbar would actually draw differently changes: a mark, the block
   * type, whether undo is available.
   *
   * Subscribers are still notified per transaction; what this decides is
   * whether they have anything new to look at.
   */
  getSnapshot(): EditorSnapshot {
    if (this.snapshotCache) return this.snapshotCache
    const selection: Selection = this.state.selection
    let block = nodeAtPath(this.state.doc, selection.from.path)
    if (block && !block.isTextblock) {
      // Doc-level selection: describe the first covered child instead.
      block = block.content.maybeChild(selection.from.offset) ?? block
    }
    const textblock = block?.isTextblock ? block : null
    const activeMarks = Object.keys(this.state.schema.marks).filter((name) =>
      isMarkActive(this.state, name),
    )
    const markAttrs: Record<string, Attrs> = {}
    for (const name of activeMarks) {
      const attrs = activeMarkAttrs(this.state, name)
      if (attrs) markAttrs[name] = attrs
    }
    const indent = textblock?.attrs.indent
    const next: EditorSnapshot = {
      activeMarks,
      markAttrs,
      blockType: textblock?.type.name ?? null,
      blockAttrs: textblock?.attrs ?? null,
      listType: enclosingListType(this.state.doc, selection.from.path),
      align: typeof textblock?.attrs.align === 'string' ? textblock.attrs.align : null,
      indent: typeof indent === 'number' ? indent : 0,
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      selectionEmpty: selection.empty,
    }
    // Hand back the previous object when nothing a toolbar draws has changed.
    // The comparison costs a handful of scalar checks; the alternative costs
    // a re-render of every subscriber, on every keystroke.
    const reusable = this.lastSnapshot && snapshotsEqual(this.lastSnapshot, next)
    this.snapshotCache = reusable ? (this.lastSnapshot as EditorSnapshot) : next
    this.lastSnapshot = this.snapshotCache
    return this.snapshotCache
  }

  /** Subscribe to state changes (the contract external stores expect). */
  subscribe(listener: () => void): () => void {
    return this.on('transaction', listener)
  }

  on(event: EditorEvent, listener: () => void): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(listener)
    return () => set.delete(listener)
  }

  destroy(): void {
    this.view?.destroy()
    this.view = null
    this.destroyed = true
    this.listeners.clear()
    this.txListeners.clear()
    this.transforms = []
  }

  private emit(event: EditorEvent): void {
    for (const listener of this.listeners.get(event) ?? []) listener()
  }
}

/**
 * Name of the list type wrapping a block, if any. The block itself is a
 * textblock inside a `listItem`, so the list is two levels up.
 */
function enclosingListType(doc: EditorNode, path: Path): string | null {
  if (path.length < 3) return null
  const item = nodeAtPath(doc, path.slice(0, -1))
  if (item?.type.name !== 'listItem' && item?.type.name !== 'taskItem') return null
  return nodeAtPath(doc, path.slice(0, -2))?.type.name ?? null
}

/** Attributes of the first mark of `name` covering the selection, if any. */
function activeMarkAttrs(state: EditorState, name: string): Attrs | null {
  const type = state.schema.marks[name]
  if (!type) return null
  const selection = state.selection
  if (selection.empty && selection instanceof TextSelection) {
    const block = nodeAtPath(state.doc, selection.head.path)
    const marks =
      state.storedMarks ??
      (block?.isTextblock ? marksAtInlineOffset(block.content, selection.head.offset) : [])
    return marks.find((mark) => mark.type === type)?.attrs ?? null
  }
  for (const block of blocksInRange(state.doc, selection.from, selection.to)) {
    if (block.from >= block.to) continue
    const [range] = rangesWithMark(block.node.content, block.from, block.to, type)
    if (range) return range.mark.attrs
  }
  return null
}

/** Bound, boolean-returning versions of the pure commands. */
/** Whether two snapshots would make a toolbar draw the same thing. */
function snapshotsEqual(a: EditorSnapshot, b: EditorSnapshot): boolean {
  return (
    a.blockType === b.blockType &&
    a.listType === b.listType &&
    a.align === b.align &&
    a.indent === b.indent &&
    a.canUndo === b.canUndo &&
    a.canRedo === b.canRedo &&
    a.selectionEmpty === b.selectionEmpty &&
    sameStrings(a.activeMarks, b.activeMarks) &&
    sameAttrs(a.blockAttrs, b.blockAttrs) &&
    sameAttrMap(a.markAttrs, b.markAttrs)
  )
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function sameAttrs(a: Attrs | null, b: Attrs | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return attrsEq(a, b)
}

function sameAttrMap(
  a: Readonly<Record<string, Attrs>>,
  b: Readonly<Record<string, Attrs>>,
): boolean {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => {
    const other = b[key]
    return other !== undefined && attrsEq(a[key] as Attrs, other)
  })
}

export class EditorCommands {
  constructor(private readonly editor: Editor) {}

  insertText(text: string): boolean {
    return this.editor.exec(insertText(text))
  }

  deleteSelection(): boolean {
    return this.editor.exec(deleteSelection)
  }

  toggleMark(name: string, attrs?: Attrs): boolean {
    return this.editor.exec(toggleMark(name, attrs))
  }

  /** Apply a mark with attributes, replacing any existing one of its type. */
  setMark(name: string, attrs: Attrs): boolean {
    return this.editor.exec(setMark(name, attrs))
  }

  unsetMark(name: string): boolean {
    return this.editor.exec(unsetMark(name))
  }

  setFontFamily(family: string): boolean {
    return this.setMark('fontFamily', { family })
  }

  setFontSize(size: string): boolean {
    return this.setMark('fontSize', { size })
  }

  setTextColor(color: string): boolean {
    return this.setMark('textColor', { color })
  }

  setBackgroundColor(color: string): boolean {
    return this.setMark('backgroundColor', { color })
  }

  setLink(href: string, title?: string): boolean {
    return this.setMark('link', title ? { href, title } : { href })
  }

  unsetLink(): boolean {
    return this.unsetMark('link')
  }

  clearFormatting(): boolean {
    return this.editor.exec(clearFormatting)
  }

  clearBlockFormatting(): boolean {
    return this.editor.exec(clearBlockFormatting)
  }

  clearAllFormatting(): boolean {
    return this.editor.exec(clearAllFormatting)
  }

  setTextAlign(align: 'left' | 'center' | 'right' | 'justify' | null): boolean {
    return this.editor.exec(setTextAlign(align))
  }

  /** Line height on the selected blocks; a bare number is a multiplier. */
  setLineHeight(value: string | number | null): boolean {
    return this.editor.exec(setLineHeight(value))
  }

  /** Space above and/or below the selected blocks. */
  setParagraphSpacing(opts: { before?: string | null; after?: string | null }): boolean {
    return this.editor.exec(setParagraphSpacing(opts))
  }

  /** Letter spacing on the selection; `null` removes it. */
  setLetterSpacing(spacing: string | null): boolean {
    return this.editor.exec(setLetterSpacing(spacing))
  }

  toggleSmallCaps(): boolean {
    return this.editor.exec(toggleSmallCaps)
  }

  /** Rewrite the selected text to upper, lower or title case. */
  convertCase(mode: CaseMode): boolean {
    return this.editor.exec(convertCase(mode))
  }

  indent(): boolean {
    return this.editor.exec(indentBlocks(1))
  }

  outdent(): boolean {
    return this.editor.exec(indentBlocks(-1))
  }

  setBlockAttrs(attrs: Attrs): boolean {
    return this.editor.exec(setBlockAttrs(attrs))
  }

  setBlockType(name: string, attrs?: Attrs): boolean {
    return this.editor.exec(setBlockType(name, attrs))
  }

  setParagraph(): boolean {
    return this.setBlockType('paragraph')
  }

  setHeading(level: number): boolean {
    return this.setBlockType('heading', { level })
  }

  splitBlock(): boolean {
    return this.editor.exec(splitBlock)
  }

  joinBackward(): boolean {
    return this.editor.exec(joinBackward)
  }

  insertHardBreak(): boolean {
    return this.editor.exec(insertInlineNode('hardBreak'))
  }

  insertHorizontalRule(): boolean {
    return this.editor.exec(insertBlockAfter('horizontalRule'))
  }

  wrapIn(name: string, attrs?: Attrs): boolean {
    return this.editor.exec(wrapIn(name, attrs))
  }

  toggleBulletList(): boolean {
    return this.editor.exec(toggleList('bulletList'))
  }

  toggleOrderedList(): boolean {
    return this.editor.exec(toggleList('orderedList'))
  }

  toggleTaskList(): boolean {
    return this.editor.exec(toggleTaskList)
  }

  /** Flip the done state of the task item holding the selection. */
  toggleTaskChecked(): boolean {
    return this.editor.exec(toggleTaskChecked)
  }

  /** Set the marker style of the list at the selection; `null` clears it. */
  setListStyle(style: string | null): boolean {
    return this.editor.exec(setListStyle(style))
  }

  /** Number the list tree at the selection with a multilevel scheme, by id. */
  setListNumbering(schemeId: string): boolean {
    return this.editor.exec(setListNumbering(schemeId))
  }

  /** Take the list at the selection apart into plain paragraphs. */
  unwrapList(): boolean {
    return this.editor.exec(unwrapList)
  }

  restartNumbering(): boolean {
    return this.editor.exec(restartNumbering)
  }

  continueNumbering(start: number): boolean {
    return this.editor.exec(continueNumbering(start))
  }

  continueNumberingFromPrevious(): boolean {
    return this.editor.exec(continueNumberingFromPrevious)
  }

  splitListItem(): boolean {
    return this.editor.exec(splitListItem)
  }

  sinkListItem(): boolean {
    return this.editor.exec(sinkListItem)
  }

  liftListItem(): boolean {
    return this.editor.exec(liftListItem)
  }

  setCodeBlock(): boolean {
    return this.setBlockType('codeBlock')
  }

  lift(): boolean {
    return this.editor.exec(lift)
  }

  selectAll(): boolean {
    return this.editor.exec(selectAll)
  }

  undo(): boolean {
    return this.editor.undo()
  }

  redo(): boolean {
    return this.editor.redo()
  }
}

/** Queued command chaining. `run()` executes in order, reports overall success. */
export class Chain {
  private readonly queue: (() => boolean)[] = []

  constructor(private readonly editor: Editor) {}

  /** Focus the attached view (no-op for headless editors). */
  focus(): this {
    this.queue.push(() => {
      this.editor.view?.focus()
      return true
    })
    return this
  }

  command(command: Command): this {
    this.queue.push(() => this.editor.exec(command))
    return this
  }

  insertText(text: string): this {
    this.queue.push(() => this.editor.commands.insertText(text))
    return this
  }

  toggleMark(name: string, attrs?: Attrs): this {
    this.queue.push(() => this.editor.commands.toggleMark(name, attrs))
    return this
  }

  setBlockType(name: string, attrs?: Attrs): this {
    this.queue.push(() => this.editor.commands.setBlockType(name, attrs))
    return this
  }

  setHeading(level: number): this {
    this.queue.push(() => this.editor.commands.setHeading(level))
    return this
  }

  setParagraph(): this {
    this.queue.push(() => this.editor.commands.setParagraph())
    return this
  }

  run(): boolean {
    return this.queue.reduce((ok, step) => step() && ok, true)
  }
}

/** Create an editor; omit `element` for a headless one. */
export function createEditor(options: EditorOptions): Editor {
  return new Editor(options)
}
