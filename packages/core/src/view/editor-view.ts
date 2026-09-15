import { type Announcer, createAnnouncer, describeDocChange } from '../a11y/announce'
import {
  type Command,
  chainCommands,
  deleteBackwardInPreformatted,
  deleteCharBackward,
  deleteCharForward,
  deleteSelection,
  insertContent,
  insertInlineNode,
  insertNewlineInPreformatted,
  insertText,
  setMark,
  splitBlock,
  splitBlockInPreformatted,
  toggleMark,
  typeInPreformatted,
} from '../commands/commands'
import { linkifyText } from '../commands/links'
import { setTaskChecked, splitListItem } from '../commands/lists'
import type { Editor } from '../editor/editor'
import { type InputRule, applyInputRules, defaultInputRules } from '../input-rules/input-rules'
import { blocksInRange } from '../model/blocks'
import { Fragment } from '../model/fragment'
import {
  inlineLength,
  inlineOffsetFromText,
  marksAtInlineOffset,
  sliceInline,
} from '../model/inline'
import { nodeFromJSON } from '../model/json'
import type { EditorNode } from '../model/node'
import { pos } from '../model/position'
import { nodeAtPath } from '../model/tree'
import { safeHref } from '../schema/basic'
import type { SearchMatch } from '../search/find-replace'
import { serializeToHTML } from '../serialize/html'
import { parseHTML } from '../serialize/parse-html'
import { cleanPastedHTML } from '../serialize/paste-source'
import type { EditorState } from '../state/editor-state'
import { TextSelection } from '../state/selection'
import { ReplaceInlineStep } from '../state/steps/replace-inline'
import { domPointFromPosition, pathOfElement, positionFromDOMPoint } from './dom-point'
import { type Keymap, baseKeymap, keydownHandler } from './keymap'
import {
  DOMRenderer,
  type DecorationSource,
  type InlineDecoration,
  type NodeViewInstance,
} from './renderer'

const TREVIXAL_MIME = 'application/x-trevixal+json'

/** A pasted string that is one URL and nothing else. */
const BARE_URL = /^(?:https?:\/\/|www\.)[^\s<>"'`]{2,2000}$/i

/** Creates the custom view for one node type. */
export type NodeViewFactory = (node: EditorNode, editor: Editor) => NodeViewInstance

export interface EditorViewOptions {
  readonly autofocus?: boolean
  /** Extra key bindings; they win over the base keymap. */
  readonly keymap?: Keymap
  /** Text shown while the document is empty. */
  readonly placeholder?: string
  /**
   * Accessible name for the editing surface. It carries `role="textbox"`, and
   * a textbox without a name is announced as an unlabelled edit field. The
   * reader can tell you are in one, but not what it is for. Defaults to
   * "Document"; give it the name of the thing being edited where you can.
   */
  readonly ariaLabel?: string
  /** Start read-only. Flip at runtime with {@link EditorView.setEditable}. */
  readonly editable?: boolean
  /** Browser spell checking; the browser's default when omitted. */
  readonly spellcheck?: boolean
  /** Replaces the default markdown-style input rules when provided. */
  readonly inputRules?: readonly InputRule[]
  /** Custom renderers per node type (framework components in the document). */
  readonly nodeViews?: Readonly<Record<string, NodeViewFactory>>
  /**
   * Announce structural edits: blocks deleted, the block under the caret
   * becoming a different kind, to assistive technology through a live
   * region. On by default: a reader already reports typed characters from the
   * DOM, but not a key press that removed three paragraphs, and silence after
   * a destructive edit is the worst thing this surface can do. Pass `false`
   * when the host provides its own live region.
   */
  readonly announce?: boolean
}

function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false
  const platform = navigator.platform ?? ''
  return /Mac|iP(hone|ad|od)/.test(platform || navigator.userAgent || '')
}

/**
 * The contenteditable view. The DOM is a render target and input source only:
 * `beforeinput` intents are intercepted and turned into commands; IME
 * composition lets the DOM lead, then reconciles at `compositionend`; a
 * MutationObserver repairs anything unexpected back into the model.
 */
/** `Node.TEXT_NODE`, without reaching for the DOM constant at runtime. */
const TEXT_NODE = 3

export class EditorView {
  readonly dom: HTMLElement
  /** Advanced API: the renderer's DOM↔model mapping, used by adapters. */
  readonly renderer: DOMRenderer
  private readonly document: Document
  private readonly handleKey: (event: KeyboardEvent) => boolean
  private readonly unsubscribe: () => void
  private readonly inputRules: readonly InputRule[]
  private readonly placeholder: string | null
  private observer: MutationObserver | null = null
  private composing = false
  private updatingDOM = false
  private destroyed = false
  private editable = true
  private pastePlainOnce = false
  private highlights: readonly SearchMatch[] = []
  private readonly decorationLayers = new Map<string, DecorationSource>()
  private readonly keydownInterceptors = new Set<(event: KeyboardEvent) => boolean>()
  private readonly announcer: Announcer | null
  private readonly stopAnnouncing: (() => void) | null

  constructor(
    readonly editor: Editor,
    place: HTMLElement,
    options: EditorViewOptions = {},
  ) {
    this.document = place.ownerDocument
    this.dom = this.document.createElement('div')
    this.dom.className = 'trevixal-content'
    this.dom.setAttribute('role', 'textbox')
    this.dom.setAttribute('aria-multiline', 'true')
    this.dom.setAttribute('aria-label', options.ariaLabel ?? 'Document')
    const constructors: Record<string, (node: EditorNode) => NodeViewInstance> = {}
    for (const [name, factory] of Object.entries(options.nodeViews ?? {})) {
      constructors[name] = (node) => factory(node, editor)
    }
    this.renderer = new DOMRenderer(this.document, constructors)
    if (!editor.view) editor.view = this
    this.inputRules = options.inputRules ?? defaultInputRules()
    this.announcer =
      options.announce === false ? null : createAnnouncer(this.document, { container: place })
    this.stopAnnouncing = this.announcer ? this.watchForAnnouncements(this.announcer) : null
    this.placeholder = options.placeholder ?? null
    if (this.placeholder) this.dom.dataset.trevixalPlaceholder = this.placeholder
    place.appendChild(this.dom)
    this.setEditable(options.editable !== false)
    if (options.spellcheck !== undefined) this.setSpellcheck(options.spellcheck)

    this.handleKey = keydownHandler(
      {
        ...baseKeymap(),
        'Mod-Shift-v': () => {
          this.pastePlainOnce = true
          return false // let the native paste proceed; onPaste picks up the flag
        },
        ...(options.keymap ?? {}),
      },
      editor,
      detectMac(),
    )

    this.dom.addEventListener('beforeinput', this.onBeforeInput as EventListener)
    this.dom.addEventListener('mousedown', this.onMouseDown as EventListener)
    this.dom.addEventListener('keydown', this.onKeyDown)
    this.dom.addEventListener('compositionstart', this.onCompositionStart)
    this.dom.addEventListener('compositionend', this.onCompositionEnd)
    this.dom.addEventListener('copy', this.onCopy as EventListener)
    this.dom.addEventListener('cut', this.onCut as EventListener)
    this.dom.addEventListener('paste', this.onPaste as EventListener)
    this.document.addEventListener('selectionchange', this.onSelectionChange)

    if (typeof MutationObserver !== 'undefined') {
      this.observer = new MutationObserver(this.onMutations)
      this.observer.observe(this.dom, { childList: true, characterData: true, subtree: true })
    }

    this.unsubscribe = editor.on('transaction', () => this.update())
    this.update()
    if (options.autofocus) this.focus()
  }

  /** Re-render from the editor state and push the selection into the DOM. */
  update(): void {
    if (this.destroyed || this.composing) return
    this.withDOMUpdate(() => this.renderer.renderDoc(this.editor.state.doc, this.dom))
    this.updatePlaceholder()
    this.syncSelectionToDOM()
  }

  /** Toggle read-only mode. */
  setEditable(editable: boolean): void {
    this.editable = editable
    this.dom.contentEditable = String(editable)
    this.dom.setAttribute('aria-readonly', String(!editable))
  }

  get isEditable(): boolean {
    return this.editable
  }

  /**
   * Turn the browser's spell checking of the surface on or off. Set as the
   * content attribute rather than the IDL property, so it survives a DOM that
   * does not reflect `spellcheck` (and shows up in the markup for tests).
   *
   * Switching it off is enough on its own. The browser drops the marks it has
   * already drawn. Switching it back on is not: the text is not new to the
   * spell checker, so nothing is re-scanned and the surface stays unmarked
   * until the next edit happens to touch a block. `refreshTextNodes` below is
   * what makes it look new.
   */
  setSpellcheck(enabled: boolean): void {
    const changed = this.spellcheck !== enabled
    this.dom.setAttribute('spellcheck', String(enabled))
    if (!changed || !enabled) return
    this.withDOMUpdate(() => this.refreshTextNodes(this.dom))
    // Replacing the nodes drops the DOM selection; state still has it.
    this.syncSelectionToDOM()
  }

  /**
   * Swap every rendered text node for an identical fresh one, so the browser
   * treats the text as newly arrived and spell checks it again. Only text is
   * replaced: elements keep their identity, so a node view, an embedded
   * iframe, a diagram, is not torn down and rebuilt behind the user's back.
   *
   * Nothing cheaper works. Flipping the attribute, a blur/focus cycle,
   * detaching the surface and re-toggling `contenteditable` all leave the
   * existing text unchecked.
   */
  private refreshTextNodes(parent: globalThis.Node): void {
    for (const child of [...parent.childNodes]) {
      if (child.nodeType !== TEXT_NODE) {
        this.refreshTextNodes(child)
        continue
      }
      const fresh = this.document.createTextNode(child.textContent ?? '')
      // The renderer maps rendered text back to the model node it came from;
      // without carrying that over, position mapping loses the anchor.
      const model = this.renderer.modelOf.get(child)
      if (model) this.renderer.modelOf.set(fresh, model)
      ;(child as globalThis.Text).replaceWith(fresh)
    }
  }

  /** Whether the surface is spell checked; the browser default until set. */
  get spellcheck(): boolean {
    return this.dom.getAttribute('spellcheck') !== 'false'
  }

  /**
   * Highlight inline ranges (find & replace matches) as decorations, never
   * stored in the document. Pass an empty array to clear.
   */
  setHighlights(matches: readonly SearchMatch[]): void {
    this.highlights = matches
    if (matches.length === 0) {
      this.setDecorationLayer('search', null)
      return
    }
    const byNode = new WeakMap<EditorNode, InlineDecoration[]>()
    for (const match of matches) {
      const node = nodeAtPath(this.editor.state.doc, match.path)
      if (!node) continue
      const list = byNode.get(node) ?? []
      list.push({ from: match.from, to: match.to, className: 'trevixal-search-match' })
      byNode.set(node, list)
    }
    this.setDecorationLayer('search', (node) => byNode.get(node) ?? null)
  }

  get currentHighlights(): readonly SearchMatch[] {
    return this.highlights
  }

  /**
   * Install (or clear, with `null`) an independent decoration layer.
   * Extensions each own a key: code highlighting, search matches and
   * track-change ranges compose without clobbering one another.
   */
  setDecorationLayer(key: string, source: DecorationSource | null): void {
    if (source) this.decorationLayers.set(key, source)
    else if (!this.decorationLayers.delete(key)) return
    if (this.decorationLayers.size === 0) {
      this.renderer.setDecorations(null)
    } else {
      const layers = [...this.decorationLayers.values()]
      this.renderer.setDecorations((node) => {
        let result: InlineDecoration[] | null = null
        for (const layer of layers) {
          const decorations = layer(node)
          if (decorations && decorations.length > 0) {
            result = result ? result.concat(decorations) : [...decorations]
          }
        }
        return result
      })
    }
    this.update()
  }

  /**
   * Intercept keydown before the keymap runs; return true to consume the
   * event (suggestion popups take Enter/Arrows while open). Returns a
   * disposer.
   */
  addKeydownInterceptor(interceptor: (event: KeyboardEvent) => boolean): () => void {
    this.keydownInterceptors.add(interceptor)
    return () => this.keydownInterceptors.delete(interceptor)
  }

  private updatePlaceholder(): void {
    if (!this.placeholder) return
    const doc = this.editor.state.doc
    const empty =
      doc.childCount === 1 && doc.child(0).isTextblock && inlineLength(doc.child(0).content) === 0
    if (empty) {
      this.dom.dataset.trevixalEmpty = 'true'
    } else {
      delete this.dom.dataset.trevixalEmpty
    }
  }

  /**
   * Give the surface keyboard focus **without moving the page**.
   *
   * A bare `HTMLElement.focus()` scrolls the caret into view, and the caret
   * can be thousands of pixels from whatever the reader is actually looking
   * at. Every caller of this method is handing focus back after a piece of
   * chrome took it (a menu, the command palette, a dialog) and none of them
   * means "take me to the caret": the page simply jumped. So focus moves and
   * the viewport does not. To deliberately reveal the caret, which is a
   * different intention, call {@link scrollSelectionIntoView}.
   */
  focus(): void {
    // The DOM gets the selection before the focus call, not only after it:
    // focusing an empty contenteditable makes the browser place a caret of
    // its own and report it, and a `selectionchange` delivered synchronously
    // would then overwrite the model with that caret. Writing first means
    // whatever is read back is already the selection we intend.
    this.syncSelectionToDOM()
    this.withDOMUpdate(() => this.dom.focus({ preventScroll: true }))
    this.syncSelectionToDOM()
  }

  /**
   * Scroll the caret into view, the least the scrollers involved allow.
   *
   * The counterpart to {@link focus}: navigation (an outline entry, a search
   * hit) means to move the reader, so it says so rather than relying on a
   * side effect of focusing.
   */
  scrollSelectionIntoView(options: ScrollIntoViewOptions = { block: 'nearest' }): void {
    const point = domPointFromPosition(this.dom, this.renderer, this.editor.state.selection.from)
    const node = point?.node
    const element = node instanceof Element ? node : (node?.parentElement ?? null)
    element?.scrollIntoView?.(options)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.unsubscribe()
    this.observer?.disconnect()
    this.dom.removeEventListener('beforeinput', this.onBeforeInput as EventListener)
    this.dom.removeEventListener('mousedown', this.onMouseDown as EventListener)
    this.dom.removeEventListener('keydown', this.onKeyDown)
    this.dom.removeEventListener('compositionstart', this.onCompositionStart)
    this.dom.removeEventListener('compositionend', this.onCompositionEnd)
    this.dom.removeEventListener('copy', this.onCopy as EventListener)
    this.dom.removeEventListener('cut', this.onCut as EventListener)
    this.dom.removeEventListener('paste', this.onPaste as EventListener)
    this.document.removeEventListener('selectionchange', this.onSelectionChange)
    for (const child of [...this.dom.children]) {
      this.renderer.destroyViews(child as HTMLElement)
    }
    this.stopAnnouncing?.()
    this.announcer?.destroy()
    this.dom.remove()
    if (this.editor.view === this) this.editor.view = null
  }

  /**
   * Say out loud what the DOM alone does not report. Structural only. See
   * {@link describeDocChange} for why this is deliberately quiet.
   */
  private watchForAnnouncements(announcer: Announcer): () => void {
    const blockTypeAt = (state: EditorState): string | null =>
      nodeAtPath(state.doc, state.selection.from.path)?.type.name ?? null
    return this.editor.onTransaction(({ before, state }) => {
      if (this.destroyed) return
      const message = describeDocChange(
        before.doc,
        state.doc,
        blockTypeAt(before),
        blockTypeAt(state),
      )
      if (message) announcer.announce(message)
    })
  }

  // -------------------------------------------------------------- rendering

  private withDOMUpdate(fn: () => void): void {
    this.updatingDOM = true
    try {
      fn()
    } finally {
      // Drop the mutation records our own render just produced.
      this.observer?.takeRecords()
      this.updatingDOM = false
    }
  }

  // -------------------------------------------------------------- selection

  private syncSelectionToDOM(): void {
    const selection = this.editor.state.selection
    if (!(selection instanceof TextSelection)) return
    const domSelection = this.document.getSelection?.()
    if (!domSelection || typeof domSelection.setBaseAndExtent !== 'function') return
    const anchor = domPointFromPosition(this.dom, this.renderer, selection.anchor)
    const head = domPointFromPosition(this.dom, this.renderer, selection.head)
    if (!anchor || !head) return
    if (
      domSelection.anchorNode === anchor.node &&
      domSelection.anchorOffset === anchor.offset &&
      domSelection.focusNode === head.node &&
      domSelection.focusOffset === head.offset
    ) {
      return
    }
    // Only steer the browser caret while we own focus.
    const active = this.document.activeElement
    if (active !== this.dom && !this.dom.contains(active)) return
    try {
      // Writing the selection can itself raise `selectionchange`, and some
      // engines deliver it synchronously, mid-write, with the anchor moved
      // and the focus not yet. Reading that back would collapse the very
      // range being written, so our own writes are marked as ours.
      this.withDOMUpdate(() => {
        domSelection.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset)
      })
    } catch {
      // Selection APIs vary across environments; the model stays correct.
    }
  }

  /**
   * Pull the browser selection into the model. `selectionchange` is
   * asynchronous, so anything acting outside the input pipeline, a toolbar
   * button, which suppresses focus changes, must call this first to avoid
   * operating on a stale selection.
   */
  syncSelectionFromDOM(): void {
    this.onSelectionChange()
  }

  /** Read the DOM selection into the editor state (idempotent). */
  private onSelectionChange = (): void => {
    if (this.destroyed || this.composing || this.updatingDOM) return
    const domSelection = this.document.getSelection?.()
    const anchorNode = domSelection?.anchorNode
    if (!domSelection || !anchorNode || !this.dom.contains(anchorNode)) return
    const anchor = positionFromDOMPoint(
      this.dom,
      this.renderer,
      anchorNode,
      domSelection.anchorOffset,
    )
    const head = domSelection.focusNode
      ? positionFromDOMPoint(
          this.dom,
          this.renderer,
          domSelection.focusNode,
          domSelection.focusOffset,
        )
      : anchor
    if (!anchor || !head) return
    const next = new TextSelection(anchor, head)
    if (this.editor.state.selection.eq(next)) return
    this.editor.dispatch(this.editor.state.tr.setSelection(next))
  }

  // ------------------------------------------------------------------ input

  /**
   * A task item's checkbox is a CSS marker in the item's left gutter, not a
   * real `<input>`. An input inside contenteditable would take focus, sit in
   * the model's coordinate space and have to be kept in sync. That leaves
   * geometry as the way to recognise a click on it: a press whose target is
   * the `<li>` itself (the gutter holds no text) and whose x falls left of
   * the content box is a checkbox press.
   *
   * `mousedown` rather than `click`, and preventDefault, so the browser never
   * moves the caret into the item, toggling a task must not disturb where
   * the user was typing.
   */
  private onMouseDown = (event: MouseEvent): void => {
    if (this.destroyed || !this.editable || event.button !== 0) return
    const target = event.target
    if (!target || (target as globalThis.Node).nodeType !== 1) return
    const element = target as HTMLElement
    const model = this.renderer.modelOf.get(element)
    if (model?.type.name !== 'taskItem') return
    const box = element.getBoundingClientRect()
    const gutter = Number.parseFloat(
      (element.ownerDocument.defaultView?.getComputedStyle(element).paddingLeft ?? '0') || '0',
    )
    const inGutter = Number.isFinite(gutter)
      ? event.clientX < box.left + gutter
      : event.clientX < box.left
    if (!inGutter) return
    const path = pathOfElement(this.dom, this.renderer, element)
    if (!path) return
    event.preventDefault()
    this.editor.exec(setTaskChecked(path, model.attrs.checked !== true))
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.destroyed || this.composing || !this.editable) return
    // selectionchange is async; make sure bindings see the current selection.
    this.onSelectionChange()
    for (const interceptor of this.keydownInterceptors) {
      if (interceptor(event)) {
        event.preventDefault()
        return
      }
    }
    if (this.handleKey(event)) event.preventDefault()
  }

  private onBeforeInput = (event: InputEvent): void => {
    if (this.destroyed) return
    if (!this.editable) {
      event.preventDefault()
      return
    }
    const type = event.inputType
    if (this.composing || type === 'insertCompositionText') return // the IME leads
    // Make sure the model selection matches the DOM before acting on intent.
    this.onSelectionChange()

    const consume = (command: Command | null): void => {
      event.preventDefault()
      if (command) this.editor.exec(command)
    }

    switch (type) {
      case 'insertText':
      case 'insertReplacementText': {
        const text = event.data ?? event.dataTransfer?.getData('text/plain') ?? ''
        if (!text) {
          event.preventDefault()
          break
        }
        // Pattern shortcuts ("## ", "- ", "--", …) run instead of the insert.
        const ruleTr = applyInputRules(this.editor.state, text, this.inputRules)
        if (ruleTr) {
          event.preventDefault()
          this.editor.dispatch(ruleTr)
          break
        }
        // In a code block, brackets and quotes pair up the way a code editor's do.
        consume(chainCommands(typeInPreformatted(text), insertText(text)))
        break
      }
      case 'insertParagraph':
        consume(chainCommands(splitBlockInPreformatted, splitListItem, splitBlock))
        break
      case 'insertLineBreak':
        consume(chainCommands(insertNewlineInPreformatted, insertInlineNode('hardBreak')))
        break
      case 'deleteContentBackward':
        consume(chainCommands(deleteBackwardInPreformatted, deleteCharBackward))
        break
      case 'deleteWordBackward':
      case 'deleteSoftLineBackward':
        consume(deleteCharBackward)
        break
      case 'deleteContentForward':
      case 'deleteWordForward':
        consume(deleteCharForward)
        break
      case 'deleteByCut':
      case 'deleteByDrag':
        consume(deleteSelection)
        break
      case 'historyUndo':
        event.preventDefault()
        this.editor.undo()
        break
      case 'historyRedo':
        event.preventDefault()
        this.editor.redo()
        break
      case 'formatBold':
        consume(toggleMark('bold'))
        break
      case 'formatItalic':
        consume(toggleMark('italic'))
        break
      case 'formatUnderline':
        consume(toggleMark('underline'))
        break
      case 'insertFromPaste': {
        // Fallback when no `paste` event fired first (it usually does).
        event.preventDefault()
        if (event.dataTransfer) this.insertFromClipboard(event.dataTransfer)
        break
      }
      default:
        // Unknown intent must not corrupt the DOM the model owns.
        event.preventDefault()
    }
  }

  // -------------------------------------------------------------- clipboard

  private onCopy = (event: ClipboardEvent): void => {
    if (this.destroyed || !event.clipboardData) return
    if (this.writeClipboard(event.clipboardData)) event.preventDefault()
  }

  private onCut = (event: ClipboardEvent): void => {
    if (this.destroyed || !event.clipboardData) return
    if (!this.writeClipboard(event.clipboardData)) return
    event.preventDefault()
    if (this.editable) this.editor.exec(deleteSelection)
  }

  private onPaste = (event: ClipboardEvent): void => {
    if (this.destroyed || !this.editable || !event.clipboardData) return
    event.preventDefault()
    this.onSelectionChange()
    this.insertFromClipboard(event.clipboardData)
  }

  /** Serialize the selected blocks as HTML, plain text and Trevixal JSON. */
  private writeClipboard(data: DataTransfer): boolean {
    const state = this.editor.state
    const selection = state.selection
    if (selection.empty) return false
    const blocks = blocksInRange(state.doc, selection.from, selection.to)
      .filter((block) => block.from < block.to)
      .map((block) => block.node.withContent(sliceInline(block.node.content, block.from, block.to)))
    if (blocks.length === 0) return false
    data.setData('text/html', blocks.map((node) => serializeToHTML(node)).join(''))
    data.setData('text/plain', blocks.map((node) => node.textContent).join('\n'))
    data.setData(TREVIXAL_MIME, JSON.stringify(blocks.map((node) => node.toJSON())))
    return true
  }

  /** Paste pipeline: own JSON, then sanitized HTML, then plain text. */
  private insertFromClipboard(data: DataTransfer): void {
    const plainOnly = this.pastePlainOnce
    this.pastePlainOnce = false
    const schema = this.editor.schema

    // A block that keeps its whitespace holds source, not prose: whatever the
    // clipboard also offers, what belongs there is the plain text exactly as
    // it stands, newlines included, and never split into paragraphs.
    if (this.preservesWhitespaceAtSelection()) {
      const source = data.getData('text/plain')
      if (source) this.editor.exec(insertText(source))
      return
    }

    if (!plainOnly) {
      const raw = data.getData(TREVIXAL_MIME)
      if (raw) {
        try {
          const parsed: unknown = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            const nodes = parsed.map((json) => nodeFromJSON(schema, json))
            this.editor.exec(insertContent(nodes))
            return
          }
        } catch {
          // Corrupt payload: fall through to HTML/plain.
        }
      }
      const html = data.getData('text/html')
      if (html) {
        // Word and Google Docs write markup for themselves, not for a
        // document that has to live with it. Cleaned before parsing, never
        // instead of it. The allowlist below is still what makes it safe.
        const parsed = parseHTML(schema, cleanPastedHTML(html), this.document)
        this.editor.exec(insertContent(parsed.content.children))
        return
      }
    }

    const text = data.getData('text/plain')
    if (!text) return
    const lines = text.split(/\r?\n/)
    const linkable = this.linksAllowedAtSelection()
    if (lines.length === 1) {
      const trimmed = text.trim()
      // A URL pasted over selected text links that text, the gesture every
      // editor since the first wiki has taught people to expect.
      if (linkable && !this.editor.state.selection.empty && BARE_URL.test(trimmed)) {
        const href = safeHref(/^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed)
        if (href && this.editor.exec(setMark('link', { href }))) return
      }
      const linked = linkable ? linkifyText(schema, text) : null
      this.editor.exec(linked ? insertContent(linked) : insertText(text))
      return
    }
    const paragraph = schema.firstTextblockType()
    const nodes = lines.map((line) => {
      if (!line) return paragraph.create()
      const inline = (linkable ? linkifyText(schema, line) : null) ?? [schema.text(line)]
      return paragraph.create(undefined, Fragment.from(inline))
    })
    this.editor.exec(insertContent(nodes))
  }

  /** Whether the block at the selection stores its text verbatim (a code block). */
  private preservesWhitespaceAtSelection(): boolean {
    const block = nodeAtPath(this.editor.state.doc, this.editor.state.selection.from.path)
    return block?.type.spec.preserveWhitespace === true
  }

  /** Whether the block at the selection takes link marks (code blocks do not). */
  private linksAllowedAtSelection(): boolean {
    const type = this.editor.schema.marks.link
    if (!type) return false
    const block = nodeAtPath(this.editor.state.doc, this.editor.state.selection.from.path)
    return block?.isTextblock === true && block.type.allowsMarkType(type)
  }

  // ------------------------------------------------------------ composition

  private onCompositionStart = (): void => {
    if (!this.destroyed) this.composing = true
  }

  private onCompositionEnd = (): void => {
    if (this.destroyed || !this.composing) return
    this.composing = false
    const domSelection = this.document.getSelection?.()
    const anchorNode = domSelection?.anchorNode ?? null
    const block = (anchorNode ? this.blockElementAround(anchorNode) : null) ?? this.findDirtyBlock()
    if (block) {
      this.repairBlock(block)
    } else {
      this.update()
    }
  }

  /** First rendered textblock whose DOM text no longer matches its model. */
  private findDirtyBlock(): HTMLElement | null {
    const walk = (element: HTMLElement): HTMLElement | null => {
      const model = this.renderer.modelOf.get(element)
      if (model?.isTextblock) {
        const content = this.renderer.contentElementOf(element)
        return (content.textContent ?? '') === model.textContent ? null : element
      }
      for (const child of [...element.children]) {
        const dirty = walk(child as HTMLElement)
        if (dirty) return dirty
      }
      return null
    }
    for (const child of [...this.dom.children]) {
      const dirty = walk(child as HTMLElement)
      if (dirty) return dirty
    }
    return null
  }

  // -------------------------------------------------------------- mutations

  private onMutations = (records: MutationRecord[]): void => {
    if (this.destroyed || this.updatingDOM || this.composing || records.length === 0) return
    const blocks = new Set<HTMLElement>()
    let fallback = false
    for (const record of records) {
      const block = this.blockElementAround(record.target)
      if (block) blocks.add(block)
      else fallback = true
    }
    const [only] = blocks
    if (!fallback && blocks.size === 1 && only) {
      this.repairBlock(only)
    } else {
      // Unattributable mutations: the model is the source of truth.
      this.update()
    }
  }

  private blockElementAround(node: globalThis.Node): HTMLElement | null {
    for (
      let current: globalThis.Node | null = node;
      current && current !== this.dom.parentNode;
      current = current.parentNode
    ) {
      const model = this.renderer.modelOf.get(current)
      if (model?.isTextblock) return current as HTMLElement
      if (current === this.dom) break
    }
    return null
  }

  /**
   * Reconcile one textblock's DOM back into the model with a prefix/suffix
   * text diff. The recovery path for IME commits, autocorrect and browser
   * extensions.
   */
  private repairBlock(blockElement: HTMLElement): void {
    const path = pathOfElement(this.dom, this.renderer, blockElement)
    const block = path ? nodeAtPath(this.editor.state.doc, path) : null
    if (!path || !block?.isTextblock) {
      this.update() // unmappable structure: full re-render from state
      return
    }
    const content = this.renderer.contentElementOf(blockElement)
    // A block may hold inline atoms, a hard break, an inline math node. Their
    // rendered text is part of what we diff, but they own positions the text
    // scale knows nothing about, so the diff is mapped back through
    // `inlineOffsetFromText`. If one has been added or removed the text diff
    // cannot describe the change at all, and the safe answer is to re-render.
    if (this.atomsChanged(content, block)) {
      this.update()
      return
    }
    const newText = content.textContent ?? ''
    const oldText = block.textContent
    if (newText === oldText) {
      this.update()
      return
    }
    let start = 0
    while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) {
      start++
    }
    let oldEnd = oldText.length
    let newEnd = newText.length
    while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
      oldEnd--
      newEnd--
    }
    const inserted = newText.slice(start, newEnd)
    const from = inlineOffsetFromText(block.content, start)
    const to = inlineOffsetFromText(block.content, oldEnd)
    const state = this.editor.state
    const marks = marksAtInlineOffset(block.content, from).filter((mark) =>
      block.type.allowsMarkType(mark.type),
    )
    const fragment = inserted ? Fragment.of(state.schema.text(inserted, marks)) : Fragment.empty
    const tr = state.tr.step(new ReplaceInlineStep(path, from, to, fragment))

    const domSelection = this.document.getSelection?.()
    const caret =
      domSelection?.anchorNode && this.dom.contains(domSelection.anchorNode)
        ? positionFromDOMPoint(
            this.dom,
            this.renderer,
            domSelection.anchorNode,
            domSelection.anchorOffset,
          )
        : null
    tr.setSelection(new TextSelection(caret ?? pos(path, from + inserted.length)))
    this.editor.dispatch(tr)
  }

  /**
   * Whether the inline atoms rendered for a block still match its model, by
   * count. Composition only ever rewrites text, so a mismatch means the
   * browser did something the text diff cannot express.
   */
  private atomsChanged(content: HTMLElement, block: EditorNode): boolean {
    const expected = block.content.children.filter((child) => !child.isText).length
    let found = 0
    for (const element of content.querySelectorAll('*')) {
      if (this.renderer.modelOf.get(element as HTMLElement)?.isAtom) found++
    }
    return found !== expected
  }
}
