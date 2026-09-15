import { describe, expect, it, vi } from 'vitest'
import {
  type KeyValueStorage,
  WrongPasswordError,
  createEncryptedStorage,
  createMemoryStorage,
  createWebStorage,
  parseEnvelope,
} from '../src'

/** Minimal `Storage` implementation with the same enumeration semantics as localStorage. */
function storageShim(): Storage {
  const map = new Map<string, string>()
  const shim = {
    get length() {
      return map.size
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value))
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
    clear: () => map.clear(),
  }
  return shim as unknown as Storage
}

const FAST = { iterations: 1_000 }

describe('createMemoryStorage', () => {
  it('stores, reads and removes values', async () => {
    const store = createMemoryStorage()
    expect(await store.get('a')).toBeNull()
    await store.set('a', '1')
    expect(await store.get('a')).toBe('1')
    await store.remove('a')
    expect(await store.get('a')).toBeNull()
  })

  it('lists keys, optionally filtered by prefix', async () => {
    const store = createMemoryStorage()
    await store.set('doc:1', 'x')
    await store.set('doc:2', 'y')
    await store.set('settings', 'z')
    expect([...(await store.keys())].sort()).toEqual(['doc:1', 'doc:2', 'settings'])
    expect([...(await store.keys('doc:'))].sort()).toEqual(['doc:1', 'doc:2'])
  })

  it('keeps instances independent', async () => {
    const a = createMemoryStorage()
    const b = createMemoryStorage()
    await a.set('k', 'v')
    expect(await b.get('k')).toBeNull()
  })
})

describe('createWebStorage', () => {
  it('prefixes keys in the underlying Storage and reads them back', async () => {
    const raw = storageShim()
    const store = createWebStorage(raw)
    await store.set('doc', 'body')
    expect(raw.getItem('trevixal:doc')).toBe('body')
    expect(await store.get('doc')).toBe('body')
    await store.remove('doc')
    expect(raw.getItem('trevixal:doc')).toBeNull()
    expect(await store.get('doc')).toBeNull()
  })

  it('keys() strips the prefix and ignores the host page entries', async () => {
    const raw = storageShim()
    raw.setItem('host-app-token', 'secret')
    const store = createWebStorage(raw)
    await store.set('doc:1', 'a')
    await store.set('draft', 'b')
    expect([...(await store.keys())].sort()).toEqual(['doc:1', 'draft'])
    expect(await store.keys('doc:')).toEqual(['doc:1'])
  })

  it('honours a custom prefix', async () => {
    const raw = storageShim()
    const store = createWebStorage(raw, 'app/')
    await store.set('x', '1')
    expect(raw.getItem('app/x')).toBe('1')
    expect(await store.keys()).toEqual(['x'])
  })
})

describe('createEncryptedStorage', () => {
  it('encrypts values on the way in and decrypts on the way out', async () => {
    const inner = createMemoryStorage()
    const store = createEncryptedStorage(inner, 'pw', FAST)
    await store.set('doc', '{"type":"doc"}')
    const stored = await inner.get('doc')
    expect(stored).not.toBeNull()
    expect(stored).not.toContain('"type":"doc"')
    const envelope = parseEnvelope(stored as string)
    expect(envelope).not.toBeNull()
    expect(envelope?.iterations).toBe(1_000)
    expect(await store.get('doc')).toBe('{"type":"doc"}')
    expect(await store.get('missing')).toBeNull()
  })

  it('passes plaintext (non-envelope) values through untouched', async () => {
    const inner = createMemoryStorage()
    await inner.set('legacy', 'plain text')
    await inner.set('json', '{"format":"other"}')
    const store = createEncryptedStorage(inner, 'pw', FAST)
    expect(await store.get('legacy')).toBe('plain text')
    expect(await store.get('json')).toBe('{"format":"other"}')
  })

  it('rejects reads under the wrong password', async () => {
    const inner = createMemoryStorage()
    await createEncryptedStorage(inner, 'right', FAST).set('doc', 'secret')
    await expect(createEncryptedStorage(inner, 'wrong', FAST).get('doc')).rejects.toBeInstanceOf(
      WrongPasswordError,
    )
  })

  it('shares one salt per instance and a fresh nonce per value', async () => {
    const inner = createMemoryStorage()
    const store = createEncryptedStorage(inner, 'pw', FAST)
    await store.set('a', '1')
    await store.set('b', '2')
    const first = parseEnvelope((await inner.get('a')) as string)
    const second = parseEnvelope((await inner.get('b')) as string)
    expect(first?.salt).toBe(second?.salt)
    expect(first?.iv).not.toBe(second?.iv)
    expect(first?.data).not.toBe(second?.data)
  })

  it('reads values written by another instance with its own salt', async () => {
    const inner = createMemoryStorage()
    await createEncryptedStorage(inner, 'pw', FAST).set('a', 'from A')
    const other = createEncryptedStorage(inner, 'pw', FAST)
    await other.set('b', 'from B')
    expect(await other.get('a')).toBe('from A')
    expect(await other.get('b')).toBe('from B')
  })

  it('accepts a password provider and asks it lazily', async () => {
    const inner = createMemoryStorage()
    const ask = vi.fn(async () => 'pw')
    const store = createEncryptedStorage(inner, ask, FAST)
    expect(ask).not.toHaveBeenCalled()
    await store.set('doc', 'v')
    expect(ask).toHaveBeenCalled()
    expect(await store.get('doc')).toBe('v')
  })

  it('delegates remove() and keys() to the inner store', async () => {
    const inner: KeyValueStorage = createMemoryStorage()
    const store = createEncryptedStorage(inner, 'pw', FAST)
    await store.set('doc:1', 'a')
    await store.set('note', 'b')
    expect([...(await store.keys())].sort()).toEqual(['doc:1', 'note'])
    expect(await store.keys('doc:')).toEqual(['doc:1'])
    await store.remove('doc:1')
    expect(await inner.get('doc:1')).toBeNull()
    expect(await store.keys()).toEqual(['note'])
  })

  it('composes with web storage', async () => {
    const raw = storageShim()
    const store = createEncryptedStorage(createWebStorage(raw), 'pw', FAST)
    await store.set('doc', 'hello')
    expect(raw.getItem('trevixal:doc')).toContain('trevixal-encrypted')
    expect(await store.get('doc')).toBe('hello')
  })
})
