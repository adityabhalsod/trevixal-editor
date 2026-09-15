/**
 * Everything the editor can do that is not part of the document model:
 * saving, themes, panels, review surfaces and the writing assistant.
 *
 * It lives beside `main.ts` rather than inside it so the entry file stays a
 * readable assembly list. This module is where each capability is actually
 * configured, and each function returns the handle the menus drive.
 */
import type { Editor } from '@trevixal/core'
import { createEncryptedStorage } from '@trevixal/extension-security'
import {
  type Autosave,
  type AutosaveIndicator,
  type AutosaveState,
  type CustomStyles,
  type FontManager,
  type HistoryPanel,
  type KeyValueStorage,
  type PageView,
  type SourceMode,
  type ThemeController,
  type ToolUsageTracker,
  buildCustomTheme,
  createAutosave,
  createAutosaveIndicator,
  createCustomStyles,
  createFontManager,
  createHistoryPanel,
  createPageView,
  createSourceMode,
  createThemeController,
  createToolUsageTracker,
  createWebStorage,
  googleFontURL,
  offerDraftRecovery,
  openBackupsDialog,
  openDialog,
  openInfoDialog,
} from '@trevixal/ui'

/** Where this demo keeps its preferences, so a reload finds them again. */

export interface Preferences {
  theme: 'light' | 'dark' | 'system'
  preset: string | null
  toolbarOrder?: readonly string[]
  toolbarGroups?: readonly string[]
  shortcuts?: Readonly<Record<string, string | null>>
  usage?: { recent: readonly string[]; favorites: readonly string[] }
  customCSS?: string
  goal?: number
}

const DEFAULTS: Preferences = { theme: 'system', preset: null }

// The kit's autosave policy, all three tighter than `createAutosave`'s own
// defaults (1s, 5 minutes, 5). A showcase is closed and reopened far more
// often than a real document, so it saves sooner and keeps more history.
const AUTOSAVE_DELAY_MS = 800
const BACKUP_INTERVAL_MS = 2 * 60_000
const BACKUPS_KEPT = 10

/**
 * The two calls preferences need, and no more.
 *
 * Narrower than `Storage` on purpose: a caller substituting one only has to
 * supply what is used here, not `length`, `key`, `clear` and `removeItem` as
 * well. `window.localStorage` satisfies it as it stands.
 */
export interface PreferenceStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * Read the saved preferences from `key`; storage can be unavailable, so this
 * fails soft. The key is passed in rather than fixed here because two editors
 * built from this package on the same origin should not overwrite each
 * other's theme, see `FullEditorOptions.namespace`.
 *
 * `store` defaults to `window.localStorage`, and is resolved inside the `try`
 * rather than as a parameter default so that reading it on a server: where
 * there is no `window` to reach, still returns the defaults instead of
 * throwing past the caller.
 */
export function loadPreferences(key: string, store?: PreferenceStore): Preferences {
  try {
    const raw = (store ?? window.localStorage).getItem(key)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Preferences) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

export function savePreferences(
  key: string,
  preferences: Preferences,
  store?: PreferenceStore,
): void {
  try {
    ;(store ?? window.localStorage).setItem(key, JSON.stringify(preferences))
  } catch {
    // Private mode, or a hardened embed: the session still works.
  }
}

export interface Chrome {
  readonly theme: ThemeController
  readonly fonts: FontManager
  readonly styles: CustomStyles
  readonly page: PageView
  readonly source: SourceMode
}

/**
 * The presentation layer: theme, fonts, host CSS, the page view and the
 * source modes. None of it touches the document.
 */
export function createChrome(
  editor: Editor,
  shell: HTMLElement,
  root: HTMLElement,
  preferences: Preferences,
  onChange: (next: Partial<Preferences>) => void,
): Chrome {
  const theme = createThemeController(document, {
    // Both the page and the editor follow the theme, so what surrounds the
    // editor is not left light while the editor goes dark. `root` is listed
    // beside the two document-level targets because the editor need not be
    // the whole page: mounted inside a framework's own shell it is one box
    // among several, and only the box gets the tokens unless it is named.
    targets: [document.documentElement, document.body, root],
    mode: preferences.theme,
    preset: preferences.preset,
    onChange: (state) => onChange({ theme: state.mode, preset: state.preset }),
  })

  const fonts = createFontManager(document, {
    fonts: [
      { family: 'Inter', stack: '"Inter", system-ui, sans-serif', url: googleFontURL('Inter') },
      {
        family: 'Merriweather',
        stack: '"Merriweather", Georgia, serif',
        url: googleFontURL('Merriweather'),
      },
    ],
  })

  const styles = createCustomStyles(document)
  if (preferences.customCSS) styles.set(preferences.customCSS)

  const page = createPageView({ target: shell, size: 'a4', margin: 20 })
  const source = createSourceMode(editor, { format: 'markdown' })
  return { theme, fonts, styles, page, source }
}

export interface Saving {
  readonly autosave: Autosave
  readonly indicator: AutosaveIndicator
  /** Offer to restore a newer draft; resolves once the user has chosen. */
  recover(): Promise<void>
  openBackups(): Promise<void>
  /**
   * Encrypt everything this store holds under `password`, or pass null to go
   * back to plaintext. The draft and every backup already on disk are carried
   * across as well as everything written from here on: a password that only
   * protected future saves would leave the text the user just wrote sitting
   * in `localStorage` in the clear, which is the one thing it was asked to
   * stop. Resolves once the migration has been written.
   */
  protect(password: string | null): Promise<void>
}

/**
 * Indirection so the autosave's store can be swapped for an encrypted one
 * after it has been created: the autosave holds this object for its whole
 * life and every call is forwarded to whichever store is current.
 */
function createSwitchableStorage(initial: KeyValueStorage): {
  readonly storage: KeyValueStorage
  use(next: KeyValueStorage): void
} {
  let current = initial
  return {
    storage: {
      get: (key) => current.get(key),
      set: (key, value) => current.set(key, value),
      remove: (key) => current.remove(key),
      keys: (prefix) => current.keys(prefix),
    },
    use(next) {
      current = next
    },
  }
}

/**
 * Autosave into `localStorage` with rolling backups, plus the status readout
 * and the "a newer draft was found" banner. Nothing here needs a server.
 */
export function createSaving(
  editor: Editor,
  statusHost: HTMLElement,
  bannerHost: HTMLElement,
  prefix: string,
): Saving {
  const plain = createWebStorage(window.localStorage, prefix)
  const switchable = createSwitchableStorage(plain)
  const storage = switchable.storage
  // The indicator needs the autosave and the autosave reports into the
  // indicator, so one of the two has to be reached through a holder.
  const readout: { current: ((state: AutosaveState) => void) | null } = { current: null }
  const autosave = createAutosave(editor, {
    storage,
    key: 'document',
    delayMs: AUTOSAVE_DELAY_MS,
    backups: { intervalMs: BACKUP_INTERVAL_MS, keep: BACKUPS_KEPT },
    onState: (state) => readout.current?.(state),
  })
  const indicator = createAutosaveIndicator(autosave, { container: statusHost })
  readout.current = indicator.update

  return {
    autosave,
    indicator,
    recover: async () => {
      await offerDraftRecovery(editor, autosave, { container: bannerHost })
    },
    openBackups: async () => {
      await openBackupsDialog(autosave, { document })
    },
    protect: async (password) => {
      // Read every entry through the store that wrote it, swap the store, then
      // write them all back through the new one. The encrypted store passes a
      // value it cannot parse straight through, so this is a migration in both
      // directions: plaintext in, ciphertext out, and back again when the
      // password is lifted.
      const existing = new Map<string, string>()
      for (const key of await storage.keys()) {
        try {
          const value = await storage.get(key)
          if (value !== null) existing.set(key, value)
        } catch {
          // Written under a password this store cannot open; leave it alone
          // rather than losing it to a failed migration.
        }
      }
      switchable.use(password === null ? plain : createEncryptedStorage(plain, password))
      for (const [key, value] of existing) await storage.set(key, value)
    },
  }
}

/** The custom-theme dialog: five colours become a full palette. */
export async function askCustomTheme(theme: ThemeController): Promise<void> {
  const values = await openDialog({
    document,
    title: 'Custom theme',
    submitLabel: 'Apply',
    body: 'The rest of the palette is derived from these five colours.',
    fields: [
      { name: 'bg', label: 'Page background', type: 'color', value: '#fffdf7' },
      { name: 'surface', label: 'Chrome background', type: 'color', value: '#f3efe4' },
      { name: 'text', label: 'Text', type: 'color', value: '#1f2430' },
      { name: 'border', label: 'Borders', type: 'color', value: '#ddd6c5' },
      { name: 'accent', label: 'Accent', type: 'color', value: '#b45309' },
    ],
  })
  if (!values) return
  theme.register(
    buildCustomTheme({
      name: 'custom',
      label: 'Custom',
      tokens: {
        'color-bg': values.bg,
        'color-surface': values.surface,
        'color-text': values.text,
        'color-border': values.border,
        'color-accent': values.accent,
      },
    }),
  )
  theme.setPreset('custom')
}

/** The custom-CSS dialog. Rules are scoped to the editing surface. */
export async function askCustomCSS(
  styles: CustomStyles,
  onChange: (css: string) => void,
): Promise<void> {
  const values = await openDialog({
    document,
    title: 'Custom CSS',
    submitLabel: 'Apply',
    body: 'Every rule is scoped to the editor, so it cannot restyle the page around it.',
    fields: [
      {
        name: 'css',
        label: 'CSS',
        type: 'textarea',
        value: styles.css,
        placeholder: 'h1 { letter-spacing: -0.02em }',
      },
    ],
  })
  if (values?.css === undefined) return
  styles.set(values.css)
  onChange(values.css)
}

/** Register a Google font by name and offer it in the font select. */
export async function askFont(fonts: FontManager, onAdded: () => void): Promise<void> {
  const values = await openDialog({
    document,
    title: 'Add a font',
    submitLabel: 'Load',
    body: 'Any family on Google Fonts; it is loaded on demand and added to the font menu.',
    fields: [
      { name: 'family', label: 'Family', type: 'text', required: true, placeholder: 'Lora' },
    ],
  })
  if (!values?.family) return
  const family = values.family.trim()
  fonts.add({
    family,
    stack: `"${family}", serif`,
    url: googleFontURL(family),
  })
  onAdded()
}

/** One row of the keyword-density table: how often a word carries the text. */
export interface KeywordStat {
  readonly word: string
  readonly count: number
  /** Share of all words, 0-1. */
  readonly density: number
}

export interface DocumentStats {
  readonly words: number
  readonly characters: number
  readonly sentences: number
  readonly paragraphs: number
  readonly readingTime: string
  readonly speakingTime: string
  readonly readability: string
  readonly passive: number
  readonly repeated: number
  /** Most-used words, already trimmed to the few worth showing. */
  readonly keywords: readonly KeywordStat[]
}

/** `writing, 12 (3.4%)`: the count first, since the share is the smaller signal. */
function describeKeyword(entry: KeywordStat): string {
  return `${entry.word}, ${entry.count} (${(entry.density * 100).toFixed(1)}%)`
}

/** Show the statistics dialog for a computed report. */
export async function showStatistics(stats: DocumentStats): Promise<void> {
  await openInfoDialog({
    document,
    title: 'Document statistics',
    body: 'Counts, readability and keyword density for the whole document.',
    rows: [
      { term: 'Words', description: String(stats.words) },
      { term: 'Characters', description: String(stats.characters) },
      { term: 'Sentences', description: String(stats.sentences) },
      { term: 'Paragraphs', description: String(stats.paragraphs) },
      { term: 'Reading time', description: stats.readingTime },
      { term: 'Speaking time', description: stats.speakingTime },
      { term: 'Readability', description: stats.readability },
      { term: 'Passive sentences', description: String(stats.passive) },
      { term: 'Repeated words', description: String(stats.repeated) },
      {
        term: 'Keyword density',
        description:
          stats.keywords.length > 0
            ? stats.keywords.map(describeKeyword).join(', ')
            : 'Not enough text yet',
      },
    ],
  })
}

/** The history panel, built on first use and toggled after that. */
export function createHistoryToggle(editor: Editor, container: HTMLElement): () => void {
  let panel: HistoryPanel | null = null
  return () => {
    if (panel) {
      panel.destroy()
      panel = null
      container.hidden = true
      return
    }
    panel = createHistoryPanel(editor, { container })
    container.hidden = false
  }
}

// ------------------------------------------------------------------ security

/** How this document is protected: the password it is encrypted under, and when it stops opening. */
export interface Protection {
  readonly password: string | null
  /** Epoch milliseconds, or null for a document that never expires. */
  readonly expiresAt: number | null
}

/**
 * Collect a password (twice) and an optional deadline. An empty password is
 * how protection is lifted, so the same dialog both sets and clears it.
 * Returns null when the user cancelled or mistyped the confirmation. The
 * caller then leaves the current protection alone.
 */
export async function askProtection(current: Protection): Promise<Protection | null> {
  const values = await openDialog({
    document,
    title: current.password ? 'Change the password' : 'Protect with password',
    submitLabel: current.password ? 'Update' : 'Protect',
    body: 'Everything saved from here on is encrypted in this browser with AES-256-GCM. The password is never stored. Lose it and the document is gone. Leave it blank to remove protection.',
    fields: [
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        placeholder: 'Leave blank to remove',
      },
      { name: 'confirm', label: 'Confirm password', type: 'password' },
      {
        name: 'expiry',
        label: 'Expires after (days)',
        type: 'number',
        placeholder: 'Never',
        hint: 'The deadline is sealed into the file, so it cannot be edited to buy more time.',
      },
    ],
  })
  if (!values) return null
  const password = values.password
  if (!password) return { password: null, expiresAt: null }
  if (password !== values.confirm) {
    await openInfoDialog({
      document,
      title: 'Passwords do not match',
      body: 'Nothing was changed. Type the same password in both boxes.',
    })
    return null
  }
  const days = Number(values.expiry)
  const expiresAt =
    values.expiry.trim() !== '' && Number.isFinite(days) && days > 0
      ? Date.now() + days * 24 * 60 * 60 * 1000
      : null
  return { password, expiresAt }
}

/** Ask for the password that opens an encrypted file. Null when dismissed. */
export async function askPassword(title: string): Promise<string | null> {
  const values = await openDialog({
    document,
    title: 'Encrypted document',
    submitLabel: 'Unlock',
    body: title ? `“${title}” is password-protected.` : 'This file is password-protected.',
    fields: [{ name: 'password', label: 'Password', type: 'password', required: true }],
  })
  return values?.password || null
}

/** The six things `applyRestrictions` can block, in the order the dialog lists them. */
export const RESTRICTION_FIELDS: readonly { readonly name: string; readonly label: string }[] = [
  { name: 'copy', label: 'Copying' },
  { name: 'cut', label: 'Cutting' },
  { name: 'paste', label: 'Pasting' },
  { name: 'print', label: 'Printing' },
  { name: 'download', label: 'Downloading' },
  { name: 'contextMenu', label: 'The context menu' },
]

/**
 * Checkboxes for the blocked actions. Values come back as booleans keyed the
 * way `DocumentRestrictions` expects, so the caller can pass them straight on.
 */
export async function askRestrictions(
  current: Readonly<Record<string, boolean>>,
): Promise<Record<string, boolean> | null> {
  const values = await openDialog({
    document,
    title: 'Restrictions',
    submitLabel: 'Apply',
    body: 'Tick what this document should refuse. These are guard rails against casual leakage, not DRM. A reader can always photograph the screen.',
    fields: RESTRICTION_FIELDS.map((entry) => ({
      name: entry.name,
      label: `Block ${entry.label.toLowerCase()}`,
      type: 'checkbox' as const,
      value: String(current[entry.name] === true),
    })),
  })
  if (!values) return null
  const chosen: Record<string, boolean> = {}
  for (const entry of RESTRICTION_FIELDS) chosen[entry.name] = values[entry.name] === 'true'
  return chosen
}

// ------------------------------------------------------------------- offline

/**
 * "Offline: changes are saved locally" whenever the browser says the network
 * is gone. Autosave writes to `localStorage`, so going offline costs nothing;
 * the line exists so the reader knows that rather than guessing. Returns a
 * disposer that removes both listeners.
 */
export function createOfflineIndicator(host: HTMLElement): () => void {
  const render = (): void => {
    const offline = window.navigator.onLine === false
    host.textContent = offline ? 'Offline: changes are saved locally' : ''
    host.hidden = !offline
  }
  window.addEventListener('online', render)
  window.addEventListener('offline', render)
  render()
  return () => {
    window.removeEventListener('online', render)
    window.removeEventListener('offline', render)
  }
}

/** Usage tracking for the recent-tools tray and favourites. */
export function createUsage(
  preferences: Preferences,
  onChange: (next: Partial<Preferences>) => void,
): ToolUsageTracker {
  return createToolUsageTracker({
    usage: preferences.usage ?? { recent: [], favorites: [] },
    onChange: (usage) => onChange({ usage }),
  })
}
