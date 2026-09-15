import type { DocJSON, Editor } from '@trevixal/core'
import { documentTitle } from './documents'

/**
 * Saving without a server: autosave to a key/value store, a draft the page
 * can offer to restore after a reload or a crash, and rolling backups the
 * user can go back to. The store is an interface, so localStorage, IndexedDB,
 * an encrypted wrapper or a remote API all plug in the same way.
 */

/** A tiny async key/value store. */
export interface KeyValueStorage {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
  /** Every key currently stored, optionally only those with a prefix. */
  keys(prefix?: string): Promise<readonly string[]>
}

/** An in-memory store, for tests and for pages that should forget on reload. */
export function createMemoryStorage(): KeyValueStorage {
  const map = new Map<string, string>()
  return {
    async get(key) {
      return map.get(key) ?? null
    },
    async set(key, value) {
      map.set(key, value)
    },
    async remove(key) {
      map.delete(key)
    },
    async keys(prefix = '') {
      return [...map.keys()].filter((key) => key.startsWith(prefix))
    },
  }
}

/**
 * `localStorage` / `sessionStorage` behind the async interface. Writes are
 * synchronous underneath, which is what lets a page flush on `pagehide`.
 * Quota errors surface as rejected promises rather than thrown exceptions.
 */
export function createWebStorage(storage: Storage, prefix = 'trevixal:'): KeyValueStorage {
  return {
    async get(key) {
      return storage.getItem(prefix + key)
    },
    async set(key, value) {
      storage.setItem(prefix + key, value)
    },
    async remove(key) {
      storage.removeItem(prefix + key)
    },
    async keys(sub = '') {
      const found: string[] = []
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (key?.startsWith(prefix + sub)) found.push(key.slice(prefix.length))
      }
      return found
    },
  }
}

export interface SavedDocument {
  readonly doc: DocJSON
  readonly savedAt: number
  readonly title: string
}

export interface BackupOptions {
  /** How often a backup is taken while the document keeps changing (ms). */
  readonly intervalMs?: number
  /** How many backups to keep; the oldest are pruned. */
  readonly keep?: number
}

export type AutosaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export interface AutosaveState {
  readonly status: AutosaveStatus
  readonly savedAt: number | null
  readonly error: string | null
}

export interface AutosaveOptions {
  readonly storage: KeyValueStorage
  /** Namespace for this document's keys. */
  readonly key?: string
  /** Debounce after the last edit before writing (ms). */
  readonly delayMs?: number
  /** Rolling backups; `false` disables them. */
  readonly backups?: BackupOptions | false
  readonly onState?: (state: AutosaveState) => void
  readonly now?: () => number
}

export interface Backup {
  readonly id: string
  readonly savedAt: number
  readonly title: string
}

export interface Autosave {
  readonly state: AutosaveState
  /** Write now, regardless of the debounce. */
  flush(): Promise<void>
  loadDraft(): Promise<SavedDocument | null>
  clearDraft(): Promise<void>
  listBackups(): Promise<readonly Backup[]>
  loadBackup(id: string): Promise<SavedDocument | null>
  /** Restore a backup into the editor as an undoable step. */
  restoreBackup(id: string): Promise<boolean>
  /** Take a backup of the current document now. */
  backupNow(): Promise<Backup | null>
  destroy(): void
}

/**
 * Autosave the editor into a store. Every edit marks the document dirty and
 * schedules a write; the page hiding or unloading writes immediately, so the
 * draft is never more than one debounce behind. Backups are taken on a
 * slower clock while edits keep coming, and pruned to the newest few.
 */
export function createAutosave(editor: Editor, options: AutosaveOptions): Autosave {
  const key = options.key ?? 'document'
  const draftKey = `${key}:draft`
  const backupPrefix = `${key}:backup:`
  const delay = options.delayMs ?? 1000
  const backups = options.backups === false ? null : (options.backups ?? {})
  const backupInterval = backups?.intervalMs ?? 5 * 60_000
  const keep = backups?.keep ?? 10
  const now = options.now ?? (() => Date.now())

  let state: AutosaveState = { status: 'idle', savedAt: null, error: null }
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastBackupAt = now()
  let dirtySinceBackup = false
  /** Bumped by every edit, so a write in flight can tell it went stale. */
  let revision = 0
  let destroyed = false

  const setState = (next: Partial<AutosaveState>): void => {
    state = { ...state, ...next }
    // A write settling after destroy() must not report into a torn-down host.
    if (!destroyed) options.onState?.(state)
  }

  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void write(), delay)
  }

  const snapshot = (): SavedDocument => ({
    doc: editor.getJSON(),
    savedAt: now(),
    title: documentTitle(editor.state.doc),
  })

  const write = async (): Promise<void> => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    // A write is already in flight; it re-schedules itself if it went stale,
    // so starting a second one here would only race it.
    if (state.status === 'saving') return
    if (state.status !== 'dirty' && state.status !== 'error') return
    const written = revision
    setState({ status: 'saving' })
    const saved = snapshot()
    try {
      await options.storage.set(draftKey, JSON.stringify(saved))
      // An edit that landed while this write was in flight is not on disk:
      // stay dirty and write again rather than reporting a stale "saved".
      const stale = revision !== written
      setState({ status: stale ? 'dirty' : 'saved', savedAt: saved.savedAt, error: null })
      if (stale) {
        if (!destroyed) schedule()
        return
      }
      if (backups && dirtySinceBackup && saved.savedAt - lastBackupAt >= backupInterval) {
        await takeBackup(saved)
      }
    } catch (error) {
      setState({ status: 'error', error: error instanceof Error ? error.message : String(error) })
    }
  }

  const takeBackup = async (saved: SavedDocument): Promise<Backup | null> => {
    if (!backups) return null
    const id = String(saved.savedAt)
    await options.storage.set(backupPrefix + id, JSON.stringify(saved))
    lastBackupAt = saved.savedAt
    dirtySinceBackup = false
    const existing = (await options.storage.keys(backupPrefix))
      .map((entry) => entry.slice(backupPrefix.length))
      .sort((a, b) => Number(b) - Number(a))
    for (const stale of existing.slice(keep)) {
      await options.storage.remove(backupPrefix + stale)
    }
    return { id, savedAt: saved.savedAt, title: saved.title }
  }

  const onUpdate = (): void => {
    dirtySinceBackup = true
    revision++
    setState({ status: 'dirty' })
    schedule()
  }
  const unsubscribe = editor.on('update', onUpdate)

  // Leaving the page must not lose the last debounce window.
  const doc = editor.view?.dom.ownerDocument
  const win = doc?.defaultView
  const onHide = (): void => {
    if (doc?.visibilityState === 'hidden' || !doc) void write()
  }
  const onPageHide = (): void => void write()
  doc?.addEventListener('visibilitychange', onHide)
  win?.addEventListener('pagehide', onPageHide)

  const parse = (raw: string | null): SavedDocument | null => {
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as Partial<SavedDocument> | null
      if (!parsed || typeof parsed !== 'object') return null
      // A record whose `doc` is a number, a string or an array is corrupt
      // storage, not a document. Treat it as if nothing were saved.
      const doc: unknown = parsed.doc
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null
      return {
        doc: doc as DocJSON,
        savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
        title: typeof parsed.title === 'string' ? parsed.title : 'Document',
      }
    } catch {
      return null
    }
  }

  return {
    get state() {
      return state
    },
    flush: write,
    loadDraft: async () => parse(await options.storage.get(draftKey)),
    clearDraft: async () => {
      await options.storage.remove(draftKey)
      setState({ status: 'idle', savedAt: null })
    },
    listBackups: async () => {
      const keys = await options.storage.keys(backupPrefix)
      const entries: Backup[] = []
      for (const entry of keys) {
        const saved = parse(await options.storage.get(entry))
        if (saved) {
          entries.push({
            id: entry.slice(backupPrefix.length),
            savedAt: saved.savedAt,
            title: saved.title,
          })
        }
      }
      return entries.sort((a, b) => b.savedAt - a.savedAt)
    },
    loadBackup: async (id) => parse(await options.storage.get(backupPrefix + id)),
    restoreBackup: async (id) => {
      const saved = parse(await options.storage.get(backupPrefix + id))
      if (!saved) return false
      editor.setContent(saved.doc, { addToHistory: true })
      return true
    },
    backupNow: async () => {
      dirtySinceBackup = true
      return takeBackup(snapshot())
    },
    destroy() {
      unsubscribe()
      doc?.removeEventListener('visibilitychange', onHide)
      win?.removeEventListener('pagehide', onPageHide)
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      // Tearing down mid-debounce must not throw away edits already made, so
      // the pending draft still goes out, silently, into a dead host.
      const unsaved = state.status === 'dirty' || state.status === 'error'
      destroyed = true
      if (unsaved) void write()
    },
  }
}

/** Format a timestamp the way a status bar shows it: `Saved 14:02`. */
export function formatSavedAt(savedAt: number | null, now = Date.now()): string {
  if (savedAt === null) return ''
  const diff = now - savedAt
  if (diff < 10_000) return 'just now'
  if (diff < 60_000) return `${Math.round(diff / 1000)} s ago`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`
  const date = new Date(savedAt)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export interface AutosaveIndicatorOptions {
  readonly container: HTMLElement
  readonly now?: () => number
}

export interface AutosaveIndicator {
  readonly element: HTMLElement
  destroy(): void
}

/**
 * A live "Saved 14:02 · Unsaved changes…" readout for a status bar. It
 * subscribes to the autosave state through a wrapper, so pass the same
 * `onState` through {@link createAutosave} or call `update` yourself.
 */
export function createAutosaveIndicator(
  autosave: Autosave,
  options: AutosaveIndicatorOptions,
): AutosaveIndicator & { update(state: AutosaveState): void } {
  const document = options.container.ownerDocument
  const element = document.createElement('span')
  element.className = 'trevixal-autosave'
  element.setAttribute('role', 'status')
  element.setAttribute('aria-live', 'polite')
  const now = options.now ?? (() => Date.now())

  const update = (state: AutosaveState): void => {
    element.dataset.status = state.status
    switch (state.status) {
      case 'idle':
        element.textContent = ''
        break
      case 'dirty':
        element.textContent = 'Unsaved changes…'
        break
      case 'saving':
        element.textContent = 'Saving…'
        break
      case 'saved':
        element.textContent = `Saved ${formatSavedAt(state.savedAt, now())}`
        break
      case 'error':
        element.textContent = `Could not save: ${state.error ?? 'unknown error'}`
        break
    }
  }
  update(autosave.state)
  // Refresh the relative time every half minute so "just now" ages honestly.
  const tick = setInterval(() => update(autosave.state), 30_000)
  options.container.appendChild(element)
  return {
    element,
    update,
    destroy() {
      clearInterval(tick)
      element.remove()
    },
  }
}

export interface DraftRecoveryOptions {
  /** Where the banner is inserted (prepended). */
  readonly container: HTMLElement
  readonly now?: () => number
}

/**
 * Offer to restore a draft newer than what the editor holds. Resolves with
 * what the user chose; with no draft, or an identical one, nothing is shown.
 */
export async function offerDraftRecovery(
  editor: Editor,
  autosave: Autosave,
  options: DraftRecoveryOptions,
): Promise<'restored' | 'discarded' | 'none'> {
  const draft = await autosave.loadDraft()
  if (!draft) return 'none'
  if (JSON.stringify(draft.doc) === JSON.stringify(editor.getJSON())) return 'none'
  const document = options.container.ownerDocument
  const banner = document.createElement('div')
  banner.className = 'trevixal-banner trevixal-banner--draft'
  banner.setAttribute('role', 'status')
  const text = document.createElement('span')
  text.className = 'trevixal-banner__text'
  text.textContent = `A newer draft (“${draft.title}”, saved ${formatSavedAt(
    draft.savedAt,
    (options.now ?? (() => Date.now()))(),
  )}) was found.`
  const restore = document.createElement('button')
  restore.type = 'button'
  restore.className = 'trevixal-banner__button trevixal-banner__button--primary'
  restore.textContent = 'Restore draft'
  const discard = document.createElement('button')
  discard.type = 'button'
  discard.className = 'trevixal-banner__button'
  discard.textContent = 'Discard'
  banner.append(text, restore, discard)
  options.container.prepend(banner)
  return new Promise((resolve) => {
    restore.addEventListener('click', () => {
      editor.setContent(draft.doc, { addToHistory: true })
      banner.remove()
      resolve('restored')
    })
    discard.addEventListener('click', () => {
      void autosave.clearDraft()
      banner.remove()
      resolve('discarded')
    })
  })
}

export interface BackupsDialogOptions {
  readonly document: Document
  readonly now?: () => number
}

/** List the backups and restore one. Resolves with the restored id, or null. */
export async function openBackupsDialog(
  autosave: Autosave,
  options: BackupsDialogOptions,
): Promise<string | null> {
  const { document } = options
  const backups = await autosave.listBackups()
  const overlay = document.createElement('div')
  overlay.className = 'trevixal-dialog-overlay'
  const dialog = document.createElement('div')
  dialog.className = 'trevixal-dialog trevixal-dialog--backups'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', 'Backups')
  const heading = document.createElement('h2')
  heading.className = 'trevixal-dialog__title'
  heading.textContent = 'Local backups'
  dialog.appendChild(heading)
  const body = document.createElement('p')
  body.className = 'trevixal-dialog__body'
  body.textContent =
    backups.length === 0
      ? 'No backups yet. One is taken every few minutes while you edit.'
      : 'Restoring a backup is undoable with Ctrl+Z.'
  dialog.appendChild(body)
  const list = document.createElement('ul')
  list.className = 'trevixal-backups'
  const now = (options.now ?? (() => Date.now()))()
  let chosen: string | null = null
  const actions = document.createElement('div')
  actions.className = 'trevixal-dialog__actions'
  const backupNow = document.createElement('button')
  backupNow.type = 'button'
  backupNow.className = 'trevixal-dialog__button'
  backupNow.textContent = 'Back up now'
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'trevixal-dialog__button trevixal-dialog__button--primary'
  close.textContent = 'Close'
  actions.append(backupNow, close)

  return new Promise((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      document.removeEventListener('keydown', onKeyDown, true)
      overlay.remove()
      resolve(chosen)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        finish()
      }
    }
    for (const backup of backups) {
      const item = document.createElement('li')
      item.className = 'trevixal-backups__item'
      const label = document.createElement('span')
      label.className = 'trevixal-backups__label'
      label.textContent = `${backup.title}, ${new Date(backup.savedAt).toLocaleString()} (${formatSavedAt(
        backup.savedAt,
        now,
      )})`
      const restore = document.createElement('button')
      restore.type = 'button'
      restore.className = 'trevixal-dialog__button'
      restore.textContent = 'Restore'
      restore.addEventListener('click', () => {
        void autosave.restoreBackup(backup.id).then((ok) => {
          if (ok) chosen = backup.id
          finish()
        })
      })
      item.append(label, restore)
      list.appendChild(item)
    }
    dialog.append(list, actions)
    overlay.appendChild(dialog)
    document.body.appendChild(overlay)
    document.addEventListener('keydown', onKeyDown, true)
    backupNow.addEventListener('click', () => {
      void autosave.backupNow().then(() => finish())
    })
    close.addEventListener('click', finish)
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) finish()
    })
    close.focus()
  })
}
