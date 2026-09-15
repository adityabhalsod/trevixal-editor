/**
 * The document store behind the workspace: an index of document metadata
 * plus one entry per document body, on top of a tiny async key/value store.
 *
 * The index is what the UI reads synchronously (tab titles, the folder tree,
 * recents); bodies load on demand, so a workspace of hundreds of documents
 * costs one `get` at startup rather than hundreds.
 */

import type { DocJSON } from '@trevixal/core'

/** A tiny async key/value store: localStorage, IndexedDB, a server, or an encrypted wrapper. */
export interface KeyValueStorage {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
  /** Every key currently stored (optionally only those with a prefix). */
  keys(prefix?: string): Promise<readonly string[]>
}

/** In-memory store: tests, SSR, and a safe fallback when `localStorage` is blocked. */
export function createMemoryStorage(): KeyValueStorage {
  const entries = new Map<string, string>()
  return {
    async get(key) {
      return entries.get(key) ?? null
    },
    async set(key, value) {
      entries.set(key, value)
    },
    async remove(key) {
      entries.delete(key)
    },
    async keys(prefix) {
      const all = [...entries.keys()]
      return prefix ? all.filter((key) => key.startsWith(prefix)) : all
    },
  }
}

/**
 * Wrap `localStorage` / `sessionStorage`. The prefix keeps Trevixal's entries
 * apart from the host page's, and is stripped again by `keys()` so callers
 * never see it.
 */
export function createWebStorage(storage: Storage, prefix = 'trevixal:'): KeyValueStorage {
  return {
    async get(key) {
      return storage.getItem(`${prefix}${key}`)
    },
    async set(key, value) {
      storage.setItem(`${prefix}${key}`, value)
    },
    async remove(key) {
      storage.removeItem(`${prefix}${key}`)
    },
    async keys(keyPrefix) {
      const found: string[] = []
      for (let index = 0; index < storage.length; index++) {
        const raw = storage.key(index)
        if (raw === null || !raw.startsWith(prefix)) continue
        const key = raw.slice(prefix.length)
        if (!keyPrefix || key.startsWith(keyPrefix)) found.push(key)
      }
      return found
    },
  }
}

/** One stored document: its metadata and its body. */
export interface DocumentRecord {
  readonly id: string
  readonly title: string
  /** Folder path with `/` separators (`'Work/Q3'`); null for the root. */
  readonly folder: string | null
  readonly doc: DocJSON
  readonly createdAt: number
  readonly updatedAt: number
  /** When the document was last opened in a tab; null if never. */
  readonly lastOpenedAt: number | null
  readonly favorite: boolean
  readonly pinned: boolean
  /** The template the document was created from, if any. */
  readonly templateId?: string
  readonly tags?: readonly string[]
}

/** The index entry for a document: everything but the body. */
export type DocumentMeta = Omit<DocumentRecord, 'doc'>

export interface CreateDocumentOptions {
  /** Defaults to a title derived from the body (first heading or line). */
  readonly title?: string
  readonly folder?: string | null
  readonly doc: DocJSON
  readonly templateId?: string
  readonly tags?: readonly string[]
}

export interface SaveDocumentOptions {
  /** Update the title alongside the body (the autosaver tracks the first heading). */
  readonly title?: string
}

export interface WorkspaceStoreOptions {
  /** Clock, for tests. Defaults to `Date.now`. */
  readonly now?: () => number
  /** Id generator, for tests. Defaults to `crypto.randomUUID()`. */
  readonly idFactory?: () => string
}

/** What {@link WorkspaceStore.export} produces and {@link WorkspaceStore.import} accepts. */
export interface WorkspaceBundle {
  readonly version: 1
  readonly exportedAt: number
  readonly folders: readonly string[]
  readonly documents: readonly DocumentRecord[]
}

export type WorkspaceListener = (store: WorkspaceStore) => void

/** Storage key of the index (metadata for every document plus explicit folders). */
export const INDEX_KEY = 'workspace:index'
/** Storage key prefix of document bodies. */
export const DOC_KEY_PREFIX = 'workspace:doc:'

interface IndexJSON {
  readonly version: number
  readonly documents: readonly unknown[]
  readonly folders: readonly unknown[]
}

/** A body for a document whose stored body is missing or corrupt. */
const EMPTY_DOC: DocJSON = { type: 'doc', content: [{ type: 'paragraph' }] }

/** Parse JSON, treating anything unparsable as absent rather than throwing. */
function safeParse(raw: string | null): unknown {
  if (raw === null) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** `' Work / Q3 /'` → `'Work/Q3'`; empty or root-ish input → null. */
export function normalizeFolder(path: string | null | undefined): string | null {
  if (path === null || path === undefined) return null
  const segments = path
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
  return segments.length > 0 ? segments.join('/') : null
}

/** The parent of a folder path, or null at the top level. */
export function parentFolder(path: string): string | null {
  const index = path.lastIndexOf('/')
  return index === -1 ? null : path.slice(0, index)
}

/** Whether `folder` is `ancestor` itself or lives somewhere below it. */
function isWithin(folder: string | null, ancestor: string): boolean {
  return folder !== null && (folder === ancestor || folder.startsWith(`${ancestor}/`))
}

/** Rewrite the `from` prefix of a folder path to `to` (null `to` re-parents to the root). */
function reparent(folder: string, from: string, to: string | null): string | null {
  const rest = folder === from ? '' : folder.slice(from.length + 1)
  if (to === null) return rest.length > 0 ? rest : null
  return rest.length > 0 ? `${to}/${rest}` : to
}

/** Plain text of a JSON document, for deriving titles. */
function textOf(node: DocJSON): string {
  if (node.type === 'text') return node.text ?? ''
  let text = ''
  for (const child of node.content ?? []) {
    const part = textOf(child)
    if (part) text += (text && child.type !== 'text' ? ' ' : '') + part
  }
  return text
}

/**
 * A title from a document body: the first heading's text, else the first
 * sixty characters of prose, else "Untitled". Lives here rather than in the
 * templates module so the store has no dependency on the schema.
 */
export function deriveTitle(doc: DocJSON, untitled = 'Untitled'): string {
  const findHeading = (node: DocJSON): string | null => {
    if (node.type === 'heading') {
      const text = textOf(node).trim()
      if (text) return text
    }
    for (const child of node.content ?? []) {
      const found = findHeading(child)
      if (found) return found
    }
    return null
  }
  const heading = findHeading(doc)
  if (heading) return clip(heading)
  const text = textOf(doc).replace(/\s+/g, ' ').trim()
  return text ? clip(text) : untitled
}

function clip(text: string, limit = 60): string {
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text
}

/** Random id: a UUID where the platform offers one, a time-salted string elsewhere. */
export function randomId(): string {
  const api = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (api && typeof api.randomUUID === 'function') return api.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * The workspace's document store. Metadata lives in memory and is read
 * synchronously; every mutation writes through to storage and notifies
 * subscribers, so the tab strip and the panel re-render from one source.
 */
export class WorkspaceStore {
  private readonly metas = new Map<string, DocumentMeta>()
  private readonly explicitFolders = new Set<string>()
  private readonly listeners = new Set<WorkspaceListener>()
  private readonly now: () => number
  private readonly idFactory: () => string

  private constructor(
    /** The underlying storage, so companions (the tab strip) can persist beside the index. */
    readonly storage: KeyValueStorage,
    options: WorkspaceStoreOptions,
  ) {
    this.now = options.now ?? (() => Date.now())
    this.idFactory = options.idFactory ?? randomId
  }

  /**
   * Load the index from storage. A missing or corrupt index yields an empty
   * workspace rather than a failure. The bodies are still there, so nothing
   * is lost that a later import cannot recover.
   */
  static async open(
    storage: KeyValueStorage,
    options: WorkspaceStoreOptions = {},
  ): Promise<WorkspaceStore> {
    const store = new WorkspaceStore(storage, options)
    const parsed = safeParse(await storage.get(INDEX_KEY))
    if (isRecord(parsed)) {
      const index = parsed as Partial<IndexJSON>
      for (const entry of Array.isArray(index.documents) ? index.documents : []) {
        const meta = store.coerceMeta(entry)
        if (meta) store.metas.set(meta.id, meta)
      }
      for (const folder of Array.isArray(index.folders) ? index.folders : []) {
        const normalized = typeof folder === 'string' ? normalizeFolder(folder) : null
        if (normalized) store.explicitFolders.add(normalized)
      }
    }
    return store
  }

  /** Every document's metadata, most recently updated first. */
  list(): readonly DocumentMeta[] {
    return [...this.metas.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /** Metadata for one document, or null. Synchronous: the index is in memory. */
  meta(id: string): DocumentMeta | null {
    return this.metas.get(id) ?? null
  }

  /** A document with its body, or null when the id is unknown. */
  async get(id: string): Promise<DocumentRecord | null> {
    const meta = this.metas.get(id)
    if (!meta) return null
    const parsed = safeParse(await this.storage.get(`${DOC_KEY_PREFIX}${id}`))
    const doc =
      isRecord(parsed) && typeof parsed.type === 'string'
        ? (parsed as unknown as DocJSON)
        : EMPTY_DOC
    return { ...meta, doc }
  }

  async create(options: CreateDocumentOptions): Promise<DocumentRecord> {
    const time = this.now()
    let id = this.idFactory()
    // An id factory that repeats (a test counter reopening a store) must not
    // silently overwrite an existing document.
    while (this.metas.has(id)) id = randomId()
    const meta: DocumentMeta = {
      id,
      title: options.title?.trim() || deriveTitle(options.doc),
      folder: normalizeFolder(options.folder),
      createdAt: time,
      updatedAt: time,
      lastOpenedAt: null,
      favorite: false,
      pinned: false,
      ...(options.templateId ? { templateId: options.templateId } : {}),
      ...(options.tags && options.tags.length > 0 ? { tags: [...options.tags] } : {}),
    }
    await this.storage.set(`${DOC_KEY_PREFIX}${id}`, JSON.stringify(options.doc))
    this.metas.set(id, meta)
    await this.commit()
    return { ...meta, doc: options.doc }
  }

  /** Replace a document's body (and optionally its title), bumping `updatedAt`. */
  async save(id: string, doc: DocJSON, options: SaveDocumentOptions = {}): Promise<DocumentRecord> {
    const meta = this.require(id)
    await this.storage.set(`${DOC_KEY_PREFIX}${id}`, JSON.stringify(doc))
    const next: DocumentMeta = {
      ...meta,
      updatedAt: this.now(),
      ...(options.title?.trim() ? { title: options.title.trim() } : {}),
    }
    this.metas.set(id, next)
    await this.commit()
    return { ...next, doc }
  }

  async rename(id: string, title: string): Promise<DocumentMeta> {
    const trimmed = title.trim()
    return this.update(id, (meta) => ({ ...meta, title: trimmed || meta.title }))
  }

  async move(id: string, folder: string | null): Promise<DocumentMeta> {
    const target = normalizeFolder(folder)
    if (target) this.explicitFolders.add(target)
    return this.update(id, (meta) => ({ ...meta, folder: target }))
  }

  async setFavorite(id: string, favorite: boolean): Promise<DocumentMeta> {
    return this.update(id, (meta) => ({ ...meta, favorite }))
  }

  async setPinned(id: string, pinned: boolean): Promise<DocumentMeta> {
    return this.update(id, (meta) => ({ ...meta, pinned }))
  }

  /** Record that the document was opened, for the recents list. */
  async touch(id: string): Promise<DocumentMeta> {
    const time = this.now()
    return this.update(id, (meta) => ({ ...meta, lastOpenedAt: time }))
  }

  /** Copy a document (body, folder, tags) as "Copy of <title>", unpinned and unfavorited. */
  async duplicate(id: string): Promise<DocumentRecord> {
    const source = await this.get(id)
    if (!source) throw new RangeError(`Unknown document "${id}"`)
    return this.create({
      title: `Copy of ${source.title}`,
      folder: source.folder,
      doc: source.doc,
      ...(source.templateId ? { templateId: source.templateId } : {}),
      ...(source.tags ? { tags: source.tags } : {}),
    })
  }

  async remove(id: string): Promise<void> {
    if (!this.metas.has(id)) return
    this.metas.delete(id)
    await this.storage.remove(`${DOC_KEY_PREFIX}${id}`)
    await this.commit()
  }

  /**
   * Every folder path, sorted, including the implicit parents of nested
   * paths. A document in `Work/Q3` means `Work` exists even if nothing was
   * ever filed there directly.
   */
  folders(): readonly string[] {
    const found = new Set<string>()
    const add = (path: string): void => {
      let current: string | null = path
      while (current !== null && !found.has(current)) {
        found.add(current)
        current = parentFolder(current)
      }
    }
    for (const folder of this.explicitFolders) add(folder)
    for (const meta of this.metas.values()) if (meta.folder) add(meta.folder)
    return [...found].sort((a, b) => a.localeCompare(b))
  }

  async createFolder(path: string): Promise<string | null> {
    const normalized = normalizeFolder(path)
    if (!normalized) return null
    this.explicitFolders.add(normalized)
    await this.commit()
    return normalized
  }

  /** Rename (or re-parent) a folder, carrying its documents and subfolders along. */
  async renameFolder(from: string, to: string): Promise<string | null> {
    const source = normalizeFolder(from)
    const target = normalizeFolder(to)
    if (!source || !target || source === target) return target
    for (const [id, meta] of this.metas) {
      if (isWithin(meta.folder, source)) {
        this.metas.set(id, { ...meta, folder: reparent(meta.folder as string, source, target) })
      }
    }
    for (const folder of [...this.explicitFolders]) {
      if (isWithin(folder, source)) {
        this.explicitFolders.delete(folder)
        const moved = reparent(folder, source, target)
        if (moved) this.explicitFolders.add(moved)
      }
    }
    this.explicitFolders.add(target)
    await this.commit()
    return target
  }

  /** Delete a folder. Its documents and subfolders move up to its parent. */
  async removeFolder(path: string): Promise<void> {
    const source = normalizeFolder(path)
    if (!source) return
    const parent = parentFolder(source)
    for (const [id, meta] of this.metas) {
      if (isWithin(meta.folder, source)) {
        this.metas.set(id, { ...meta, folder: reparent(meta.folder as string, source, parent) })
      }
    }
    for (const folder of [...this.explicitFolders]) {
      if (isWithin(folder, source)) {
        this.explicitFolders.delete(folder)
        const moved = reparent(folder, source, parent)
        if (moved) this.explicitFolders.add(moved)
      }
    }
    await this.commit()
  }

  /** Documents that have been opened, most recent first. */
  recent(limit = 10): readonly DocumentMeta[] {
    return [...this.metas.values()]
      .filter((meta) => meta.lastOpenedAt !== null)
      .sort((a, b) => (b.lastOpenedAt as number) - (a.lastOpenedAt as number))
      .slice(0, Math.max(0, limit))
  }

  favorites(): readonly DocumentMeta[] {
    return this.list().filter((meta) => meta.favorite)
  }

  /**
   * Documents whose title, folder or tags contain every word of the query,
   * case-insensitively. Bodies are not searched: they are not in memory.
   */
  search(query: string): readonly DocumentMeta[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return this.list()
    return this.list().filter((meta) => {
      const haystack = [meta.title, meta.folder ?? '', ...(meta.tags ?? [])].join(' ').toLowerCase()
      return words.every((word) => haystack.includes(word))
    })
  }

  /** Be told after every committed change. Returns a disposer. */
  subscribe(listener: WorkspaceListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Everything, bodies included, as one JSON-serializable bundle. */
  async export(): Promise<WorkspaceBundle> {
    const documents: DocumentRecord[] = []
    for (const meta of this.list()) {
      const record = await this.get(meta.id)
      if (record) documents.push(record)
    }
    return { version: 1, exportedAt: this.now(), folders: this.folders(), documents }
  }

  /**
   * Merge a bundle in. Documents keep their ids, so re-importing an export
   * updates in place instead of duplicating; anything malformed is skipped.
   * Returns the number of documents imported.
   */
  async import(bundle: unknown): Promise<number> {
    if (!isRecord(bundle)) return 0
    let imported = 0
    for (const entry of Array.isArray(bundle.documents) ? bundle.documents : []) {
      const meta = this.coerceMeta(entry)
      const doc = isRecord(entry) && isRecord(entry.doc) ? (entry.doc as unknown as DocJSON) : null
      if (!meta || !doc || typeof doc.type !== 'string') continue
      await this.storage.set(`${DOC_KEY_PREFIX}${meta.id}`, JSON.stringify(doc))
      this.metas.set(meta.id, meta)
      imported++
    }
    for (const folder of Array.isArray(bundle.folders) ? bundle.folders : []) {
      const normalized = typeof folder === 'string' ? normalizeFolder(folder) : null
      if (normalized) this.explicitFolders.add(normalized)
    }
    await this.commit()
    return imported
  }

  private require(id: string): DocumentMeta {
    const meta = this.metas.get(id)
    if (!meta) throw new RangeError(`Unknown document "${id}"`)
    return meta
  }

  private async update(
    id: string,
    change: (meta: DocumentMeta) => DocumentMeta,
  ): Promise<DocumentMeta> {
    const next = change(this.require(id))
    this.metas.set(id, next)
    await this.commit()
    return next
  }

  /** Write the index and tell subscribers. */
  private async commit(): Promise<void> {
    const index: IndexJSON = {
      version: 1,
      documents: [...this.metas.values()],
      folders: [...this.explicitFolders],
    }
    await this.storage.set(INDEX_KEY, JSON.stringify(index))
    for (const listener of [...this.listeners]) listener(this)
  }

  /** A stored index entry as a well-formed meta, or null if unusable. */
  private coerceMeta(entry: unknown): DocumentMeta | null {
    if (!isRecord(entry) || typeof entry.id !== 'string' || entry.id.length === 0) return null
    const time = this.now()
    const tags = Array.isArray(entry.tags)
      ? entry.tags.filter((tag): tag is string => typeof tag === 'string')
      : null
    return {
      id: entry.id,
      title: typeof entry.title === 'string' && entry.title.trim() ? entry.title : 'Untitled',
      folder: typeof entry.folder === 'string' ? normalizeFolder(entry.folder) : null,
      createdAt: numberOr(entry.createdAt, time),
      updatedAt: numberOr(entry.updatedAt, time),
      lastOpenedAt: typeof entry.lastOpenedAt === 'number' ? entry.lastOpenedAt : null,
      favorite: entry.favorite === true,
      pinned: entry.pinned === true,
      ...(typeof entry.templateId === 'string' ? { templateId: entry.templateId } : {}),
      ...(tags && tags.length > 0 ? { tags } : {}),
    }
  }
}
