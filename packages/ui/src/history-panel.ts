import type { Editor, HistoryEntry } from '@trevixal/core'

export interface HistoryPanelOptions {
  readonly container: HTMLElement
  /** Most entries shown; the oldest beyond this are folded into a count. */
  readonly limit?: number
  readonly now?: () => number
}

export interface HistoryPanel {
  readonly element: HTMLElement
  refresh(): void
  destroy(): void
}

/** `14:02:05` for a history row. */
function clock(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/**
 * A visible undo history: the "History" panel of image editors. Past groups
 * are listed oldest first with the current state marked; undone groups follow,
 * greyed out. Clicking any row jumps there by undoing or redoing the right
 * number of times, so the panel never bypasses the history it displays.
 */
export function createHistoryPanel(editor: Editor, options: HistoryPanelOptions): HistoryPanel {
  const document = options.container.ownerDocument
  const limit = options.limit ?? 100
  const root = document.createElement('section')
  root.className = 'trevixal-history'
  root.setAttribute('aria-label', 'Edit history')

  const toolbar = document.createElement('div')
  toolbar.className = 'trevixal-history__bar'
  const undo = document.createElement('button')
  undo.type = 'button'
  undo.className = 'trevixal-history__button'
  undo.textContent = 'Undo'
  undo.addEventListener('click', () => editor.undo())
  const redo = document.createElement('button')
  redo.type = 'button'
  redo.className = 'trevixal-history__button'
  redo.textContent = 'Redo'
  redo.addEventListener('click', () => editor.redo())
  const clear = document.createElement('button')
  clear.type = 'button'
  clear.className = 'trevixal-history__button trevixal-history__button--quiet'
  clear.textContent = 'Clear'
  clear.title = 'Forget the undo history'
  clear.addEventListener('click', () => editor.clearHistory())
  toolbar.append(undo, redo, clear)

  const list = document.createElement('ol')
  list.className = 'trevixal-history__list'
  root.append(toolbar, list)

  const row = (
    entry: HistoryEntry | null,
    kind: 'origin' | 'past' | 'current' | 'future',
    jump: () => void,
  ): HTMLLIElement => {
    const item = document.createElement('li')
    item.className = `trevixal-history__item trevixal-history__item--${kind}`
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'trevixal-history__entry'
    if (kind === 'current') button.setAttribute('aria-current', 'step')
    const label = document.createElement('span')
    label.className = 'trevixal-history__label'
    label.textContent = entry ? entry.label : 'Opened document'
    button.appendChild(label)
    if (entry) {
      const meta = document.createElement('span')
      meta.className = 'trevixal-history__meta'
      meta.textContent =
        entry.size > 1 ? `${clock(entry.timestamp)} · ${entry.size} edits` : clock(entry.timestamp)
      button.appendChild(meta)
    }
    button.addEventListener('click', jump)
    item.appendChild(button)
    return item
  }

  const refresh = (): void => {
    const { undo: past, redo: future } = editor.historyEntries()
    undo.disabled = past.length === 0
    redo.disabled = future.length === 0
    clear.disabled = past.length === 0 && future.length === 0
    list.replaceChildren()

    const hidden = Math.max(0, past.length - limit)
    if (hidden > 0) {
      const more = document.createElement('li')
      more.className = 'trevixal-history__item trevixal-history__item--more'
      more.textContent = `${hidden} earlier ${hidden === 1 ? 'edit' : 'edits'}`
      list.appendChild(more)
    } else {
      list.appendChild(
        row(null, past.length === 0 ? 'current' : 'origin', () => {
          for (let i = 0; i < past.length; i++) editor.undo()
        }),
      )
    }
    past.slice(hidden).forEach((entry, offset) => {
      const index = hidden + offset
      const stepsBack = past.length - 1 - index
      list.appendChild(
        row(entry, stepsBack === 0 ? 'current' : 'past', () => {
          for (let i = 0; i < stepsBack; i++) editor.undo()
        }),
      )
    })
    // The redo stack's last entry is the next to reapply, so list it first.
    for (let i = future.length - 1; i >= 0; i--) {
      const stepsForward = future.length - i
      const entry = future[i] as HistoryEntry
      list.appendChild(
        row(entry, 'future', () => {
          for (let step = 0; step < stepsForward; step++) editor.redo()
        }),
      )
    }
  }

  refresh()
  const unsubscribe = editor.on('transaction', refresh)
  options.container.appendChild(root)
  return {
    element: root,
    refresh,
    destroy() {
      unsubscribe()
      root.remove()
    },
  }
}
