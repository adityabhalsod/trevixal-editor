import type { Editor } from '@trevixal/core'
import { createDropdown } from './dropdown'
import { type IconName, createIcon } from './icons'
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
}

export interface QuickInsertOptions {
  readonly items: readonly QuickInsertItem[]
  readonly label?: string
  readonly placeholder?: string
  /** Called after an item runs, so a usage tracker can record it. */
  readonly onRun?: (item: QuickInsertItem) => void
}

/**
 * A single toolbar button opening a searchable list of everything insertable,
 * the "+" every modern editor has. It is a toolbar control, so it lives in
 * a group and travels with it when the bar is rearranged.
 */
export function createQuickInsertControl(
  editor: Editor,
  document: Document,
  options: QuickInsertOptions,
): { element: HTMLElement; refresh(): void; destroy(): void } {
  let search: HTMLInputElement | null = null
  let list: HTMLElement | null = null

  const render = (query: string): void => {
    if (!list) return
    list.replaceChildren()
    const needle = query.trim().toLowerCase()
    const matches = options.items.filter(
      (item) =>
        needle.length === 0 ||
        item.label.toLowerCase().includes(needle) ||
        (item.group ?? '').toLowerCase().includes(needle) ||
        (item.description ?? '').toLowerCase().includes(needle),
    )
    if (matches.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'trevixal-quickinsert__empty'
      empty.textContent = 'Nothing matches'
      list.appendChild(empty)
      return
    }
    let group: string | null = null
    for (const item of matches) {
      if (item.group && item.group !== group) {
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
      button.addEventListener('click', () => {
        dropdown.close()
        item.run(editor)
        options.onRun?.(item)
        editor.view?.focus()
      })
      list.appendChild(button)
    }
  }

  const dropdown = createDropdown({
    document,
    className: 'trevixal-quickinsert',
    render: (panel) => {
      panel.setAttribute('role', 'menu')
      panel.setAttribute('aria-label', options.label ?? 'Quick insert')
      search = document.createElement('input')
      search.type = 'search'
      search.className = 'trevixal-quickinsert__search'
      search.placeholder = options.placeholder ?? 'Search…'
      search.setAttribute('aria-label', 'Search things to insert')
      search.addEventListener('input', () => render(search?.value ?? ''))
      list = document.createElement('div')
      list.className = 'trevixal-quickinsert__list'
      panel.append(search, list)
      render('')
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
  const glyph = createIcon(document, 'specialChar')
  if (glyph) dropdown.trigger.appendChild(glyph)
  else dropdown.trigger.textContent = '+'

  return {
    element: dropdown.element,
    refresh() {
      if (search) render(search.value)
    },
    destroy: () => dropdown.destroy(),
  }
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
 * or unpins it, which is how every dock people already know behaves.
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

  const build = (): void => {
    const usage = options.tracker.usage
    const names = [
      ...usage.favorites,
      ...usage.recent.filter((name) => !usage.favorites.includes(name)),
    ].slice(0, limit)
    root.replaceChildren()
    root.hidden = names.length === 0
    for (const name of names) {
      const item = options.items.get(name)
      if (!item) continue
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'trevixal-toolbar__button trevixal-recenttools__button'
      button.dataset.trevixalItem = name
      if (options.tracker.isFavorite(name)) button.dataset.trevixalFavorite = 'true'
      const icon = item.icon ? createIcon(document, item.icon) : null
      if (icon) button.appendChild(icon)
      else button.textContent = item.label
      const label = item.ariaLabel ?? item.label
      button.setAttribute('aria-label', label)
      button.title = options.tracker.isFavorite(name)
        ? `${label} (pinned, right-click to unpin)`
        : `${label} (right-click to pin)`
      button.tabIndex = -1
      button.addEventListener('mousedown', (event) => event.preventDefault())
      button.addEventListener('click', (event) => item.run(editor, event))
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault()
        options.tracker.toggleFavorite(name)
      })
      root.appendChild(button)
    }
  }

  build()
  const unsubscribe = options.tracker.subscribe(build)
  return {
    element: root,
    refresh: build,
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

  const render = (): void => {
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
        render()
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
        render()
      })
      item.append(label, up, down)
      list.appendChild(item)
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
