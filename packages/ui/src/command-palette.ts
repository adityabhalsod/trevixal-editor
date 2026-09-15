import type { Editor, EditorSnapshot } from '@trevixal/core'
import { type IconName, createIcon } from './icons'
import type { Menu, MenuItem } from './menubar'

/** One entry the palette can run. The host decides what is on offer. */
export interface PaletteCommand {
  readonly name: string
  readonly label: string
  readonly icon?: IconName
  /** Extra words the fuzzy filter should match, e.g. `['h1', 'title']`. */
  readonly keywords?: readonly string[]
  /** Group heading, e.g. "Format". Entries keep their given order within one. */
  readonly group?: string
  /** Shown right-aligned. Display only. */
  readonly shortcut?: string
  readonly run: (editor: Editor) => void
  readonly isEnabled?: (snapshot: EditorSnapshot) => boolean
}

export interface CommandPaletteOptions {
  /**
   * The commands on offer. The palette never invents its own.
   *
   * Pass a function to have them collected each time the palette opens,
   * needed when the source is built after the palette itself, and it keeps a
   * derived list (see {@link paletteCommandsFromMenus}) current.
   */
  readonly commands: readonly PaletteCommand[] | (() => readonly PaletteCommand[])
  /** Where the overlay is appended (default: the document body). */
  readonly container?: HTMLElement
  readonly placeholder?: string
  readonly emptyLabel?: string
  /** Bind Ctrl/Cmd+K and Ctrl/Cmd+Shift+P (default true). */
  readonly bindShortcuts?: boolean
  /** Cap on rendered rows (default 50). The filter runs over everything. */
  readonly maxResults?: number
}

export interface CommandPalette {
  readonly element: HTMLElement
  readonly isOpen: boolean
  open(): void
  close(): void
  /** The commands matching the current query, in ranked order. */
  readonly results: readonly PaletteCommand[]
  /** Run the highlighted command and close. */
  runSelected(): void
  destroy(): void
}

/**
 * Subsequence score for a query against a candidate string.
 *
 * Returns null when the query's characters do not appear in order, the
 * standard fuzzy contract. Matches at a word boundary and runs of consecutive
 * characters score higher, so typing "bl" ranks "Bullet List" above
 * "Table" even though both contain the letters.
 */
export function fuzzyScore(query: string, candidate: string): number | null {
  if (query.length === 0) return 0
  const needle = query.toLowerCase()
  const haystack = candidate.toLowerCase()
  let score = 0
  let cursor = 0
  let previousIndex = -1
  for (const character of needle) {
    if (character === ' ') continue
    const index = haystack.indexOf(character, cursor)
    if (index === -1) return null
    score += 1
    if (index === previousIndex + 1) score += 4 // consecutive
    if (index === 0 || /[\s\-_/]/.test(haystack[index - 1] ?? '')) score += 3 // word start
    previousIndex = index
    cursor = index + 1
  }
  // Prefer shorter candidates when scores tie, so exact-ish hits float up.
  return score - candidate.length * 0.01
}

/** Rank commands against a query; an empty query keeps the given order. */
export function filterCommands(
  commands: readonly PaletteCommand[],
  query: string,
): readonly PaletteCommand[] {
  const trimmed = query.trim()
  if (trimmed.length === 0) return commands
  const scored: { command: PaletteCommand; score: number }[] = []
  for (const command of commands) {
    const haystacks = [command.label, ...(command.keywords ?? []), command.group ?? '']
    let best: number | null = null
    for (const haystack of haystacks) {
      const score = fuzzyScore(trimmed, haystack)
      if (score !== null && (best === null || score > best)) best = score
    }
    if (best !== null) scored.push({ command, score: best })
  }
  // Stable within equal scores, because sort is stable and the input order is
  // the host's chosen order.
  scored.sort((a, b) => b.score - a.score)
  return scored.map((entry) => entry.command)
}

/**
 * Bring a row into view inside its own scroller, and nowhere else.
 *
 * `Element.scrollIntoView` offers no way to say "this box only": it adjusts
 * every scrollable ancestor up to and including the document. The palette
 * floats over a page the reader has scrolled on purpose, so the list does the
 * arithmetic itself. Measured rather than read off `offsetTop`, which is
 * relative to the offset parent and only equals the list when the list
 * happens to be positioned.
 */
function scrollRowIntoView(list: HTMLElement, row: HTMLElement): void {
  if (typeof list.getBoundingClientRect !== 'function') return
  const listBox = list.getBoundingClientRect()
  const rowBox = row.getBoundingClientRect()
  if (rowBox.top < listBox.top) list.scrollTop -= listBox.top - rowBox.top
  else if (rowBox.bottom > listBox.bottom) list.scrollTop += rowBox.bottom - listBox.bottom
}

/**
 * A Ctrl/Cmd+K command palette over the host's command list.
 *
 * The palette is presentation only: it filters, navigates and calls `run`. It
 * has no opinion about which commands exist, so an application can offer a
 * different set per document, per role or per selection.
 */
export function createCommandPalette(
  editor: Editor,
  options: CommandPaletteOptions,
): CommandPalette {
  const doc = options.container?.ownerDocument ?? editor.view?.dom.ownerDocument ?? document
  const container = options.container ?? doc.body
  const maxResults = options.maxResults ?? 50

  const overlay = doc.createElement('div')
  overlay.className = 'trevixal-palette-overlay'
  overlay.hidden = true

  const root = doc.createElement('div')
  root.className = 'trevixal-palette'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', 'Command palette')

  const input = doc.createElement('input')
  input.type = 'text'
  input.className = 'trevixal-palette__input'
  input.placeholder = options.placeholder ?? 'Type a command…'
  input.setAttribute('aria-label', 'Search commands')
  input.setAttribute('role', 'combobox')
  input.setAttribute('aria-expanded', 'true')
  input.setAttribute('aria-autocomplete', 'list')

  const list = doc.createElement('div')
  list.className = 'trevixal-palette__list'
  list.setAttribute('role', 'listbox')
  input.setAttribute('aria-controls', 'trevixal-palette-list')
  list.id = 'trevixal-palette-list'

  root.append(input, list)
  overlay.appendChild(root)
  container.appendChild(overlay)

  let results: readonly PaletteCommand[] = []
  let selected = 0
  /** Where focus was before the palette took it, to hand it back on close. */
  let previouslyFocused: HTMLElement | null = null
  /** Rows parallel to `results`. */
  let rows: HTMLElement[] = []

  const render = (): void => {
    const snapshot = editor.getSnapshot()
    list.replaceChildren()
    rows = []

    if (results.length === 0) {
      const empty = doc.createElement('p')
      empty.className = 'trevixal-palette__empty'
      empty.textContent = options.emptyLabel ?? 'No matching commands'
      list.appendChild(empty)
      return
    }

    let lastGroup: string | null = null
    results.slice(0, maxResults).forEach((command, index) => {
      if (command.group && command.group !== lastGroup) {
        const heading = doc.createElement('div')
        heading.className = 'trevixal-palette__group'
        heading.textContent = command.group
        list.appendChild(heading)
        lastGroup = command.group
      }

      const row = doc.createElement('button')
      row.type = 'button'
      row.className = 'trevixal-palette__item'
      row.setAttribute('role', 'option')
      row.id = `trevixal-palette-item-${index}`
      row.dataset.trevixalCommand = command.name
      row.dataset.trevixalIndex = String(index)
      row.disabled = command.isEnabled ? !command.isEnabled(snapshot) : false

      const glyph = doc.createElement('span')
      glyph.className = 'trevixal-palette__icon'
      const icon = command.icon ? createIcon(doc, command.icon) : null
      if (icon) glyph.appendChild(icon)

      const label = doc.createElement('span')
      label.className = 'trevixal-palette__label'
      label.textContent = command.label

      row.append(glyph, label)
      if (command.shortcut) {
        const shortcut = doc.createElement('span')
        shortcut.className = 'trevixal-palette__shortcut'
        shortcut.textContent = command.shortcut
        row.appendChild(shortcut)
      }
      // Keep the editor selection: the command acts on it.
      row.addEventListener('mousedown', (event) => event.preventDefault())
      list.appendChild(row)
      rows.push(row)
    })
    markSelected()
  }

  const markSelected = (): void => {
    if (rows.length === 0) return
    selected = Math.min(Math.max(selected, 0), rows.length - 1)
    rows.forEach((row, index) => {
      const on = index === selected
      row.classList.toggle('trevixal-palette__item--selected', on)
      row.setAttribute('aria-selected', String(on))
      if (on) {
        input.setAttribute('aria-activedescendant', row.id)
        // Scroll the list, never the page. `scrollIntoView` walks every
        // scrollable ancestor, and the overlay sits over a document that is
        // usually scrolled somewhere the reader chose.
        scrollRowIntoView(list, row)
      }
    })
  }

  const refresh = (): void => {
    const available = typeof options.commands === 'function' ? options.commands() : options.commands
    results = filterCommands(available, input.value)
    selected = 0
    render()
  }

  const run = (command: PaletteCommand | undefined): void => {
    if (!command) return
    if (command.isEnabled && !command.isEnabled(editor.getSnapshot())) return
    api.close()
    editor.view?.focus()
    command.run(editor)
  }

  const move = (delta: number): void => {
    if (rows.length === 0) return
    selected = (selected + delta + rows.length) % rows.length
    markSelected()
  }

  const onInput = (): void => refresh()

  const onKeyDown = (event: KeyboardEvent): void => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        move(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        move(-1)
        break
      case 'Enter':
        event.preventDefault()
        run(results[selected])
        break
      case 'Escape':
        event.preventDefault()
        api.close()
        break
      default:
        break
    }
  }

  const onListClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null
    const row = target?.closest?.('[data-trevixal-index]') as HTMLElement | null
    if (!row || (row as HTMLButtonElement).disabled) return
    run(results[Number(row.dataset.trevixalIndex)])
  }

  const onOverlayPointerDown = (event: Event): void => {
    // Clicking the backdrop, not the panel, dismisses.
    if (event.target === overlay) api.close()
  }

  input.addEventListener('input', onInput)
  input.addEventListener('keydown', onKeyDown)
  list.addEventListener('click', onListClick as EventListener)
  overlay.addEventListener('pointerdown', onOverlayPointerDown)

  /** Ctrl/Cmd+K and Ctrl/Cmd+Shift+P, from anywhere in the document. */
  const onGlobalKeyDown = (event: KeyboardEvent): void => {
    if (!(event.ctrlKey || event.metaKey)) return
    const key = event.key.toLowerCase()
    const wanted = key === 'k' || (event.shiftKey && key === 'p')
    if (!wanted) return
    event.preventDefault()
    if (overlay.hidden) api.open()
    else api.close()
  }
  if (options.bindShortcuts !== false) {
    doc.addEventListener('keydown', onGlobalKeyDown)
  }

  const api: CommandPalette = {
    element: overlay,
    get isOpen() {
      return !overlay.hidden
    },
    open() {
      if (!overlay.hidden) return
      previouslyFocused = doc.activeElement as HTMLElement | null
      overlay.hidden = false
      input.value = ''
      refresh()
      input.focus()
    },
    close() {
      if (overlay.hidden) return
      overlay.hidden = true
      results = []
      rows = []
      list.replaceChildren()
      // Dismissing must not strand focus on the hidden input. `run` focuses
      // the editor after closing, so a command still lands in the document.
      //
      // `preventScroll`, because the element focus goes back to is usually the
      // editor surface: it can be thousands of pixels tall, its caret nowhere
      // near what the reader was looking at, and a plain `focus()` scrolls the
      // caret into view. Opening the palette and pressing Escape would then
      // leave the page somewhere else entirely.
      const restore = previouslyFocused
      previouslyFocused = null
      if (restore?.isConnected) restore.focus?.({ preventScroll: true })
    },
    get results() {
      return results
    },
    runSelected() {
      run(results[selected])
    },
    destroy() {
      if (options.bindShortcuts !== false) doc.removeEventListener('keydown', onGlobalKeyDown)
      input.removeEventListener('input', onInput)
      input.removeEventListener('keydown', onKeyDown)
      list.removeEventListener('click', onListClick as EventListener)
      overlay.removeEventListener('pointerdown', onOverlayPointerDown)
      overlay.remove()
    },
  }

  return api
}

/**
 * Turn wired menus into palette commands. Every entry the menus offer, with
 * the icon and shortcut it already prints.
 *
 * Hand-listing the palette's contents means it drifts: the menus grow and the
 * palette quietly keeps offering the dozen commands somebody typed out once.
 * Deriving it instead means an entry reachable from a menu is reachable from
 * the palette by construction. Separators and entries the host never wired are
 * skipped, since `withActions` has already dropped the latter.
 *
 * A submenu contributes its children, not itself: `Download as` is not a
 * command, `Word document (.docx)` is. The parent's label is folded into the
 * child's keywords so typing `download docx` still finds it.
 */
export function paletteCommandsFromMenus(menus: readonly Menu[]): PaletteCommand[] {
  const commands: PaletteCommand[] = []
  const seen = new Set<string>()

  const walk = (items: readonly MenuItem[], group: string, trail: readonly string[]): void => {
    for (const item of items) {
      if (item.separator) continue
      if (item.items) {
        walk(item.items, group, item.label ? [...trail, item.label] : trail)
        continue
      }
      // No `run` means the host never wired it; it is inert in the menu too.
      if (!item.run || !item.label) continue
      // A name can appear in two menus (Find and replace is under Edit and
      // Tools). One command is enough, and the first wins.
      if (seen.has(item.name)) continue
      seen.add(item.name)
      const run = item.run
      commands.push({
        name: item.name,
        label: item.label,
        group,
        ...(item.icon ? { icon: item.icon } : {}),
        ...(item.shortcut ? { shortcut: item.shortcut } : {}),
        ...(trail.length > 0 ? { keywords: trail } : {}),
        ...(item.isEnabled ? { isEnabled: item.isEnabled } : {}),
        run: (editor) => run(editor),
      })
    }
  }

  for (const menu of menus) walk(menu.items, menu.label, [])
  return commands
}
