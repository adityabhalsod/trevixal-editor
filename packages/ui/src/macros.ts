import {
  type Command,
  type Editor,
  chainCommands,
  deleteCharBackward,
  deleteCharForward,
  insertInlineNode,
  insertNewlineInPreformatted,
  insertText,
} from '@trevixal/core'
import { type Direction, type Unit, enter, modify } from './key-presets'

/**
 * Word's macros, the simple kind: record what you do, typing, the keys that
 * move the caret, and the commands you run from the menus and shortcuts,
 * then play it back with one key wherever the caret is.
 */
export type MacroStep =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'key'; readonly key: 'enter' | 'backspace' | 'delete' | 'lineBreak' }
  | {
      readonly kind: 'move'
      readonly alter: 'move' | 'extend'
      readonly direction: Direction
      readonly unit: Unit
    }
  | { readonly kind: 'command'; readonly name: string; readonly run: (editor: Editor) => void }

export interface Macros {
  readonly recording: boolean
  /** How many steps the recorded macro has. */
  readonly length: number
  /** Start recording, dropping the macro recorded before. */
  record(): void
  stop(): void
  /** Record a command the chrome ran: a menu entry or a shortcut. */
  note(name: string, run: (editor: Editor) => void): void
  /** Play the recorded macro at the caret; false when there is none. */
  play(): boolean
  /** Told when recording starts or stops. */
  onChange(listener: (recording: boolean) => void): () => void
  destroy(): void
}

/** The keys that move the caret, as moves the browser's selection can make. */
function moveOf(event: KeyboardEvent): Omit<Extract<MacroStep, { kind: 'move' }>, 'kind'> | null {
  const alter = event.shiftKey ? 'extend' : 'move'
  const word = event.ctrlKey || event.altKey
  switch (event.key) {
    case 'ArrowLeft':
      return { alter, direction: 'backward', unit: word ? 'word' : 'character' }
    case 'ArrowRight':
      return { alter, direction: 'forward', unit: word ? 'word' : 'character' }
    case 'ArrowUp':
      return { alter, direction: 'backward', unit: 'line' }
    case 'ArrowDown':
      return { alter, direction: 'forward', unit: 'line' }
    case 'Home':
      return { alter, direction: 'backward', unit: 'lineboundary' }
    case 'End':
      return { alter, direction: 'forward', unit: 'lineboundary' }
    default:
      return null
  }
}

const KEYS: Readonly<Record<string, Extract<MacroStep, { kind: 'key' }>['key']>> = {
  insertParagraph: 'enter',
  insertLineBreak: 'lineBreak',
  deleteContentBackward: 'backspace',
  deleteContentForward: 'delete',
}

const KEY_COMMANDS: Readonly<Record<Extract<MacroStep, { kind: 'key' }>['key'], Command>> = {
  enter,
  backspace: deleteCharBackward,
  delete: deleteCharForward,
  lineBreak: chainCommands(insertNewlineInPreformatted, insertInlineNode('hardBreak')),
}

export function createMacros(editor: Editor): Macros {
  const view = editor.view
  let steps: MacroStep[] = []
  let recording = false
  const listeners = new Set<(recording: boolean) => void>()
  const tell = (): void => {
    for (const listener of listeners) listener(recording)
  }

  const push = (step: MacroStep): void => {
    const last = steps[steps.length - 1]
    // A run of typing is one step, however many keys it took.
    if (step.kind === 'text' && last?.kind === 'text') {
      steps[steps.length - 1] = { kind: 'text', text: last.text + step.text }
      return
    }
    steps.push(step)
  }

  const onBeforeInput = (event: InputEvent): void => {
    if (!recording || event.isComposing) return
    if (event.inputType === 'insertText' && event.data) push({ kind: 'text', text: event.data })
    const key = KEYS[event.inputType]
    if (key) push({ kind: 'key', key })
  }
  const onCompositionEnd = (event: CompositionEvent): void => {
    if (recording && event.data) push({ kind: 'text', text: event.data })
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!recording || event.metaKey) return
    const move = moveOf(event)
    if (move) push({ kind: 'move', ...move })
  }
  view?.dom.addEventListener('beforeinput', onBeforeInput, true)
  view?.dom.addEventListener('compositionend', onCompositionEnd, true)
  view?.dom.addEventListener('keydown', onKeyDown, true)

  return {
    get recording() {
      return recording
    },
    get length() {
      return steps.length
    },
    record() {
      steps = []
      recording = true
      tell()
    },
    stop() {
      if (!recording) return
      recording = false
      tell()
    },
    note(name, run) {
      if (recording) push({ kind: 'command', name, run })
    },
    play() {
      if (recording || steps.length === 0) return false
      // A key can arrive before the browser has reported the click that
      // moved the caret: take the caret from the page, not the last one known.
      editor.view?.syncSelectionFromDOM()
      editor.view?.focus()
      for (const step of steps) {
        if (step.kind === 'text') editor.exec(insertText(step.text))
        else if (step.kind === 'key') editor.exec(KEY_COMMANDS[step.key])
        else if (step.kind === 'move') modify(editor, step.alter, step.direction, step.unit)
        else step.run(editor)
      }
      return true
    },
    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    destroy() {
      view?.dom.removeEventListener('beforeinput', onBeforeInput, true)
      view?.dom.removeEventListener('compositionend', onCompositionEnd, true)
      view?.dom.removeEventListener('keydown', onKeyDown, true)
      listeners.clear()
    },
  }
}
