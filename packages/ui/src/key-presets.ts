import {
  type Command,
  type Editor,
  NEW_HISTORY_GROUP,
  type Position,
  type Selection,
  TextSelection,
  blocksInRange,
  chainCommands,
  deleteCharBackward,
  deleteCharForward,
  deleteSelection,
  escapeWrapperOnEnter,
  inlineSize,
  insertText,
  nodeAtPath,
  pos,
  sliceInline,
  splitBlock,
  splitBlockInPreformatted,
  splitListItem,
} from '@trevixal/core'

/**
 * Keys for moving and editing the way two old editors have them: Emacs's
 * chords (Ctrl+F forward, Ctrl+K kill to the end of the line…) or Vim's
 * modes (normal mode's h, j, k and l, `i` to type, Escape to stop). The
 * standard preset is the editor's own keys, and installs nothing.
 */
export type KeyPreset = 'standard' | 'emacs' | 'vim'

/** Vim's modes: keys move and edit, keys type, or keys stretch a selection. */
export type VimMode = 'normal' | 'insert' | 'visual'

export interface KeyPresetOptions {
  /** Told when Vim changes mode; null when the preset has none. */
  readonly onMode?: (mode: VimMode | null) => void
}

export type Direction = 'forward' | 'backward'
export type Unit = 'character' | 'word' | 'line' | 'lineboundary'

/** Enter, as the editor's own key does it. */
export const enter: Command = chainCommands(
  splitBlockInPreformatted,
  splitListItem,
  escapeWrapperOnEnter,
  splitBlock,
)

/** A command whose edit starts an undo step of its own, as each Vim command's does. */
function ownStep(command: Command): Command {
  return (state) => command(state)?.setMeta(NEW_HISTORY_GROUP, true) ?? null
}

/** What a kill, a delete or a yank took, for the next yank or put. */
interface Register {
  text: string
  /** Whole lines, which a put puts on a line of their own. */
  linewise: boolean
}

/** Where a selection's moving end is: a text selection's head, any other's end. */
function headOf(selection: Selection): Position {
  return selection instanceof TextSelection ? selection.head : selection.to
}

/** Where a selection is anchored: a text selection's anchor, any other's start. */
function anchorOf(selection: Selection): Position {
  return selection instanceof TextSelection ? selection.anchor : selection.from
}

/** Drop the selection to a caret where its moving end is. */
function collapse(editor: Editor): void {
  editor.dispatch(editor.state.tr.setSelection(new TextSelection(headOf(editor.state.selection))))
}

/** The text the editor's selection covers, a line per block. */
function selectedText(editor: Editor): string {
  const { doc, selection } = editor.state
  return blocksInRange(doc, selection.from, selection.to)
    .filter((block) => block.from < block.to)
    .map((block) => block.node.withContent(sliceInline(block.node.content, block.from, block.to)))
    .map((node) => node.textContent)
    .join('\n')
}

/** Type text in, a new block for each line break, as Enter makes one. */
export function typeText(editor: Editor, text: string): void {
  text.split('\n').forEach((line, index) => {
    if (index > 0) editor.exec(enter)
    if (line) editor.exec(insertText(line))
  })
}

/**
 * Move the browser's caret, or stretch its selection, by characters, words
 * or lines as they are laid out, then take it into the editor. Lines are
 * the ones on screen, so a wrapped paragraph moves a row at a time, as in
 * both editors.
 */
export function modify(
  editor: Editor,
  alter: 'move' | 'extend',
  direction: Direction,
  unit: Unit,
): void {
  const view = editor.view
  const selection = view?.dom.ownerDocument.getSelection()
  if (!view || !selection || typeof selection.modify !== 'function') return
  selection.modify(alter, direction, unit)
  view.syncSelectionFromDOM()
}

/** Put the caret at the start or the end of the document. */
function toDocumentEdge(editor: Editor, end: boolean, extend: boolean): void {
  const { doc, selection } = editor.state
  const edge = end ? TextSelection.atEnd(doc) : TextSelection.atStart(doc)
  const next = extend ? new TextSelection(anchorOf(selection), edge.head) : edge
  editor.dispatch(editor.state.tr.setSelection(next))
  editor.view?.scrollSelectionIntoView()
}

/**
 * A textblock's inline content as a string, one placeholder per inline atom,
 * so string offsets are the editor's offsets.
 */
function inlineText(editor: Editor, path: readonly number[]): string {
  const block = nodeAtPath(editor.state.doc, path)
  if (!block?.isTextblock) return ''
  return block.content.children
    .map((child) => (child.isText ? child.textContent : '\uFFFC'.repeat(inlineSize(child))))
    .join('')
}

/**
 * Where Vim's word motions go in the caret's block: `w` to the start of the
 * next word, `e` onto the last letter of this or the next, `b` to the start
 * of this or the one before. Null when the block has no such word, and the
 * motion goes on to the next line or the one before.
 */
function wordTarget(text: string, offset: number, motion: 'w' | 'e' | 'b'): number | null {
  if (motion === 'w') {
    const skip = /^\S*\s+/.exec(text.slice(offset))
    const target = skip ? offset + skip[0].length : -1
    return target > offset && target < text.length ? target : null
  }
  if (motion === 'e') {
    const run = /^\s*\S+/.exec(text.slice(offset + 1))
    return run ? offset + run[0].length : null
  }
  const back = /\S+\s*$/.exec(text.slice(0, offset))
  return back ? offset - back[0].length : null
}

/** Whether a key press is plain typing: one character, no Ctrl, Alt or ⌘. */
function isTyping(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
}

/**
 * Take over the editor's movement and editing keys with a preset's, until
 * the returned disposer runs. The keys are caught before the shortcut
 * manager's, only while the writing surface has focus, so Ctrl+F moves
 * forward in Emacs rather than opening Find; the menus still reach every
 * command.
 */
export function installKeyPreset(
  editor: Editor,
  preset: KeyPreset,
  options: KeyPresetOptions = {},
): () => void {
  const view = editor.view
  const window = view?.dom.ownerDocument.defaultView
  if (!view || !window || preset === 'standard') {
    options.onMode?.(null)
    return () => {}
  }
  const register: Register = { text: '', linewise: false }
  const handle =
    preset === 'emacs' ? emacsKeys(editor, register) : vimKeys(editor, register, options)
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.isComposing) return
    const target = event.target as Node | null
    if (!target || !view.dom.contains(target)) return
    if (!handle(event)) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  // The window's capture phase comes before the document's, where the
  // shortcut manager listens.
  window.addEventListener('keydown', onKeyDown, true)
  return () => {
    window.removeEventListener('keydown', onKeyDown, true)
    delete view.dom.dataset.trevixalKeyMode
    options.onMode?.(null)
  }
}

// -------------------------------------------------------------------- Emacs

function emacsKeys(editor: Editor, register: Register): (event: KeyboardEvent) => boolean {
  // Ctrl+Space sets the mark: moves stretch the selection from it until
  // Ctrl+G, a kill or a copy.
  let marking = false
  const move = (direction: Direction, unit: Unit): void =>
    modify(editor, marking ? 'extend' : 'move', direction, unit)
  const kill = (copyOnly: boolean): void => {
    if (editor.state.selection.empty) return
    register.text = selectedText(editor)
    register.linewise = false
    if (copyOnly) collapse(editor)
    else editor.exec(deleteSelection)
    marking = false
  }
  return (event) => {
    const key = event.key.toLowerCase()
    if (event.ctrlKey && !event.altKey && !event.metaKey) {
      switch (key) {
        case 'f':
          move('forward', 'character')
          return true
        case 'b':
          move('backward', 'character')
          return true
        case 'n':
          move('forward', 'line')
          return true
        case 'p':
          move('backward', 'line')
          return true
        case 'a':
          move('backward', 'lineboundary')
          return true
        case 'e':
          move('forward', 'lineboundary')
          return true
        case 'd':
          editor.exec(deleteCharForward)
          return true
        case 'h':
          editor.exec(deleteCharBackward)
          return true
        case 'k': {
          // To the end of the line; at the end, the line break itself.
          modify(editor, 'extend', 'forward', 'lineboundary')
          if (editor.state.selection.empty) modify(editor, 'extend', 'forward', 'character')
          kill(false)
          return true
        }
        case 'w':
          kill(false)
          return true
        case 'y':
          if (register.text) typeText(editor, register.text)
          return true
        case ' ':
          marking = true
          return true
        case 'g':
          marking = false
          collapse(editor)
          return true
        case '/':
        case '_':
          editor.undo()
          return true
        default:
          return false
      }
    }
    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      switch (event.key) {
        case 'f':
          move('forward', 'word')
          return true
        case 'b':
          move('backward', 'word')
          return true
        case 'w':
          kill(true)
          return true
        case '<':
          toDocumentEdge(editor, false, marking)
          return true
        case '>':
          toDocumentEdge(editor, true, marking)
          return true
        default:
          return false
      }
    }
    return false
  }
}

// ---------------------------------------------------------------------- Vim

function vimKeys(
  editor: Editor,
  register: Register,
  options: KeyPresetOptions,
): (event: KeyboardEvent) => boolean {
  const surface = editor.view?.dom
  let mode: VimMode = 'normal'
  /** A count typed before a command: the `3` of `3j`. */
  let count = ''
  /** The first key of a two-key command: `d` of `dd`, `g` of `gg`. */
  let pending = ''
  const setMode = (next: VimMode): void => {
    mode = next
    count = ''
    pending = ''
    if (surface) surface.dataset.trevixalKeyMode = next
    if (next !== 'visual' && !editor.state.selection.empty) collapse(editor)
    options.onMode?.(next)
  }
  setMode('normal')

  const times = (): number => Math.min(500, Math.max(1, Number.parseInt(count, 10) || 1))
  const move = (direction: Direction, unit: Unit): void => {
    const alter = mode === 'visual' ? 'extend' : 'move'
    for (let n = times(); n > 0; n--) modify(editor, alter, direction, unit)
  }
  /** A word motion, found in the block's text; past its edge, on to the next line or back. */
  const word = (motion: 'w' | 'e' | 'b'): void => {
    for (let n = times(); n > 0; n--) {
      const selection = editor.state.selection
      const head = headOf(selection)
      const target = wordTarget(inlineText(editor, head.path), head.offset, motion)
      if (target === null) {
        const alter = mode === 'visual' ? 'extend' : 'move'
        modify(editor, alter, motion === 'b' ? 'backward' : 'forward', 'character')
        continue
      }
      const next = pos(head.path, target)
      const anchor = mode === 'visual' ? anchorOf(selection) : next
      editor.dispatch(editor.state.tr.setSelection(new TextSelection(anchor, next)))
    }
  }
  /** Select the line the caret is on, and its line break, for dd and yy. */
  const selectLine = (): void => {
    modify(editor, 'move', 'backward', 'lineboundary')
    modify(editor, 'extend', 'forward', 'lineboundary')
    modify(editor, 'extend', 'forward', 'character')
  }
  const take = (linewise: boolean, remove: boolean): void => {
    if (editor.state.selection.empty) return
    register.text = selectedText(editor).replace(/\n$/, '')
    register.linewise = linewise
    if (remove) editor.exec(ownStep(deleteSelection))
  }
  const put = (after: boolean): void => {
    if (!register.text) return
    if (register.linewise) {
      modify(editor, 'move', after ? 'forward' : 'backward', 'lineboundary')
      editor.exec(ownStep(enter))
      if (!after) modify(editor, 'move', 'backward', 'line')
    } else if (after) {
      modify(editor, 'move', 'forward', 'character')
    }
    typeText(editor, register.text)
  }

  const normal = (event: KeyboardEvent): boolean => {
    const key = event.key
    if (event.ctrlKey && !event.metaKey && key.toLowerCase() === 'r') {
      editor.redo()
      return true
    }
    // Keys that would edit in normal mode move instead, as in Vim.
    if (key === 'Enter') {
      move('forward', 'line')
      return true
    }
    if (key === 'Backspace') {
      move('backward', 'character')
      return true
    }
    if (key === 'Delete') {
      editor.exec(deleteCharForward)
      return true
    }
    if (!isTyping(event)) return key === 'Escape'
    if (/^[1-9]$/.test(key) || (key === '0' && count)) {
      count += key
      return true
    }
    const command = pending + key
    pending = ''
    switch (command) {
      case 'h':
        move('backward', 'character')
        break
      case 'l':
        move('forward', 'character')
        break
      case 'j':
        move('forward', 'line')
        break
      case 'k':
        move('backward', 'line')
        break
      case 'w':
      case 'e':
      case 'b':
        word(command)
        break
      case '0':
      case '^':
        move('backward', 'lineboundary')
        break
      case '$':
        move('forward', 'lineboundary')
        break
      case 'gg':
        toDocumentEdge(editor, false, mode === 'visual')
        break
      case 'G':
        toDocumentEdge(editor, true, mode === 'visual')
        break
      case 'i':
        setMode('insert')
        return true
      case 'a':
        modify(editor, 'move', 'forward', 'character')
        setMode('insert')
        return true
      case 'I':
        modify(editor, 'move', 'backward', 'lineboundary')
        setMode('insert')
        return true
      case 'A':
        modify(editor, 'move', 'forward', 'lineboundary')
        setMode('insert')
        return true
      case 'o':
        modify(editor, 'move', 'forward', 'lineboundary')
        editor.exec(ownStep(enter))
        setMode('insert')
        return true
      case 'O':
        modify(editor, 'move', 'backward', 'lineboundary')
        editor.exec(ownStep(enter))
        modify(editor, 'move', 'backward', 'line')
        setMode('insert')
        return true
      case 'x':
        editor.exec(ownStep(deleteCharForward))
        for (let n = times() - 1; n > 0; n--) editor.exec(deleteCharForward)
        break
      case 'X':
        editor.exec(ownStep(deleteCharBackward))
        for (let n = times() - 1; n > 0; n--) editor.exec(deleteCharBackward)
        break
      case 'dd':
        selectLine()
        take(true, true)
        break
      case 'yy': {
        const caret = headOf(editor.state.selection)
        selectLine()
        take(true, false)
        editor.dispatch(editor.state.tr.setSelection(new TextSelection(caret)))
        break
      }
      case 'D':
        modify(editor, 'extend', 'forward', 'lineboundary')
        take(false, true)
        break
      case 'p':
        put(true)
        break
      case 'P':
        put(false)
        break
      case 'u':
        editor.undo()
        break
      case 'v':
        setMode('visual')
        return true
      case 'd':
      case 'g':
      case 'y':
        pending = key
        return true
      default:
        break
    }
    count = ''
    return true
  }

  const visual = (event: KeyboardEvent): boolean => {
    if (event.key === 'Escape') {
      setMode('normal')
      return true
    }
    if (!isTyping(event)) return false
    switch (event.key) {
      case 'y':
        take(false, false)
        setMode('normal')
        return true
      case 'd':
      case 'x':
        take(false, true)
        setMode('normal')
        return true
      default:
        return normal(event)
    }
  }

  return (event) => {
    if (mode === 'insert') {
      if (event.key === 'Escape' || (event.ctrlKey && event.key === '[')) {
        setMode('normal')
        return true
      }
      return false
    }
    if (mode === 'visual') return visual(event)
    if (event.key === 'Escape') {
      count = ''
      pending = ''
      return true
    }
    return normal(event)
  }
}
