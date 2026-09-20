import {
  exitEnclosingBlock,
  exitPreformatted,
  indentInPreformatted,
  outdentInPreformatted,
} from '../commands/commands'
import type { Editor } from '../editor/editor'

/** A key binding runs against the editor; returning true consumes the event. */
export type KeyBinding = (editor: Editor) => boolean

export type Keymap = Readonly<Record<string, KeyBinding>>

/**
 * Normalize a binding name like `"Mod-Shift-z"` to a canonical form.
 * `Mod` is Cmd on Apple platforms and Ctrl elsewhere.
 */
export function normalizeKeyName(name: string, isMac: boolean): string {
  const parts = name.split('-')
  const key = parts.pop() ?? ''
  let mods = ''
  for (const part of parts) {
    const lower = part.toLowerCase()
    if (lower === 'mod') mods += isMac ? 'm' : 'c'
    else if (lower === 'ctrl' || lower === 'control') mods += 'c'
    else if (lower === 'meta' || lower === 'cmd') mods += 'm'
    else if (lower === 'alt') mods += 'a'
    else if (lower === 'shift') mods += 's'
    else throw new RangeError(`Unknown modifier "${part}" in key binding "${name}"`)
  }
  return `${[...mods].sort().join('')}-${key.length === 1 ? key.toLowerCase() : key}`
}

function eventKeyName(event: KeyboardEvent): string {
  let mods = ''
  if (event.altKey) mods += 'a'
  if (event.ctrlKey) mods += 'c'
  if (event.metaKey) mods += 'm'
  if (event.shiftKey) mods += 's'
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  return `${[...mods].sort().join('')}-${key}`
}

/**
 * Build a keydown handler from a keymap. Single-character bindings with only
 * Shift held are ignored (that's typing, handled by beforeinput).
 */
export function keydownHandler(
  bindings: Keymap,
  editor: Editor,
  isMac: boolean,
): (event: KeyboardEvent) => boolean {
  const normalized = new Map<string, KeyBinding>()
  for (const [name, binding] of Object.entries(bindings)) {
    normalized.set(normalizeKeyName(name, isMac), binding)
  }
  return (event) => {
    const binding = normalized.get(eventKeyName(event))
    if (!binding) return false
    return binding(editor)
  }
}

/**
 * Combine keymaps so a key bound by more than one of them tries each binding
 * in turn, earliest first, until one consumes the event.
 *
 * Spreading them into one object instead would keep only the last binding for
 * a shared key, which is silent: the editor still works, one extension's
 * handling of that key simply never runs again. Enter is bound by both the
 * table and the block keymaps, and that is exactly how it would go missing.
 */
export function mergeKeymaps(...keymaps: readonly Keymap[]): Keymap {
  const merged: Record<string, KeyBinding> = {}
  for (const keymap of keymaps) {
    for (const [key, binding] of Object.entries(keymap)) {
      const existing = merged[key]
      merged[key] = existing ? (editor) => existing(editor) || binding(editor) : binding
    }
  }
  return merged
}

/** The stock shortcuts: marks, undo/redo, list indent. Enter/Backspace ride on beforeinput. */
export function baseKeymap(): Keymap {
  return {
    'Mod-b': (editor) => editor.commands.toggleMark('bold'),
    'Mod-i': (editor) => editor.commands.toggleMark('italic'),
    'Mod-u': (editor) => editor.commands.toggleMark('underline'),
    'Mod-e': (editor) => editor.commands.toggleMark('code'),
    'Mod-z': (editor) => editor.commands.undo() || true,
    'Mod-Shift-z': (editor) => editor.commands.redo() || true,
    'Mod-y': (editor) => editor.commands.redo() || true,
    // In a code block these indent by two spaces; in a list they indent the
    // item; elsewhere they fall through to the browser, so Tab still moves
    // focus out of the editor the way keyboard users expect.
    Tab: (editor) => editor.exec(indentInPreformatted) || editor.commands.sinkListItem(),
    'Shift-Tab': (editor) => editor.exec(outdentInPreformatted) || editor.commands.liftListItem(),
    // Out of a code block from anywhere inside it, and out of any other
    // structure from anywhere inside that: a blockquote, a table cell, a
    // callout. In a top-level block the key stays free.
    'Mod-Enter': (editor) => editor.exec(exitPreformatted) || editor.exec(exitEnclosingBlock),
  }
}
