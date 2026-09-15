import type { Editor } from '../editor/editor'
import { inlineSize } from '../model/inline'
import type { TextNode } from '../model/node'
import type { Path } from '../model/tree'
import { nodeAtPath } from '../model/tree'
import type { EditorState } from '../state/editor-state'
import { TextSelection } from '../state/selection'

export interface TriggerOptions {
  /** The trigger sequence, e.g. `'@'`, `'/'`, `':'`. */
  readonly char: string
  /** Allow whitespace inside the query (multi-word item names). */
  readonly allowSpaces?: boolean
  /** Only match when the trigger sits at the very start of the block. */
  readonly startOfBlock?: boolean
}

/** An active trigger: `[from, to)` spans the trigger char plus the query. */
export interface TriggerMatch {
  readonly path: Path
  readonly from: number
  readonly to: number
  readonly query: string
}

/**
 * Find an active trigger ending at the caret. The scan covers the contiguous
 * text run before the caret (inline atoms break it) and requires the trigger
 * char to open the block or follow whitespace.
 */
export function findTrigger(state: EditorState, options: TriggerOptions): TriggerMatch | null {
  const selection = state.selection
  if (!(selection instanceof TextSelection) || !selection.empty) return null
  const path = selection.head.path
  const caret = selection.head.offset
  const block = nodeAtPath(state.doc, path)
  if (!block?.isTextblock) return null

  // Contiguous text immediately before the caret.
  let text = ''
  let offset = 0
  for (const child of block.content.children) {
    if (offset >= caret) break
    const size = inlineSize(child)
    if (child.isText) {
      text += (child as TextNode).text.slice(0, Math.max(0, caret - offset))
    } else {
      text = '' // atoms terminate the run; restart after them
    }
    offset += size
  }
  const base = caret - text.length

  const index = text.lastIndexOf(options.char)
  if (index < 0) return null
  if (options.startOfBlock && base + index !== 0) return null
  const before = index > 0 ? text[index - 1] : undefined
  if (before !== undefined && !/\s/.test(before)) return null
  const query = text.slice(index + options.char.length)
  if (!options.allowSpaces && /\s/.test(query)) return null
  return { path, from: base + index, to: caret, query }
}

export interface SuggestionOptions extends TriggerOptions {
  /** A trigger became active. */
  readonly onStart?: (match: TriggerMatch) => void
  /** The query of the active trigger changed. */
  readonly onUpdate?: (match: TriggerMatch) => void
  /** The trigger was dismissed (deleted, caret left, editor blurred it). */
  readonly onExit?: () => void
  /** Consume keys while active (popup navigation). Return true when handled. */
  readonly onKeyDown?: (event: KeyboardEvent, match: TriggerMatch) => boolean
}

/** Popup state handed to {@link SuggestionListOptions.onState}. */
export interface SuggestionListState<T> {
  readonly items: readonly T[]
  readonly selectedIndex: number
  readonly match: TriggerMatch
}

export interface SuggestionListOptions<T> extends TriggerOptions {
  /** Items for a query; async providers are raced (stale results dropped). */
  readonly items: (query: string) => readonly T[] | Promise<readonly T[]>
  /** Render hook: the current popup state, or null when closed. */
  readonly onState: (state: SuggestionListState<T> | null) => void
  /** An item was chosen (Enter/Tab, or programmatically via `select`). */
  readonly onSelect: (item: T, match: TriggerMatch) => void
}

export interface SuggestionListHandle {
  /** Choose an item (mouse click in a popup). */
  select(index: number): void
  dispose(): void
}

/**
 * The full popup driver shared by the slash and emoji triggers: trigger
 * watching, item fetching, keyboard navigation (arrows, Enter/Tab, Escape).
 * UI-free: render through `onState`.
 */
export function suggestionList<T>(
  editor: Editor,
  options: SuggestionListOptions<T>,
): SuggestionListHandle {
  let state: SuggestionListState<T> | null = null
  let dismissed = false
  let fetchId = 0

  const setState = (next: SuggestionListState<T> | null): void => {
    state = next
    options.onState(next)
  }

  const load = (match: TriggerMatch): void => {
    const id = ++fetchId
    Promise.resolve(options.items(match.query)).then(
      (items) => {
        if (id !== fetchId || dismissed) return
        setState({ items, selectedIndex: 0, match })
      },
      () => {
        if (id === fetchId) setState(null)
      },
    )
  }

  const pick = (index: number): void => {
    const current = state
    const item = current?.items[index]
    if (!current || item === undefined) return
    setState(null)
    dismissed = true // the insert edits the doc; ignore until the trigger exits
    options.onSelect(item, current.match)
  }

  const dispose = suggestion(editor, {
    char: options.char,
    allowSpaces: options.allowSpaces,
    startOfBlock: options.startOfBlock,
    onStart: (match) => {
      dismissed = false
      load(match)
    },
    onUpdate: (match) => {
      if (!dismissed) load(match)
    },
    onExit: () => {
      fetchId++
      dismissed = false
      setState(null)
    },
    onKeyDown: (event) => {
      if (event.key === 'Escape') {
        if (!state && dismissed) return false
        fetchId++
        dismissed = true
        setState(null)
        return true
      }
      if (!state || state.items.length === 0) return false
      const { items, selectedIndex, match } = state
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const delta = event.key === 'ArrowDown' ? 1 : -1
        const next = (selectedIndex + delta + items.length) % items.length
        setState({ items, selectedIndex: next, match })
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        pick(selectedIndex)
        return true
      }
      return false
    },
  })

  return {
    select: pick,
    dispose: () => {
      dispose()
      setState(null)
    },
  }
}

/**
 * Watch the editor for a trigger character and drive suggestion-popup
 * callbacks. Keyboard interception attaches once a view exists. Returns a
 * disposer.
 */
export function suggestion(editor: Editor, options: SuggestionOptions): () => void {
  let active: TriggerMatch | null = null
  let detachKeys: (() => void) | null = null

  const attachKeys = (): void => {
    if (detachKeys || !editor.view) return
    detachKeys = editor.view.addKeydownInterceptor((event) => {
      if (!active) return false
      return options.onKeyDown?.(event, active) ?? false
    })
  }

  const check = (): void => {
    attachKeys()
    const match = findTrigger(editor.state, options)
    if (match) {
      const started = active === null
      active = match
      if (started) options.onStart?.(match)
      else options.onUpdate?.(match)
    } else if (active) {
      active = null
      options.onExit?.()
    }
  }

  const unsubscribe = editor.on('transaction', check)
  attachKeys()
  return () => {
    unsubscribe()
    detachKeys?.()
    if (active) {
      active = null
      options.onExit?.()
    }
  }
}
