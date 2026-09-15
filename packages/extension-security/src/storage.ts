/**
 * Key/value persistence with an encryption wrapper. The interface is the one
 * every Trevixal package shares (copied, not imported, packages stay
 * independent), so an encrypted store drops in wherever a plain one is used.
 */
import { UnsupportedEnvironmentError } from '@trevixal/core'

import {
  DEFAULT_ITERATIONS,
  decryptWithKey,
  deriveKey,
  encryptWithKey,
  fromBase64,
  parseEnvelope,
  toBase64,
} from './crypto'

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

export interface EncryptedStorageOptions {
  /** PBKDF2 rounds for values written by this instance; defaults to {@link DEFAULT_ITERATIONS}. */
  readonly iterations?: number
}

function randomSalt(): Uint8Array<ArrayBuffer> {
  const api = (globalThis as { crypto?: Crypto }).crypto
  if (!api)
    throw new UnsupportedEnvironmentError(
      'WebCrypto (crypto.getRandomValues) is not available in this environment',
    )
  return api.getRandomValues(new Uint8Array(16))
}

/**
 * Encrypt values on the way into any {@link KeyValueStorage}. Keys stay in the
 * clear (they are addresses, not content); values become encrypted envelopes.
 * A value that is not an envelope is returned as-is, so an existing plaintext
 * store can be wrapped and migrated on the next write of each entry.
 *
 * PBKDF2 is the expensive part, so each instance writes under a single salt
 * and caches the derived key per salt; a burst of autosaves costs one
 * derivation, and values written by another instance (another salt) are
 * derived once each on first read.
 */
export function createEncryptedStorage(
  inner: KeyValueStorage,
  password: string | (() => Promise<string>),
  options: EncryptedStorageOptions = {},
): KeyValueStorage {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS
  const writeSalt = randomSalt()
  const writeSaltText = toBase64(writeSalt)
  const keys = new Map<string, Promise<CryptoKey>>()
  let currentPassword: string | null = null

  async function resolvePassword(): Promise<string> {
    const value = typeof password === 'string' ? password : await password()
    if (value !== currentPassword) {
      keys.clear()
      currentPassword = value
    }
    return value
  }

  async function keyFor(
    salt: Uint8Array<ArrayBuffer>,
    saltText: string,
    rounds: number,
  ): Promise<CryptoKey> {
    const resolved = await resolvePassword()
    const cacheKey = `${rounds}:${saltText}`
    const cached = keys.get(cacheKey)
    if (cached) return cached
    const pending = deriveKey(resolved, salt, rounds)
    keys.set(cacheKey, pending)
    pending.catch(() => keys.delete(cacheKey))
    return pending
  }

  return {
    async get(key) {
      const raw = await inner.get(key)
      if (raw === null) return null
      const envelope = parseEnvelope(raw)
      if (!envelope) return raw
      const cryptoKey = await keyFor(fromBase64(envelope.salt), envelope.salt, envelope.iterations)
      const { payload } = await decryptWithKey<string>(cryptoKey, envelope, { ignoreExpiry: true })
      return payload
    },
    async set(key, value) {
      const cryptoKey = await keyFor(writeSalt, writeSaltText, iterations)
      const envelope = await encryptWithKey(cryptoKey, value, { salt: writeSalt, iterations })
      await inner.set(key, JSON.stringify(envelope))
    },
    remove(key) {
      return inner.remove(key)
    },
    keys(prefix) {
      return inner.keys(prefix)
    },
  }
}
