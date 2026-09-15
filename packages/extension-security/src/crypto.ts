/**
 * Password protection for documents, built on WebCrypto alone. No bundled
 * cipher code to audit or keep current. PBKDF2-SHA256 stretches the password
 * into an AES-256-GCM key; GCM authenticates what it encrypts, so a wrong
 * password and a tampered file are both rejected instead of yielding garbage.
 *
 * The envelope is plain JSON: it can be saved as a file, put in a store or a
 * URL, and its title and expiry can be shown on a lock screen before anyone
 * types a password.
 */
import { UnsupportedEnvironmentError } from '@trevixal/core'

/** Serialized form of an encrypted document. Binary fields are base64 so the envelope survives JSON. */
export interface EncryptedEnvelope {
  readonly format: 'trevixal-encrypted'
  readonly version: 1
  readonly kdf: 'PBKDF2-SHA256'
  /** PBKDF2 rounds: slows down guessing attacks at the cost of unlock time. */
  readonly iterations: number
  /** 16 random bytes, base64. */
  readonly salt: string
  /** 12 random bytes (the GCM nonce), base64. */
  readonly iv: string
  readonly cipher: 'AES-GCM'
  /** Ciphertext followed by the GCM tag, base64. */
  readonly data: string
  /**
   * Epoch milliseconds after which the document refuses to open, or null for
   * never. Authenticated together with the ciphertext, so it cannot be edited
   * to extend a deadline.
   */
  readonly expiresAt: number | null
  /** Label for the lock screen. Readable without the password and NOT authenticated. */
  readonly title?: string
  readonly createdAt: number
}

export const ENVELOPE_FORMAT = 'trevixal-encrypted'
export const ENVELOPE_VERSION = 1
/** OWASP-grade default for PBKDF2-SHA256; roughly a quarter second on a laptop. */
export const DEFAULT_ITERATIONS = 310_000
/**
 * Ceiling on the PBKDF2 rounds an envelope may ask for. The count travels in
 * the envelope, so a hostile file could otherwise name a billion rounds and
 * wedge the tab for hours before failing. Ten million is roughly ten seconds
 * on a laptop, far above any honest setting, far below a denial of service.
 */
export const MAX_ITERATIONS = 10_000_000
const SALT_BYTES = 16
const IV_BYTES = 12

/**
 * The password did not unlock the envelope. AES-GCM cannot distinguish a wrong
 * password from an altered ciphertext, and a UI should not pretend to either.
 */
export class WrongPasswordError extends Error {
  constructor(message = 'Wrong password, or the encrypted document was altered') {
    super(message)
    this.name = 'WrongPasswordError'
  }
}

/** The password was right but the document's deadline has passed. */
export class DocumentExpiredError extends Error {
  readonly expiresAt: number
  constructor(expiresAt: number) {
    super(`This document expired on ${new Date(expiresAt).toISOString()}`)
    this.name = 'DocumentExpiredError'
    this.expiresAt = expiresAt
  }
}

export interface EncryptOptions {
  /** Epoch milliseconds; omit or pass null for a document that never expires. */
  readonly expiresAt?: number | null
  /** PBKDF2 rounds; defaults to {@link DEFAULT_ITERATIONS}. Lower it only in tests. */
  readonly iterations?: number
  /** Unauthenticated label stored beside the ciphertext for lock screens. */
  readonly title?: string
}

export interface DecryptOptions {
  /** Clock override for expiry checks (tests, or a server-supplied time). */
  readonly now?: number
  /** Open an expired document anyway: the result then reports `expired: true`. */
  readonly ignoreExpiry?: boolean
}

export interface DecryptedDocument<T> {
  readonly payload: T
  readonly expiresAt: number | null
  /** True only when `ignoreExpiry` let an out-of-date document through. */
  readonly expired: boolean
}

/** Parameters for {@link encryptWithKey}: the salt and rounds the key was derived with. */
export interface EncryptWithKeyParams {
  readonly salt: Uint8Array<ArrayBuffer>
  readonly iterations: number
  readonly expiresAt?: number | null
  readonly title?: string
}

function subtle(): SubtleCrypto {
  const api = (globalThis as { crypto?: Crypto }).crypto?.subtle
  if (!api)
    throw new UnsupportedEnvironmentError(
      'WebCrypto (crypto.subtle) is not available in this environment',
    )
  return api
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const api = (globalThis as { crypto?: Crypto }).crypto
  if (!api)
    throw new UnsupportedEnvironmentError(
      'WebCrypto (crypto.getRandomValues) is not available in this environment',
    )
  return api.getRandomValues(new Uint8Array(length))
}

function utf8(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text)
}

/**
 * Bytes mixed into the GCM authentication tag but not encrypted. Anything
 * listed here is tamper-evident: change `expiresAt` in the JSON and decryption
 * fails as if the password were wrong.
 */
function associatedData(expiresAt: number | null): Uint8Array<ArrayBuffer> {
  return utf8(`${ENVELOPE_FORMAT}|${ENVELOPE_VERSION}|${expiresAt ?? 'never'}`)
}

function decodeField(
  envelope: EncryptedEnvelope,
  field: 'salt' | 'iv' | 'data',
): Uint8Array<ArrayBuffer> {
  try {
    return fromBase64(envelope[field])
  } catch {
    throw new TypeError(`Corrupt encrypted envelope: "${field}" is not valid base64`)
  }
}

function assertEnvelope(value: unknown): asserts value is EncryptedEnvelope {
  if (!isEncryptedEnvelope(value)) throw new TypeError('Not a Trevixal encrypted envelope')
}

/**
 * Stretch a password into a non-extractable AES-256-GCM key. Exposed so a lock
 * screen (or {@link createEncryptedStorage}) can derive once and reuse the key
 * for many envelopes that share a salt, instead of paying for PBKDF2 each time.
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number = DEFAULT_ITERATIONS,
): Promise<CryptoKey> {
  if (!password) throw new TypeError('A password is required')
  if (!Number.isInteger(iterations) || iterations <= 0 || iterations > MAX_ITERATIONS) {
    throw new TypeError(`iterations must be an integer between 1 and ${MAX_ITERATIONS}`)
  }
  const api = subtle()
  const material = await api.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveKey'])
  return api.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Encrypt any JSON value (typically a `DocJSON`) under a password. Each call
 * draws a fresh salt and nonce, so encrypting the same document twice yields
 * unrelated ciphertexts.
 */
export async function encryptDocument(
  payload: unknown,
  password: string,
  options: EncryptOptions = {},
): Promise<EncryptedEnvelope> {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS
  const salt = randomBytes(SALT_BYTES)
  const key = await deriveKey(password, salt, iterations)
  return encryptWithKey(key, payload, {
    salt,
    iterations,
    expiresAt: options.expiresAt,
    title: options.title,
  })
}

/**
 * Encrypt with an already-derived key. The salt and rounds are recorded in the
 * envelope so that {@link decryptDocument} can rebuild the same key later.
 */
export async function encryptWithKey(
  key: CryptoKey,
  payload: unknown,
  params: EncryptWithKeyParams,
): Promise<EncryptedEnvelope> {
  const json = JSON.stringify(payload)
  if (typeof json !== 'string') throw new TypeError('Payload must be JSON-serializable')
  const expiresAt = params.expiresAt ?? null
  const iv = randomBytes(IV_BYTES)
  const data = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: associatedData(expiresAt) },
    key,
    utf8(json),
  )
  const envelope: EncryptedEnvelope = {
    format: ENVELOPE_FORMAT,
    version: ENVELOPE_VERSION,
    kdf: 'PBKDF2-SHA256',
    iterations: params.iterations,
    salt: toBase64(params.salt),
    iv: toBase64(iv),
    cipher: 'AES-GCM',
    data: toBase64(new Uint8Array(data)),
    expiresAt,
    createdAt: Date.now(),
  }
  return params.title === undefined ? envelope : { ...envelope, title: params.title }
}

/**
 * Unlock an envelope. Throws {@link WrongPasswordError} when the password (or
 * the ciphertext) is wrong and {@link DocumentExpiredError} once `expiresAt`
 * has passed. The expiry check runs after authentication, so only a genuine
 * deadline produces the "expired" message.
 */
export async function decryptDocument<T = unknown>(
  envelope: EncryptedEnvelope,
  password: string,
  options: DecryptOptions = {},
): Promise<DecryptedDocument<T>> {
  assertEnvelope(envelope)
  // encryptDocument never accepts an empty password, so none can be right.
  if (!password) throw new WrongPasswordError()
  const key = await deriveKey(password, decodeField(envelope, 'salt'), envelope.iterations)
  return decryptWithKey<T>(key, envelope, options)
}

/**
 * Decrypt with a key from {@link deriveKey}; the key must have been derived
 * with the envelope's own salt and iteration count.
 */
export async function decryptWithKey<T = unknown>(
  key: CryptoKey,
  envelope: EncryptedEnvelope,
  options: DecryptOptions = {},
): Promise<DecryptedDocument<T>> {
  assertEnvelope(envelope)
  const iv = decodeField(envelope, 'iv')
  const data = decodeField(envelope, 'data')
  let plaintext: ArrayBuffer
  try {
    plaintext = await subtle().decrypt(
      { name: 'AES-GCM', iv, additionalData: associatedData(envelope.expiresAt) },
      key,
      data,
    )
  } catch {
    throw new WrongPasswordError()
  }
  const expiresAt = envelope.expiresAt
  const expired = isExpired(expiresAt, options.now)
  if (expired && expiresAt !== null && !options.ignoreExpiry) {
    throw new DocumentExpiredError(expiresAt)
  }
  const payload = JSON.parse(new TextDecoder().decode(plaintext)) as T
  return { payload, expiresAt, expired }
}

/** Structural check for data read from a file, a URL or a store. */
export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    candidate.format === ENVELOPE_FORMAT &&
    candidate.version === ENVELOPE_VERSION &&
    candidate.kdf === 'PBKDF2-SHA256' &&
    candidate.cipher === 'AES-GCM' &&
    typeof candidate.iterations === 'number' &&
    Number.isInteger(candidate.iterations) &&
    candidate.iterations > 0 &&
    // A count above the ceiling is not a document we can afford to open.
    candidate.iterations <= MAX_ITERATIONS &&
    typeof candidate.salt === 'string' &&
    typeof candidate.iv === 'string' &&
    typeof candidate.data === 'string' &&
    (candidate.expiresAt === null || typeof candidate.expiresAt === 'number') &&
    typeof candidate.createdAt === 'number' &&
    (candidate.title === undefined || typeof candidate.title === 'string')
  )
}

/** Pretty JSON: the envelope is what users save as a `.json` file, so keep it readable. */
export function serializeEnvelope(envelope: EncryptedEnvelope): string {
  return JSON.stringify(envelope, null, 2)
}

/** Inverse of {@link serializeEnvelope}; null for anything that is not an envelope. */
export function parseEnvelope(text: string): EncryptedEnvelope | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  return isEncryptedEnvelope(parsed) ? parsed : null
}

/** Whether a deadline has passed; null means the document never expires. */
export function isExpired(expiresAt: number | null, now: number = Date.now()): boolean {
  return expiresAt !== null && expiresAt <= now
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const MONTH = 30 * DAY
const YEAR = 365 * DAY
/**
 * The ladder, largest unit first. `perNext` is how many of a unit a reader
 * hears as one of the unit above it: twelve months to a year, sixty minutes to
 * an hour.
 *
 * The sizes are approximations and so do not nest exactly, twelve 30-day
 * months fall five days short of a 365-day year. Left alone, a span of 364
 * days would be worded "in 12 months", which a reader takes as a full year: a
 * deadline stated as later than it is. Capping each count at `perNext - 1`
 * keeps the wording inside the unit the span has actually reached.
 */
const UNITS: readonly (readonly [size: number, name: string, perNext: number])[] = [
  [YEAR, 'year', Number.POSITIVE_INFINITY],
  [MONTH, 'month', 12],
  [DAY, 'day', 30],
  [HOUR, 'hour', 24],
  [MINUTE, 'minute', 60],
]

/**
 * Human wording for a deadline: 'never', 'expired', or 'in 3 days', so the
 * lock screen and share dialog phrase expiry the same way.
 */
export function describeExpiry(expiresAt: number | null, now: number = Date.now()): string {
  if (expiresAt === null) return 'never'
  const remaining = expiresAt - now
  if (remaining <= 0) return 'expired'
  for (const [size, name, perNext] of UNITS) {
    if (remaining < size) continue
    // Floor, never round: a deadline shown as later than it is sends the
    // reader back after the document has already stopped opening. The cap
    // guards the same promise where the units do not nest exactly.
    const count = Math.min(Math.floor(remaining / size), perNext - 1)
    return `in ${count} ${name}${count === 1 ? '' : 's'}`
  }
  return 'in less than a minute'
}

// ---------------------------------------------------------------- base64

const CHUNK = 0x8000

/** Standard base64 of raw bytes; chunked so large documents do not blow the argument limit. */
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK))
  }
  return btoa(binary)
}

/** Inverse of {@link toBase64}. Throws on malformed input, as `atob` does. */
export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/** URL-safe base64 (RFC 4648 §5, unpadded), survives a URL fragment untouched. */
export function toBase64URL(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Inverse of {@link toBase64URL}; accepts padded or unpadded input. */
export function fromBase64URL(text: string): Uint8Array<ArrayBuffer> {
  const standard = text.replace(/-/g, '+').replace(/_/g, '/')
  const padding = (4 - (standard.length % 4)) % 4
  return fromBase64(`${standard}${'='.repeat(padding)}`)
}
