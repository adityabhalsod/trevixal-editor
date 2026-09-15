import type { DocJSON } from '@trevixal/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DOC_KEY_PREFIX,
  INDEX_KEY,
  type KeyValueStorage,
  WorkspaceStore,
  createMemoryStorage,
  createWebStorage,
  deriveTitle,
  normalizeFolder,
  parentFolder,
  randomId,
} from '../src/store'

/** A document body with one heading and one paragraph. */
function docWith(heading: string, body = 'Body text.'): DocJSON {
  return {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: heading }] },
      { type: 'paragraph', content: [{ type: 'text', text: body }] },
    ],
  }
}

const PLAIN: DocJSON = { type: 'doc', content: [{ type: 'paragraph' }] }

let clock = 1_000
let counter = 0

beforeEach(() => {
  clock = 1_000
  counter = 0
})

/** A store on fresh memory storage with a deterministic clock and ids. */
async function open(storage: KeyValueStorage = createMemoryStorage()): Promise<WorkspaceStore> {
  return WorkspaceStore.open(storage, {
    now: () => {
      clock += 10
      return clock
    },
    idFactory: () => `doc-${++counter}`,
  })
}

describe('folder and title helpers', () => {
  it('normalizes folder paths', () => {
    expect(normalizeFolder(' Work / Q3 /')).toBe('Work/Q3')
    expect(normalizeFolder('Work')).toBe('Work')
    expect(normalizeFolder('')).toBeNull()
    expect(normalizeFolder('///')).toBeNull()
    expect(normalizeFolder(null)).toBeNull()
    expect(normalizeFolder(undefined)).toBeNull()
  })

  it('finds a folder’s parent', () => {
    expect(parentFolder('Work/Q3/Notes')).toBe('Work/Q3')
    expect(parentFolder('Work')).toBeNull()
  })

  it('derives a title from the first heading', () => {
    expect(deriveTitle(docWith('Quarterly plan'))).toBe('Quarterly plan')
  })

  it('falls back to the first prose, then to "Untitled"', () => {
    expect(
      deriveTitle({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Just prose here.' }] }],
      }),
    ).toBe('Just prose here.')
    expect(deriveTitle(PLAIN)).toBe('Untitled')
    expect(deriveTitle(PLAIN, 'No name')).toBe('No name')
  })

  it('clips a very long title', () => {
    const title = deriveTitle(docWith('x'.repeat(100)))
    expect(title).toHaveLength(60)
    expect(title.endsWith('…')).toBe(true)
  })

  it('mints distinct ids', () => {
    expect(randomId()).not.toBe(randomId())
    expect(randomId().length).toBeGreaterThan(8)
  })
})

describe('storage adapters', () => {
  it('reads back what it wrote and lists keys by prefix', async () => {
    const storage = createMemoryStorage()
    await storage.set('a:1', 'one')
    await storage.set('b:2', 'two')
    expect(await storage.get('a:1')).toBe('one')
    expect(await storage.get('missing')).toBeNull()
    expect([...(await storage.keys('a:'))]).toEqual(['a:1'])
    expect((await storage.keys()).length).toBe(2)
    await storage.remove('a:1')
    expect(await storage.get('a:1')).toBeNull()
  })

  it('prefixes web storage keys and strips the prefix again', async () => {
    localStorage.clear()
    localStorage.setItem('host-key', 'not ours')
    const storage = createWebStorage(localStorage, 'tx:')
    await storage.set('workspace:index', '{}')
    expect(localStorage.getItem('tx:workspace:index')).toBe('{}')
    expect(await storage.keys()).toEqual(['workspace:index'])
    expect(await storage.keys('workspace:')).toEqual(['workspace:index'])
    expect(await storage.keys('other')).toEqual([])
    await storage.remove('workspace:index')
    expect(await storage.get('workspace:index')).toBeNull()
    localStorage.clear()
  })
})

describe('WorkspaceStore documents', () => {
  it('creates a document, deriving its title and storing its body apart', async () => {
    const storage = createMemoryStorage()
    const store = await open(storage)
    const record = await store.create({ doc: docWith('Quarterly plan') })
    expect(record.id).toBe('doc-1')
    expect(record.title).toBe('Quarterly plan')
    expect(record).toMatchObject({
      folder: null,
      favorite: false,
      pinned: false,
      lastOpenedAt: null,
    })
    expect(await storage.get(`${DOC_KEY_PREFIX}doc-1`)).toBe(
      JSON.stringify(docWith('Quarterly plan')),
    )
    expect(store.meta('doc-1')?.title).toBe('Quarterly plan')
    expect(store.list()).toHaveLength(1)
  })

  it('accepts an explicit title, folder, template and tags', async () => {
    const store = await open()
    const record = await store.create({
      title: '  Notes  ',
      folder: ' Work / Q3 ',
      doc: PLAIN,
      templateId: 'meeting-notes',
      tags: ['team'],
    })
    expect(record.title).toBe('Notes')
    expect(record.folder).toBe('Work/Q3')
    expect(record.templateId).toBe('meeting-notes')
    expect(record.tags).toEqual(['team'])
  })

  it('reads a document back with its body', async () => {
    const store = await open()
    await store.create({ doc: docWith('One') })
    const record = await store.get('doc-1')
    expect(record?.doc).toEqual(docWith('One'))
    expect(await store.get('nope')).toBeNull()
  })

  it('falls back to an empty body when the stored one is corrupt', async () => {
    const storage = createMemoryStorage()
    const store = await open(storage)
    await store.create({ doc: docWith('One') })
    await storage.set(`${DOC_KEY_PREFIX}doc-1`, '{ not json')
    expect((await store.get('doc-1'))?.doc).toEqual(PLAIN)
  })

  it('saves a new body and bumps updatedAt', async () => {
    const store = await open()
    const created = await store.create({ doc: docWith('One') })
    const saved = await store.save('doc-1', docWith('Two'))
    expect(saved.updatedAt).toBeGreaterThan(created.updatedAt)
    expect(saved.title).toBe('One') // the title only follows when asked
    expect((await store.get('doc-1'))?.doc).toEqual(docWith('Two'))
    expect((await store.save('doc-1', docWith('Two'), { title: 'Renamed' })).title).toBe('Renamed')
    expect((await store.save('doc-1', docWith('Two'), { title: '   ' })).title).toBe('Renamed')
  })

  it('renames, moves, favourites, pins and touches', async () => {
    const store = await open()
    await store.create({ doc: PLAIN })
    expect((await store.rename('doc-1', '  New name ')).title).toBe('New name')
    expect((await store.rename('doc-1', '   ')).title).toBe('New name')
    expect((await store.move('doc-1', ' Work / Q3 ')).folder).toBe('Work/Q3')
    expect(store.folders()).toEqual(['Work', 'Work/Q3'])
    expect((await store.move('doc-1', null)).folder).toBeNull()
    expect((await store.setFavorite('doc-1', true)).favorite).toBe(true)
    expect((await store.setPinned('doc-1', true)).pinned).toBe(true)
    expect((await store.touch('doc-1')).lastOpenedAt).toBeGreaterThan(0)
  })

  it('duplicates a document without its pin or favourite', async () => {
    const store = await open()
    await store.create({ doc: docWith('Plan'), folder: 'Work', tags: ['a'] })
    await store.setFavorite('doc-1', true)
    await store.setPinned('doc-1', true)
    const copy = await store.duplicate('doc-1')
    expect(copy.id).toBe('doc-2')
    expect(copy.title).toBe('Copy of Plan')
    expect(copy.folder).toBe('Work')
    expect(copy.tags).toEqual(['a'])
    expect(copy.favorite).toBe(false)
    expect(copy.pinned).toBe(false)
    expect(copy.doc).toEqual(docWith('Plan'))
  })

  it('removes a document and its body', async () => {
    const storage = createMemoryStorage()
    const store = await open(storage)
    await store.create({ doc: PLAIN })
    await store.remove('doc-1')
    expect(store.meta('doc-1')).toBeNull()
    expect(await storage.get(`${DOC_KEY_PREFIX}doc-1`)).toBeNull()
    await expect(store.remove('doc-1')).resolves.toBeUndefined()
  })

  it('refuses to touch an unknown document', async () => {
    const store = await open()
    await expect(store.rename('nope', 'x')).rejects.toThrow(RangeError)
    await expect(store.save('nope', PLAIN)).rejects.toThrow(/Unknown document/)
    await expect(store.duplicate('nope')).rejects.toThrow(/Unknown document/)
  })

  it('lists documents most recently updated first', async () => {
    const store = await open()
    await store.create({ doc: docWith('First') })
    await store.create({ doc: docWith('Second') })
    await store.save('doc-1', docWith('First again'))
    expect(store.list().map((meta) => meta.id)).toEqual(['doc-1', 'doc-2'])
  })

  it('never overwrites an existing document when the id factory repeats', async () => {
    const storage = createMemoryStorage()
    const first = await open(storage)
    await first.create({ doc: docWith('Keep me') })
    // A second store with the same counter would mint "doc-1" again.
    counter = 0
    const second = await open(storage)
    const record = await second.create({ doc: docWith('New one') })
    expect(record.id).not.toBe('doc-1')
    expect(second.meta('doc-1')?.title).toBe('Keep me')
    expect(second.list()).toHaveLength(2)
  })
})

describe('WorkspaceStore persistence', () => {
  it('reloads its index from the same storage', async () => {
    const storage = createMemoryStorage()
    const first = await open(storage)
    await first.create({ doc: docWith('Kept'), folder: 'Work/Q3', tags: ['x'] })
    await first.setFavorite('doc-1', true)
    await first.touch('doc-1')
    await first.createFolder('Archive')

    const second = await WorkspaceStore.open(storage)
    const meta = second.meta('doc-1')
    expect(meta).toMatchObject({ title: 'Kept', folder: 'Work/Q3', favorite: true, tags: ['x'] })
    expect(meta?.lastOpenedAt).toBeGreaterThan(0)
    expect(second.folders()).toEqual(['Archive', 'Work', 'Work/Q3'])
    expect((await second.get('doc-1'))?.doc).toEqual(docWith('Kept'))
  })

  it('starts empty on a corrupt index rather than throwing', async () => {
    const storage = createMemoryStorage()
    await storage.set(INDEX_KEY, '{ this is not json')
    const store = await WorkspaceStore.open(storage)
    expect(store.list()).toEqual([])
    expect(store.folders()).toEqual([])
    // It is still usable.
    await expect(store.create({ doc: PLAIN })).resolves.toMatchObject({ title: 'Untitled' })
  })

  it('skips unusable index entries and keeps the rest', async () => {
    const storage = createMemoryStorage()
    await storage.set(
      INDEX_KEY,
      JSON.stringify({
        version: 1,
        documents: [{ id: 'good', title: 'Good' }, { title: 'no id' }, 'nonsense', null],
        folders: ['Work', '  ', 42],
      }),
    )
    const store = await WorkspaceStore.open(storage)
    expect(store.list().map((meta) => meta.id)).toEqual(['good'])
    expect(store.folders()).toEqual(['Work'])
  })

  it('tells subscribers after every committed change', async () => {
    const store = await open()
    const seen = vi.fn()
    const off = store.subscribe(seen)
    await store.create({ doc: PLAIN })
    expect(seen).toHaveBeenCalledTimes(1)
    expect(seen).toHaveBeenLastCalledWith(store)
    await store.rename('doc-1', 'Renamed')
    expect(seen).toHaveBeenCalledTimes(2)
    off()
    await store.remove('doc-1')
    expect(seen).toHaveBeenCalledTimes(2)
  })
})

describe('WorkspaceStore folders', () => {
  it('lists implicit parents of nested folders', async () => {
    const store = await open()
    await store.create({ doc: PLAIN, folder: 'Work/Q3/Notes' })
    expect(store.folders()).toEqual(['Work', 'Work/Q3', 'Work/Q3/Notes'])
  })

  it('creates an empty folder and ignores an empty name', async () => {
    const store = await open()
    expect(await store.createFolder(' Ideas ')).toBe('Ideas')
    expect(await store.createFolder('  ')).toBeNull()
    expect(store.folders()).toEqual(['Ideas'])
  })

  it('renames a folder, carrying its documents and subfolders', async () => {
    const store = await open()
    await store.create({ doc: PLAIN, folder: 'Work' })
    await store.create({ doc: PLAIN, folder: 'Work/Q3' })
    await store.createFolder('Work/Archive')
    expect(await store.renameFolder('Work', 'Office')).toBe('Office')
    expect(store.meta('doc-1')?.folder).toBe('Office')
    expect(store.meta('doc-2')?.folder).toBe('Office/Q3')
    expect(store.folders()).toEqual(['Office', 'Office/Archive', 'Office/Q3'])
  })

  it('re-parents a folder into another one', async () => {
    const store = await open()
    await store.create({ doc: PLAIN, folder: 'Q3' })
    expect(await store.renameFolder('Q3', 'Work/Q3')).toBe('Work/Q3')
    expect(store.meta('doc-1')?.folder).toBe('Work/Q3')
    expect(store.folders()).toEqual(['Work', 'Work/Q3'])
  })

  it('ignores a rename that changes nothing', async () => {
    const store = await open()
    await store.createFolder('Work')
    expect(await store.renameFolder('Work', 'Work')).toBe('Work')
    expect(await store.renameFolder('Work', '  ')).toBeNull()
    expect(store.folders()).toEqual(['Work'])
  })

  it('moves documents and subfolders up when a folder is deleted', async () => {
    const store = await open()
    await store.create({ doc: PLAIN, folder: 'Work/Q3' })
    await store.create({ doc: PLAIN, folder: 'Work/Q3/Notes' })
    await store.removeFolder('Work/Q3')
    expect(store.meta('doc-1')?.folder).toBe('Work')
    expect(store.meta('doc-2')?.folder).toBe('Work/Notes')
    expect(store.folders()).toEqual(['Work', 'Work/Notes'])
  })

  it('moves documents to the root when a top-level folder is deleted', async () => {
    const store = await open()
    await store.create({ doc: PLAIN, folder: 'Work' })
    await store.removeFolder(' Work ')
    expect(store.meta('doc-1')?.folder).toBeNull()
    expect(store.folders()).toEqual([])
    await expect(store.removeFolder('   ')).resolves.toBeUndefined()
  })
})

describe('WorkspaceStore views', () => {
  it('lists the documents that have been opened, most recent first', async () => {
    const store = await open()
    await store.create({ doc: docWith('A') })
    await store.create({ doc: docWith('B') })
    await store.create({ doc: docWith('C') })
    await store.touch('doc-2')
    await store.touch('doc-1')
    expect(store.recent().map((meta) => meta.id)).toEqual(['doc-1', 'doc-2'])
    expect(store.recent(1).map((meta) => meta.id)).toEqual(['doc-1'])
    expect(store.recent(0)).toEqual([])
  })

  it('lists favourites', async () => {
    const store = await open()
    await store.create({ doc: docWith('A') })
    await store.create({ doc: docWith('B') })
    await store.setFavorite('doc-2', true)
    expect(store.favorites().map((meta) => meta.id)).toEqual(['doc-2'])
    await store.setFavorite('doc-2', false)
    expect(store.favorites()).toEqual([])
  })

  it('searches titles, folders and tags for every word of the query', async () => {
    const store = await open()
    await store.create({ doc: docWith('Quarterly plan'), folder: 'Work' })
    await store.create({ doc: docWith('Holiday list'), tags: ['personal'] })
    expect(store.search('quarterly').map((meta) => meta.id)).toEqual(['doc-1'])
    expect(store.search('work plan').map((meta) => meta.id)).toEqual(['doc-1'])
    expect(store.search('PERSONAL').map((meta) => meta.id)).toEqual(['doc-2'])
    expect(store.search('plan holiday')).toEqual([])
    expect(store.search('   ')).toHaveLength(2)
  })
})

describe('WorkspaceStore export and import', () => {
  it('round-trips a workspace through a bundle', async () => {
    const source = await open()
    await source.create({ doc: docWith('Plan'), folder: 'Work/Q3', tags: ['team'] })
    await source.create({ doc: docWith('Ideas') })
    await source.setFavorite('doc-2', true)
    await source.createFolder('Archive')
    const bundle = await source.export()
    expect(bundle.version).toBe(1)
    expect(bundle.documents).toHaveLength(2)
    expect(bundle.folders).toEqual(['Archive', 'Work', 'Work/Q3'])

    const target = await open(createMemoryStorage())
    expect(await target.import(bundle)).toBe(2)
    expect(
      target
        .list()
        .map((meta) => meta.title)
        .sort(),
    ).toEqual(['Ideas', 'Plan'])
    expect(target.meta('doc-1')?.folder).toBe('Work/Q3')
    expect(target.meta('doc-2')?.favorite).toBe(true)
    expect(target.folders()).toEqual(['Archive', 'Work', 'Work/Q3'])
    expect((await target.get('doc-1'))?.doc).toEqual(docWith('Plan'))
  })

  it('updates in place when the same bundle is imported twice', async () => {
    const store = await open()
    await store.create({ doc: docWith('Plan') })
    const bundle = await store.export()
    expect(await store.import(bundle)).toBe(1)
    expect(store.list()).toHaveLength(1)
  })

  it('skips malformed entries and non-bundles', async () => {
    const store = await open()
    expect(await store.import(null)).toBe(0)
    expect(await store.import('nonsense')).toBe(0)
    expect(
      await store.import({
        documents: [
          { id: 'ok', title: 'Ok', doc: PLAIN },
          { id: 'no-body' },
          { title: 'no id', doc: PLAIN },
          { id: 'bad-body', doc: { content: [] } },
        ],
        folders: ['Work', 7],
      }),
    ).toBe(1)
    expect(store.list().map((meta) => meta.id)).toEqual(['ok'])
    expect(store.folders()).toEqual(['Work'])
  })
})
