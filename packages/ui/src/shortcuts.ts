import { type Editor, normalizeKeyName } from '@trevixal/core'

/**
 * A shortcut manager: one place that owns every keyboard binding the chrome
 * advertises, so a shortcut printed beside a menu entry is guaranteed to work,
 * and the user can rebind any of them.
 *
 * Bindings use the core keymap grammar (`"Mod-Shift-l"`; `Mod` is ⌘ on Apple
 * platforms and Ctrl elsewhere). Actions the browser or the editing surface
 * already handle (cut, copy, paste, Shift+Enter) are `native`: they are listed
 * and displayed, but only intercepted once the user has rebound them.
 */
export interface ShortcutAction {
  readonly name: string
  readonly label: string
  /** Heading the shortcuts dialog groups the action under. */
  readonly group?: string
  /** Default binding, or null for an action that ships unbound. */
  readonly keys: string | null
  /**
   * A second default binding that fires the same action (`Mod-Shift-p` beside
   * `Mod-k` for a command palette). It is printed alongside `keys`, and it
   * stays live until the action is unbound; rebinding replaces `keys` only.
   */
  readonly alternateKeys?: string | null
  readonly run: (editor: Editor) => void
  /** Handled natively (browser clipboard, the view's own input pipeline). */
  readonly native?: boolean
}

/** An action with its effective binding, as the dialog lists it. */
export interface ResolvedShortcut {
  readonly name: string
  readonly label: string
  readonly group: string
  readonly keys: string | null
  /** The action's second binding, when it has one and is still bound. */
  readonly alternateKeys: string | null
  readonly defaultKeys: string | null
  readonly customized: boolean
  readonly native: boolean
  /** Human-readable keys, e.g. `Ctrl+Shift+L` or `⌘⇧L`; both bindings when there are two. */
  readonly display: string
}

/**
 * Printed labels keyed by action name. The shape menus consume, so a host
 * can hand `manager.labels()` straight to `createEditorUI({ shortcutLabels })`
 * and whatever the menus print is what actually fires. Null marks an action
 * that exists but is unbound, so a menu prints nothing beside it.
 */
export type ShortcutLabels = Readonly<Record<string, string | null>>

/** Per-action overrides: a new binding, or null to unbind. */
export type ShortcutOverrides = Readonly<Record<string, string | null>>

export interface ShortcutManagerOptions {
  readonly actions: readonly ShortcutAction[]
  /** Saved overrides to start from: what `onChange` last reported. */
  readonly overrides?: ShortcutOverrides
  /** Called with the full override map whenever a binding changes. */
  readonly onChange?: (overrides: ShortcutOverrides) => void
  /**
   * Elements whose key events the manager handles; defaults to the editing
   * surface. Pass the chrome root too so shortcuts work from the toolbar.
   */
  readonly scopes?: readonly HTMLElement[]
  readonly isMac?: boolean
}

export interface ShortcutManager {
  readonly actions: readonly ResolvedShortcut[]
  /** The effective binding for an action. */
  keysFor(name: string): string | null
  /** Display text for an action's binding, e.g. beside a menu entry. */
  displayFor(name: string): string
  /** Every action's printed binding, keyed by name (see {@link ShortcutLabels}). */
  labels(): ShortcutLabels
  /** Rebind (or unbind with null). Another action holding the keys loses them. */
  rebind(name: string, keys: string | null): void
  reset(name: string): void
  resetAll(): void
  readonly overrides: ShortcutOverrides
  /** Handle a keydown from anywhere; returns true when an action ran. */
  handle(event: KeyboardEvent): boolean
  /** Translate a keydown into the binding grammar (`Mod-Shift-l`), or null for a bare modifier. */
  keysFromEvent(event: KeyboardEvent): string | null
  format(keys: string | null): string
  /** Show the shortcuts dialog: view, change and reset every binding. */
  openDialog(document?: Document): Promise<void>
  destroy(): void
}

function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent || '')
}

/** Canonical form of a keydown, matching core's `normalizeKeyName` output. */
function eventKeyName(event: KeyboardEvent, key = event.key): string {
  let mods = ''
  if (event.altKey) mods += 'a'
  if (event.ctrlKey) mods += 'c'
  if (event.metaKey) mods += 'm'
  if (event.shiftKey) mods += 's'
  const name = key.length === 1 ? key.toLowerCase() : key
  return `${[...mods].sort().join('')}-${name}`
}

/**
 * The key a chord names when a modifier changed the character it types:
 * Shift turns 7 into `&` (or `/`, on a German keyboard) and ⌥ on a Mac turns
 * S into `ß`, yet `Mod-Shift-7` and `Mod-Alt-s` name the key. Read off the
 * physical key, and only when the character is not a letter or digit already,
 * so a layout that puts its letters elsewhere keeps them. Never for Ctrl+Alt
 * off a Mac: that is AltGr, which types characters a shortcut must not eat.
 */
function physicalKey(event: KeyboardEvent, isMac: boolean): string | null {
  if (!(event.ctrlKey || event.altKey || event.metaKey)) return null
  if (/^[a-z0-9]$/i.test(event.key)) return null
  if (!isMac && event.ctrlKey && event.altKey) return null
  const match = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(event.code ?? '')
  const key = match?.[1] ?? match?.[2]
  return key ? key.toLowerCase() : null
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'OS', 'AltGraph'])

/** F1 to F24: the one kind of key that can be a shortcut on its own. */
const FUNCTION_KEY = /^F\d{1,2}$/

const KEY_SYMBOLS: Readonly<Record<string, string>> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: 'Enter',
  Escape: 'Esc',
  ' ': 'Space',
  Backspace: 'Backspace',
  Delete: 'Del',
}

/**
 * Turn a binding into the text a menu shows: `Ctrl+Shift+L`, or `⌘⇧L` on a
 * Mac. Modifier order follows platform convention.
 */
export function formatShortcut(keys: string | null, isMac = detectMac()): string {
  if (!keys) return ''
  const parts = keys.split('-')
  const key = parts.pop() ?? ''
  const mods = parts.map((part) => part.toLowerCase())
  // Platform convention: ⌃⌥⇧⌘ on Apple keyboards, Ctrl+Alt+Shift elsewhere.
  // `Mod` prints as ⌘ or Ctrl, so it sorts where its rendering belongs.
  const order = isMac
    ? ['ctrl', 'control', 'alt', 'shift', 'mod', 'meta', 'cmd']
    : ['mod', 'ctrl', 'control', 'meta', 'cmd', 'alt', 'shift']
  mods.sort((a, b) => order.indexOf(a) - order.indexOf(b))
  const label = (mod: string): string => {
    switch (mod) {
      case 'mod':
        return isMac ? '⌘' : 'Ctrl'
      case 'meta':
      case 'cmd':
        return isMac ? '⌘' : 'Meta'
      case 'ctrl':
      case 'control':
        return isMac ? '⌃' : 'Ctrl'
      case 'alt':
        return isMac ? '⌥' : 'Alt'
      case 'shift':
        return isMac ? '⇧' : 'Shift'
      default:
        return mod
    }
  }
  const keyLabel = KEY_SYMBOLS[key] ?? (key.length === 1 ? key.toUpperCase() : key)
  const pieces = [...mods.map(label), keyLabel]
  return isMac ? pieces.join('') : pieces.join('+')
}

/**
 * Read a shortcut the way menus have always written them (`Ctrl+Shift+Z`)
 * into the keymap grammar. `Ctrl` and `Cmd` both mean `Mod`, so one menu
 * definition serves every platform.
 */
export function parseShortcut(display: string): string | null {
  const parts = display
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return null
  const key = parts.pop() as string
  const mods = parts.map((part) => {
    const lower = part.toLowerCase()
    if (lower === 'ctrl' || lower === 'control' || lower === 'cmd' || lower === '⌘') return 'Mod'
    if (lower === 'shift' || lower === '⇧') return 'Shift'
    if (lower === 'alt' || lower === 'option' || lower === '⌥') return 'Alt'
    if (lower === 'meta') return 'Meta'
    return part
  })
  const keyName =
    key.toLowerCase() === 'esc' ? 'Escape' : key.length === 1 ? key.toLowerCase() : key
  return [...mods, keyName].join('-')
}

export function createShortcutManager(
  editor: Editor,
  options: ShortcutManagerOptions,
): ShortcutManager {
  const isMac = options.isMac ?? detectMac()
  const actions = options.actions
  let overrides: Record<string, string | null> = { ...(options.overrides ?? {}) }
  // canonical keys → action, and the canonical defaults of rebound actions,
  // which are swallowed so the view's own keymap does not fire the old key.
  let bindings = new Map<string, ShortcutAction>()
  let retired = new Set<string>()

  const effective = (action: ShortcutAction): string | null =>
    action.name in overrides ? (overrides[action.name] ?? null) : action.keys

  // The alternate binding follows the primary: unbinding an action (a null
  // override) silences both, while a rebind leaves the alternate in place.
  const effectiveAlternate = (action: ShortcutAction): string | null => {
    if (!action.alternateKeys) return null
    if (action.name in overrides && overrides[action.name] === null) return null
    return action.alternateKeys
  }

  const canonical = (keys: string): string | null => {
    try {
      return normalizeKeyName(keys, isMac)
    } catch {
      return null
    }
  }

  const rebuild = (): void => {
    bindings = new Map()
    retired = new Set()
    for (const action of actions) {
      const keys = effective(action)
      if (keys) {
        const name = canonical(keys)
        if (name) bindings.set(name, action)
      }
      const alternate = effectiveAlternate(action)
      if (alternate) {
        const name = canonical(alternate)
        if (name && !bindings.has(name)) bindings.set(name, action)
      }
      if (action.name in overrides && action.keys && !action.native) {
        const name = canonical(action.keys)
        if (name) retired.add(name)
      }
    }
    // A default that another action now owns is not retired.
    for (const name of bindings.keys()) retired.delete(name)
  }
  rebuild()

  const display = (keys: string | null, alternate: string | null): string =>
    [keys, alternate]
      .filter((entry): entry is string => Boolean(entry))
      .map((entry) => formatShortcut(entry, isMac))
      .join(', ')

  const resolve = (action: ShortcutAction): ResolvedShortcut => {
    const keys = effective(action)
    const alternateKeys = effectiveAlternate(action)
    return {
      name: action.name,
      label: action.label,
      group: action.group ?? 'General',
      keys,
      alternateKeys,
      defaultKeys: action.keys,
      customized: action.name in overrides,
      native: action.native === true,
      display: display(keys, alternateKeys),
    }
  }

  const changed = (): void => {
    rebuild()
    options.onChange?.({ ...overrides })
  }

  const handle = (event: KeyboardEvent): boolean => {
    if (event.defaultPrevented) return false
    const physical = physicalKey(event, isMac)
    const names = [eventKeyName(event), ...(physical ? [eventKeyName(event, physical)] : [])]
    for (const name of names) {
      const action = bindings.get(name)
      if (!action) continue
      // A native action keeps its browser behaviour until the user rebinds it.
      if (action.native && !(action.name in overrides)) return false
      action.run(editor)
      return true
    }
    return names.some((name) => retired.has(name))
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as globalThis.Node | null
    if (!target || !scopes.some((scope) => scope.contains(target))) return
    if (handle(event)) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  const scopes: HTMLElement[] = [...(options.scopes ?? [])]
  if (scopes.length === 0 && editor.view) scopes.push(editor.view.dom)
  const doc = scopes[0]?.ownerDocument ?? editor.view?.dom.ownerDocument
  doc?.addEventListener('keydown', onKeyDown, true)

  const manager: ShortcutManager = {
    get actions() {
      return actions.map(resolve)
    },
    keysFor: (name) => {
      const action = actions.find((entry) => entry.name === name)
      return action ? effective(action) : null
    },
    displayFor: (name) => {
      const action = actions.find((entry) => entry.name === name)
      return action ? display(effective(action), effectiveAlternate(action)) : ''
    },
    labels: () => {
      const labels: Record<string, string | null> = {}
      for (const action of actions) {
        const text = display(effective(action), effectiveAlternate(action))
        labels[action.name] = text || null
      }
      return labels
    },
    rebind(name, keys) {
      const action = actions.find((entry) => entry.name === name)
      if (!action) return
      if (keys) {
        const wanted = canonical(keys)
        if (!wanted) return
        // Take the keys away from whoever holds them.
        for (const other of actions) {
          if (other.name === name) continue
          const held = effective(other)
          const alternate = effectiveAlternate(other)
          if (
            (held && canonical(held) === wanted) ||
            (alternate && canonical(alternate) === wanted)
          ) {
            overrides[other.name] = null
          }
        }
      }
      if (keys === action.keys) delete overrides[name]
      else overrides[name] = keys
      changed()
    },
    reset(name) {
      if (!(name in overrides)) return
      delete overrides[name]
      changed()
    },
    resetAll() {
      overrides = {}
      changed()
    },
    get overrides() {
      return { ...overrides }
    },
    handle,
    keysFromEvent(event) {
      if (MODIFIER_KEYS.has(event.key)) return null
      const mods: string[] = []
      if (isMac ? event.metaKey : event.ctrlKey) mods.push('Mod')
      if (isMac ? event.ctrlKey : event.metaKey) mods.push(isMac ? 'Ctrl' : 'Meta')
      if (event.altKey) mods.push('Alt')
      if (event.shiftKey) mods.push('Shift')
      const key =
        physicalKey(event, isMac) ?? (event.key.length === 1 ? event.key.toLowerCase() : event.key)
      return [...mods, key].join('-')
    },
    format: (keys) => formatShortcut(keys, isMac),
    openDialog: (document) => openShortcutsDialog(manager, document ?? doc ?? globalThis.document),
    destroy() {
      doc?.removeEventListener('keydown', onKeyDown, true)
    },
  }
  return manager
}

/**
 * The keyboard shortcuts dialog: every action grouped by menu, its current
 * keys, a Change button that records the next chord, and Reset per row and
 * for the lot. A search box narrows the list by name or by keys. Escape
 * cancels a recording before it closes the dialog.
 */
export function openShortcutsDialog(manager: ShortcutManager, document: Document): Promise<void> {
  // Where focus was, to hand it back when the dialog closes.
  const previouslyFocused = document.activeElement as HTMLElement | null
  const overlay = document.createElement('div')
  overlay.className = 'trevixal-dialog-overlay'
  const dialog = document.createElement('div')
  dialog.className = 'trevixal-dialog trevixal-dialog--shortcuts trevixal-shortcuts'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', 'Keyboard shortcuts')

  const heading = document.createElement('h2')
  heading.className = 'trevixal-dialog__title'
  heading.textContent = 'Keyboard shortcuts'
  const body = document.createElement('p')
  body.className = 'trevixal-dialog__body'
  body.textContent =
    'Click Change, then press the new keys. Backspace clears a shortcut; Escape cancels.'
  const search = document.createElement('input')
  search.type = 'search'
  search.className = 'trevixal-shortcuts__search'
  search.placeholder = 'Search shortcuts'
  search.setAttribute('aria-label', 'Search shortcuts')
  const list = document.createElement('div')
  list.className = 'trevixal-shortcuts__list'
  const status = document.createElement('p')
  status.className = 'trevixal-shortcuts__status'
  status.setAttribute('role', 'status')

  let recording: string | null = null

  /**
   * Rebuild the rows. Rebuilding drops the button that had focus, so a row
   * named by `focusName` gets it back on its Change button; otherwise a
   * keyboard user is thrown back to the top of the page after every change.
   */
  const render = (focusName?: string): void => {
    list.replaceChildren()
    const query = search.value.trim().toLowerCase()
    const groups = new Map<string, ResolvedShortcut[]>()
    for (const action of manager.actions) {
      const text = `${action.label} ${action.group} ${action.display}`.toLowerCase()
      if (query && !text.includes(query)) continue
      const entries = groups.get(action.group) ?? []
      entries.push(action)
      groups.set(action.group, entries)
    }
    for (const [group, entries] of groups) {
      const section = document.createElement('section')
      section.className = 'trevixal-shortcuts__group'
      const title = document.createElement('h3')
      title.className = 'trevixal-shortcuts__heading'
      title.textContent = group
      section.appendChild(title)
      for (const entry of entries) {
        const row = document.createElement('div')
        row.className = 'trevixal-shortcuts__row'
        row.dataset.trevixalShortcut = entry.name
        if (recording === entry.name) row.classList.add('trevixal-shortcuts__row--recording')
        const label = document.createElement('span')
        label.className = 'trevixal-shortcuts__label'
        label.textContent = entry.label
        const keys = document.createElement('kbd')
        keys.className = 'trevixal-shortcuts__keys'
        keys.textContent =
          recording === entry.name ? 'Press keys…' : entry.display || (entry.keys ? '' : 'None')
        if (entry.customized) keys.classList.add('trevixal-shortcuts__keys--custom')
        if (entry.native && !entry.customized) keys.title = 'Handled by the browser'
        const change = document.createElement('button')
        change.type = 'button'
        change.className = 'trevixal-dialog__button trevixal-shortcuts__change'
        change.textContent = recording === entry.name ? 'Cancel' : 'Change'
        change.addEventListener('click', () => {
          recording = recording === entry.name ? null : entry.name
          render(entry.name)
        })
        row.append(label, keys, change)
        if (entry.customized) {
          const reset = document.createElement('button')
          reset.type = 'button'
          reset.className = 'trevixal-dialog__button trevixal-shortcuts__reset'
          reset.textContent = 'Reset'
          reset.addEventListener('click', () => {
            manager.reset(entry.name)
            render(entry.name)
          })
          row.appendChild(reset)
        }
        section.appendChild(row)
      }
      list.appendChild(section)
    }
    if (groups.size === 0) {
      const empty = document.createElement('p')
      empty.className = 'trevixal-dialog__hint'
      empty.textContent = 'No shortcuts match.'
      list.appendChild(empty)
    }
    const row = [...list.querySelectorAll<HTMLElement>('[data-trevixal-shortcut]')].find(
      (candidate) => candidate.dataset.trevixalShortcut === focusName,
    )
    row?.querySelector<HTMLElement>('.trevixal-shortcuts__change')?.focus()
  }
  render()
  search.addEventListener('input', () => render())

  const actions = document.createElement('div')
  actions.className = 'trevixal-dialog__actions'
  const resetAll = document.createElement('button')
  resetAll.type = 'button'
  resetAll.className = 'trevixal-dialog__button'
  resetAll.textContent = 'Reset all'
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'trevixal-dialog__button trevixal-dialog__button--primary'
  close.textContent = 'Close'
  actions.append(resetAll, close)

  dialog.append(heading, body, search, list, status, actions)
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
      if (recording) {
        event.preventDefault()
        event.stopPropagation()
        const name = recording
        if (event.key === 'Escape') {
          recording = null
          render(name)
          return
        }
        if (event.key === 'Backspace' || event.key === 'Delete') {
          manager.rebind(name, null)
          status.textContent = 'Shortcut removed.'
          recording = null
          render(name)
          return
        }
        const keys = manager.keysFromEvent(event)
        if (!keys) return
        // A plain letter bound to an action would fire instead of typing, the
        // one mistake the dialog must not let a single keystroke make.
        if (!(event.ctrlKey || event.altKey || event.metaKey || FUNCTION_KEY.test(event.key))) {
          status.textContent = 'Add Ctrl, Alt or ⌘: that key on its own is needed for typing.'
          return
        }
        const wanted = manager.format(keys)
        const taken = manager.actions.find(
          (entry) =>
            entry.name !== name &&
            ((entry.keys && manager.format(entry.keys) === wanted) ||
              (entry.alternateKeys && manager.format(entry.alternateKeys) === wanted)),
        )
        manager.rebind(name, keys)
        status.textContent = taken
          ? `${manager.format(keys)} assigned; it was taken from “${taken.label}”.`
          : `${manager.format(keys)} assigned.`
        recording = null
        render(name)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        finish()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    resetAll.addEventListener('click', () => {
      manager.resetAll()
      status.textContent = 'All shortcuts reset to their defaults.'
      render()
    })
    close.addEventListener('click', finish)
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) finish()
    })
    search.focus()
  })
}
