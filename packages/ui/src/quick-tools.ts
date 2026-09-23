import type { Editor, EditorSnapshot } from '@trevixal/core'
import { rankItems } from './command-palette'
import { bindListNavigation, createDropdown } from './dropdown'
import { type IconName, createIcon } from './icons'
import type { Menu, MenuItem } from './menubar'
import type { ToolbarItem } from './toolbar'

/**
 * The three conveniences a toolbar grows once it is big enough to get lost
 * in: a quick-insert menu, a "recently used" tray, and favourites the user
 * pins. All three work off one usage log, kept outside the document and
 * persisted by the host.
 */

export interface ToolUsage {
  /** Toolbar item names, most recently used first. */
  readonly recent: readonly string[]
  /** Pinned item names, in the order the user pinned them. */
  readonly favorites: readonly string[]
}

export const EMPTY_USAGE: ToolUsage = { recent: [], favorites: [] }

export interface ToolUsageTrackerOptions {
  readonly usage?: ToolUsage
  /** How many recent entries to keep (default 8). */
  readonly limit?: number
  readonly onChange?: (usage: ToolUsage) => void
}

export interface ToolUsageTracker {
  readonly usage: ToolUsage
  /** Record a use of an item, moving it to the front of the recents. */
  record(name: string): void
  toggleFavorite(name: string): void
  isFavorite(name: string): boolean
  clearRecent(): void
  subscribe(listener: (usage: ToolUsage) => void): () => void
}

/**
 * A usage record read back from storage is whatever was there: an older
 * shape, a truncated write, or something else's key. Anything that is not a
 * list of names is dropped rather than allowed to throw on the first click.
 */
function sanitizeUsage(usage: ToolUsage | undefined): ToolUsage {
  const names = (value: unknown): readonly string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
  return { recent: names(usage?.recent), favorites: names(usage?.favorites) }
}

/** Track which tools get used, so the bar can offer them back. */
export function createToolUsageTracker(options: ToolUsageTrackerOptions = {}): ToolUsageTracker {
  const limit = options.limit ?? 8
  let usage: ToolUsage = sanitizeUsage(options.usage)
  const listeners = new Set<(usage: ToolUsage) => void>()

  const emit = (): void => {
    options.onChange?.(usage)
    for (const listener of listeners) listener(usage)
  }

  return {
    get usage() {
      return usage
    },
    record(name) {
      const recent = [name, ...usage.recent.filter((entry) => entry !== name)].slice(0, limit)
      usage = { ...usage, recent }
      emit()
    },
    toggleFavorite(name) {
      const favorites = usage.favorites.includes(name)
        ? usage.favorites.filter((entry) => entry !== name)
        : [...usage.favorites, name]
      usage = { ...usage, favorites }
      emit()
    },
    isFavorite: (name) => usage.favorites.includes(name),
    clearRecent() {
      usage = { ...usage, recent: [] }
      emit()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** One entry of the quick-insert menu. */
export interface QuickInsertItem {
  readonly name: string
  readonly label: string
  readonly icon?: IconName
  readonly group?: string
  readonly description?: string
  readonly run: (editor: Editor) => void
  /** False where the entry cannot apply, which leaves it out of the list. */
  readonly isEnabled?: (snapshot: EditorSnapshot) => boolean
}

export interface QuickInsertOptions {
  /**
   * The entries on offer. Pass a function to have them collected each time
   * the list opens, as {@link quickInsertItemsFromMenus} over menus built
   * after the toolbar is.
   */
  readonly items: readonly QuickInsertItem[] | (() => readonly QuickInsertItem[])
  readonly label?: string
  readonly placeholder?: string
  /** Called after an item runs, so a usage tracker can record it. */
  readonly onRun?: (item: QuickInsertItem) => void
}

/**
 * A single toolbar button opening a searchable list of everything insertable,
 * the "+" every modern editor has. It is a toolbar control, so it lives in
 * a group and travels with it when the bar is rearranged.
 *
 * Keyboard first: the search box takes focus as it opens, Enter inserts the
 * best match, and the arrow keys walk the list.
 */
export function createQuickInsertControl(
  editor: Editor,
  document: Document,
  options: QuickInsertOptions,
): { element: HTMLElement; refresh(): void; destroy(): void } {
  let search: HTMLInputElement | null = null
  let list: HTMLElement | null = null
  /** What the list shows, best match first: Enter in the search box takes the top one. */
  let shown: readonly QuickInsertItem[] = []
  let releaseNavigation: (() => void) | null = null

  const choose = (item: QuickInsertItem): void => {
    dropdown.close()
    item.run(editor)
    options.onRun?.(item)
    editor.view?.focus()
  }

  const render = (query: string): void => {
    if (!list) return
    list.replaceChildren()
    const every = typeof options.items === 'function' ? options.items() : options.items
    const snapshot = editor.getSnapshot()
    const usable = every.filter((item) => item.isEnabled?.(snapshot) ?? true)
    shown = rankItems(usable, query, (item) => [
      item.label,
      item.group ?? '',
      item.description ?? '',
    ])
    if (shown.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'trevixal-quickinsert__empty'
      empty.textContent = 'Nothing matches'
      list.appendChild(empty)
      return
    }
    // Headings group the list while browsing. A search ranks it, best match
    // first, and headings over a ranked list would repeat as it interleaves.
    const browsing = query.trim().length === 0
    let group: string | null = null
    for (const item of shown) {
      if (browsing && item.group && item.group !== group) {
        group = item.group
        const heading = document.createElement('div')
        heading.className = 'trevixal-quickinsert__heading'
        heading.textContent = group
        list.appendChild(heading)
      }
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'trevixal-quickinsert__item'
      button.dataset.trevixalItem = item.name
      const icon = item.icon ? createIcon(document, item.icon) : null
      if (icon) button.appendChild(icon)
      const label = document.createElement('span')
      label.className = 'trevixal-quickinsert__label'
      label.textContent = item.label
      button.appendChild(label)
      if (item.description) {
        const description = document.createElement('span')
        description.className = 'trevixal-quickinsert__description'
        description.textContent = item.description
        button.appendChild(description)
      }
      button.addEventListener('mousedown', (event) => event.preventDefault())
      button.addEventListener('click', () => choose(item))
      list.appendChild(button)
    }
  }

  const dropdown = createDropdown({
    document,
    className: 'trevixal-quickinsert',
    render: (panel) => {
      panel.setAttribute('role', 'menu')
      panel.setAttribute('aria-label', options.label ?? 'Quick insert')
      const input = document.createElement('input')
      input.type = 'search'
      input.className = 'trevixal-quickinsert__search'
      input.placeholder = options.placeholder ?? 'Search…'
      input.setAttribute('aria-label', 'Search things to insert')
      input.addEventListener('input', () => render(input.value))
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          const best = shown[0]
          if (best) choose(best)
        } else if (event.key === 'ArrowDown') {
          event.preventDefault()
          list?.querySelector<HTMLElement>('button')?.focus()
        }
      })
      const items = document.createElement('div')
      items.className = 'trevixal-quickinsert__list'
      releaseNavigation = bindListNavigation(items)
      panel.append(input, items)
      search = input
      list = items
      // Nothing is listed until the first open: a function of menus can be
      // asked for them only once they exist.
    },
    onOpen: () => {
      if (search) {
        search.value = ''
        render('')
        // The panel is only now visible, so focusing has to wait a tick.
        setTimeout(() => search?.focus(), 0)
      }
    },
  })
  dropdown.trigger.setAttribute('aria-label', options.label ?? 'Quick insert')
  dropdown.trigger.title = options.label ?? 'Quick insert'
  const glyph = createIcon(document, 'quickInsert')
  if (glyph) dropdown.trigger.appendChild(glyph)
  else dropdown.trigger.textContent = '+'

  return {
    element: dropdown.element,
    refresh() {
      if (search && dropdown.isOpen) render(search.value)
    },
    destroy: () => {
      releaseNavigation?.()
      dropdown.destroy()
    },
  }
}

/**
 * Quick-insert entries from wired menus: every entry they offer, with a
 * submenu's entries named after it ("Callout: Info"), since the list shows
 * side by side what the menu nested. Entries with no `run` were never wired
 * by the host and are left out, as the palette leaves them out.
 */
export function quickInsertItemsFromMenus(menus: readonly Menu[]): QuickInsertItem[] {
  const items: QuickInsertItem[] = []
  const seen = new Set<string>()
  const walk = (entries: readonly MenuItem[], parent: string | null): void => {
    for (const entry of entries) {
      if (entry.separator) continue
      if (entry.items) {
        walk(entry.items, entry.label)
        continue
      }
      const run = entry.run
      if (!run || !entry.label || seen.has(entry.name)) continue
      seen.add(entry.name)
      items.push({
        name: entry.name,
        label: parent ? `${parent}: ${entry.label}` : entry.label,
        ...(entry.icon ? { icon: entry.icon } : {}),
        ...(entry.isEnabled ? { isEnabled: entry.isEnabled } : {}),
        run: (target) => run(target),
      })
    }
  }
  for (const menu of menus) walk(menu.items, null)
  return items
}

export interface RecentToolsOptions {
  readonly tracker: ToolUsageTracker
  /** Every item the tray can offer, keyed by toolbar item name. */
  readonly items: ReadonlyMap<string, ToolbarItem>
  readonly label?: string
  /** How many recents to show (default 6). */
  readonly limit?: number
}

/**
 * A tray of the tools this user actually reaches for: their pinned
 * favourites first, then what they used last. Right-clicking a button pins
 * or unpins it, which is how every dock people already know behaves, and
 * Shift+F10 or the menu key does the same from the keyboard.
 *
 * Its buttons carry `data-trevixal-recent`, not the bar's `data-trevixal-item`,
 * so looking a tool up by name still finds the real button.
 */
export function createRecentToolsControl(
  editor: Editor,
  document: Document,
  options: RecentToolsOptions,
): { element: HTMLElement; refresh(): void; destroy(): void } {
  const root = document.createElement('div')
  root.className = 'trevixal-recenttools'
  root.setAttribute('role', 'group')
  root.setAttribute('aria-label', options.label ?? 'Favourite and recent tools')
  const limit = options.limit ?? 6
  let buttons: { item: ToolbarItem; element: HTMLButtonElement }[] = []

  /** Show each tool's state the way the bar shows it: pressed, or unavailable. */
  const paint = (): void => {
    const snapshot = editor.getSnapshot()
    for (const { item, element } of buttons) {
      if (item.isActive) element.setAttribute('aria-pressed', String(item.isActive(snapshot)))
      element.disabled = item.isEnabled ? !item.isEnabled(snapshot) : false
    }
  }

  const build = (): void => {
    const usage = options.tracker.usage
    const names = [
      ...usage.favorites,
      ...usage.recent.filter((name) => !usage.favorites.includes(name)),
    ].slice(0, limit)
    root.replaceChildren()
    buttons = []
    for (const name of names) {
      const item = options.items.get(name)
      if (!item) continue
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'trevixal-toolbar__button trevixal-recenttools__button'
      button.dataset.trevixalRecent = name
      const pinned = options.tracker.isFavorite(name)
      if (pinned) button.dataset.trevixalFavorite = 'true'
      const icon = item.icon ? createIcon(document, item.icon) : null
      if (icon) button.appendChild(icon)
      else button.textContent = item.label
      const label = item.ariaLabel ?? item.label
      button.setAttribute('aria-label', label)
      button.title = pinned
        ? `${label} (pinned: right-click or Shift+F10 to unpin)`
        : `${label} (right-click or Shift+F10 to pin)`
      button.tabIndex = -1
      button.addEventListener('mousedown', (event) => event.preventDefault())
      button.addEventListener('click', (event) => item.run(editor, event))
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault()
        options.tracker.toggleFavorite(name)
      })
      root.appendChild(button)
      buttons.push({ item, element: button })
    }
    root.hidden = buttons.length === 0
    paint()
  }

  build()
  const unsubscribe = options.tracker.subscribe(build)
  return {
    element: root,
    refresh: paint,
    destroy() {
      unsubscribe()
      root.remove()
    },
  }
}

export interface CustomizeToolbarOptions {
  readonly document: Document
  /** Every group, in their default order. */
  readonly groups: readonly { readonly name: string; readonly label: string }[]
  /** Names currently shown, in order. */
  readonly visible: readonly string[]
  readonly onApply: (visible: readonly string[]) => void
}

/**
 * "Customize toolbar…": a checklist of groups with up and down buttons, so a
 * user can hide the ones they never touch and put the rest in their own
 * order. The same thing dragging the grips does, from the keyboard.
 */
export function openCustomizeToolbarDialog(options: CustomizeToolbarOptions): Promise<void> {
  const { document } = options
  // Where focus was, to hand it back when the dialog closes.
  const previouslyFocused = document.activeElement as HTMLElement | null
  const overlay = document.createElement('div')
  overlay.className = 'trevixal-dialog-overlay'
  const dialog = document.createElement('div')
  dialog.className = 'trevixal-dialog trevixal-dialog--customize'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', 'Customize toolbar')

  const heading = document.createElement('h2')
  heading.className = 'trevixal-dialog__title'
  heading.textContent = 'Customize toolbar'
  const body = document.createElement('p')
  body.className = 'trevixal-dialog__body'
  body.textContent = 'Choose which groups appear, and the order they appear in.'
  const list = document.createElement('ul')
  list.className = 'trevixal-customize__list'

  // Listed groups first in their current order, then the hidden ones.
  let order: string[] = [
    ...options.visible.filter((name) => options.groups.some((group) => group.name === name)),
    ...options.groups.map((group) => group.name).filter((name) => !options.visible.includes(name)),
  ]
  const shown = new Set(options.visible)

  /**
   * Rebuild the list. A move rebuilds it under the button just pressed, so
   * `moved` names the group and direction to give focus back to: the same
   * arrow, or the other one once the group reaches an end.
   */
  const render = (moved?: { readonly name: string; readonly up: boolean }): void => {
    list.replaceChildren()
    order.forEach((name, index) => {
      const group = options.groups.find((entry) => entry.name === name)
      if (!group) return
      const item = document.createElement('li')
      item.className = 'trevixal-customize__item'
      item.dataset.trevixalGroup = name
      const label = document.createElement('label')
      label.className = 'trevixal-customize__label'
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.checked = shown.has(name)
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) shown.add(name)
        else shown.delete(name)
      })
      const text = document.createElement('span')
      text.textContent = group.label
      label.append(checkbox, text)
      const up = document.createElement('button')
      up.type = 'button'
      up.className = 'trevixal-customize__move'
      up.textContent = '↑'
      up.setAttribute('aria-label', `Move ${group.label} up`)
      up.disabled = index === 0
      up.addEventListener('click', () => {
        const previous = order[index - 1] as string
        order[index - 1] = name
        order[index] = previous
        render({ name, up: true })
      })
      const down = document.createElement('button')
      down.type = 'button'
      down.className = 'trevixal-customize__move'
      down.textContent = '↓'
      down.setAttribute('aria-label', `Move ${group.label} down`)
      down.disabled = index === order.length - 1
      down.addEventListener('click', () => {
        const next = order[index + 1] as string
        order[index + 1] = name
        order[index] = next
        render({ name, up: false })
      })
      item.append(label, up, down)
      list.appendChild(item)
      if (moved?.name === name) {
        const pressed = moved.up ? up : down
        const other = moved.up ? down : up
        const target = pressed.disabled ? other : pressed
        target.focus()
      }
    })
  }
  render()

  const actions = document.createElement('div')
  actions.className = 'trevixal-dialog__actions'
  const reset = document.createElement('button')
  reset.type = 'button'
  reset.className = 'trevixal-dialog__button'
  reset.textContent = 'Reset'
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.className = 'trevixal-dialog__button'
  cancel.textContent = 'Cancel'
  const apply = document.createElement('button')
  apply.type = 'button'
  apply.className = 'trevixal-dialog__button trevixal-dialog__button--primary'
  apply.textContent = 'Apply'
  actions.append(reset, cancel, apply)
  dialog.append(heading, body, list, actions)
  overlay.appendChild(dialog)
  document.body.appendChild(overlay)

  return new Promise<void>((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      document.removeEventListener('keydown', onKeyDown, true)
      overlay.remove()
      if (previouslyFocused?.isConnected) previouslyFocused.focus?.({ preventScroll: true })
      resolve()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        finish()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    reset.addEventListener('click', () => {
      order = options.groups.map((group) => group.name)
      shown.clear()
      for (const name of order) shown.add(name)
      render()
    })
    cancel.addEventListener('click', finish)
    apply.addEventListener('click', () => {
      options.onApply(order.filter((name) => shown.has(name)))
      finish()
    })
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) finish()
    })
    apply.focus()
  })
}
