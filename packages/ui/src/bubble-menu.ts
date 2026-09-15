import { type Editor, blocksInRange, editorDocument } from '@trevixal/core'
import { type Toolbar, type ToolbarItem, type ToolbarOptions, createToolbar } from './toolbar'

/**
 * The classic bubble: the handful of things you want to do to text you have
 * just selected, put where you are already looking instead of at the top of
 * the window.
 *
 * It never takes focus: every control cancels its own `mousedown`, because
 * the selection it acts on is exactly what a click would otherwise destroy.
 */

export interface BubbleMenuOptions {
  /**
   * Where the menu is appended. Must be a positioned ancestor of the editing
   * surface, or share its offset parent: the menu is placed absolutely
   * within it. Defaults to the surface's own parent.
   */
  readonly container?: HTMLElement
  /**
   * Passed straight to the toolbar inside the bubble. Defaults to the six
   * inline actions below; pass `items` or `groupNames` for something else.
   */
  readonly toolbar?: ToolbarOptions
  /** Gap between the selection and the bubble, in px. Defaults to 8. */
  readonly gap?: number
  /**
   * Whether to show at all, for hosts with their own rule. The default shows
   * for any non-empty selection in an editable surface whose block takes
   * marks, which is to say, never over a code block, where bolding text
   * would be meaningless.
   */
  readonly shouldShow?: (editor: Editor) => boolean
}

export interface BubbleMenu {
  readonly element: HTMLElement
  readonly toolbar: Toolbar
  /** Re-read the selection and reposition. Called for you on every change. */
  refresh(): void
  destroy(): void
}

/** A mark button, described once. */
function markItem(name: string, label: string, icon: ToolbarItem['icon']): ToolbarItem {
  return {
    name,
    label,
    icon,
    ariaLabel: label,
    run: (editor) => editor.commands.toggleMark(name),
    isActive: (snapshot) => snapshot.activeMarks.includes(name),
  }
}

/**
 * What belongs in a bubble: the marks people reach for mid-sentence. Not the
 * block format, not fonts, not colour, those are deliberate choices made
 * from the toolbar, and every extra control here is one more thing covering
 * the text you are trying to read.
 */
export function defaultBubbleItems(): ToolbarItem[] {
  return [
    markItem('bold', 'Bold', 'bold'),
    markItem('italic', 'Italic', 'italic'),
    markItem('underline', 'Underline', 'underline'),
    markItem('strikethrough', 'Strikethrough', 'strikethrough'),
    markItem('code', 'Inline code', 'code'),
    markItem('highlight', 'Highlight', 'backgroundColor'),
  ]
}

export function createBubbleMenu(editor: Editor, options: BubbleMenuOptions = {}): BubbleMenu {
  const view = editor.view
  const doc = editorDocument(editor, options.container, 'createBubbleMenu')
  const host = options.container ?? (view?.dom.parentElement as HTMLElement)
  const gap = options.gap ?? 8

  const root = doc.createElement('div')
  root.className = 'trevixal-bubble'
  root.hidden = true
  root.addEventListener('mousedown', (event) => event.preventDefault())
  host.appendChild(root)

  const toolbar = createToolbar(editor, root, {
    ariaLabel: 'Text formatting',
    items: defaultBubbleItems(),
    ...options.toolbar,
  })

  const shouldShow =
    options.shouldShow ??
    ((target: Editor): boolean => {
      if (!target.isEditable || target.state.selection.empty) return false
      // A code block stores source verbatim and takes no marks, so a menu
      // offering to bold it would be offering something that cannot happen.
      // Judged over the whole range, not its first position: selecting the
      // document reports a position above every block, which belongs to none
      // of them.
      return selectionTakesMarks(target)
    })

  const refresh = (): void => {
    if (editor.isDestroyed || !shouldShow(editor)) {
      root.hidden = true
      return
    }
    const rect = selectionRect(doc, editor)
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      root.hidden = true
      return
    }
    // Shown before measuring: a hidden element has no width to centre by.
    root.hidden = false
    const hostBox = host.getBoundingClientRect()
    const left = rect.left + rect.width / 2 - hostBox.left - host.clientLeft + host.scrollLeft
    const top = rect.top - hostBox.top - host.clientTop + host.scrollTop
    // Clamped so a selection near either margin does not push the bubble off
    // the side of the page.
    const half = root.offsetWidth / 2
    const room = Math.max(0, host.clientWidth - root.offsetWidth)
    root.style.left = `${room > 0 ? clamp(left - half, 0, room) : left - half}px`
    root.style.top = `${top - root.offsetHeight - gap}px`
  }

  const offTransaction = editor.on('transaction', refresh)
  const offSelection = editor.on('selectionUpdate', refresh)
  // `selectionchange` is asynchronous, so a drag-select is not covered by the
  // editor's own events until the next transaction.
  doc.addEventListener('selectionchange', refresh)
  refresh()

  return {
    element: root,
    toolbar,
    refresh,
    destroy() {
      offTransaction()
      offSelection()
      doc.removeEventListener('selectionchange', refresh)
      toolbar.destroy()
      root.remove()
    },
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/** Whether any block the selection covers can carry a mark at all. */
function selectionTakesMarks(editor: Editor): boolean {
  const { doc, selection } = editor.state
  const blocks = blocksInRange(doc, selection.from, selection.to)
  if (blocks.length === 0) return false
  return blocks.some((block) => block.node.type.spec.preserveWhitespace !== true)
}

/**
 * The selection's box in viewport coordinates.
 *
 * Read from the DOM rather than computed from the model: only the browser
 * knows where a range landed after wrapping, and a bubble a line away from
 * the text is worse than no bubble.
 */
function selectionRect(doc: Document, editor: Editor): DOMRect | null {
  const surface = editor.view?.dom
  const selection = doc.getSelection()
  if (!surface || !selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!surface.contains(range.commonAncestorContainer)) return null
  const rect = range.getBoundingClientRect()
  // A collapsed or unlaid-out range measures zero on every edge; the caller
  // treats that as "nothing to point at".
  return rect
}
