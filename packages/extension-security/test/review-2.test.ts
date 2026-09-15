// Regression tests from the second-pass review of @trevixal/extension-security.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ITERATIONS,
  type EncryptedEnvelope,
  MAX_ITERATIONS,
  decryptDocument,
  deriveKey,
  describeExpiry,
  encryptDocument,
  isEncryptedEnvelope,
  parseEnvelope,
  serializeEnvelope,
} from '../src/crypto'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const MONTH = 30 * DAY
const YEAR = 365 * DAY

/** A structurally valid envelope with the given iteration count. */
function envelopeWith(iterations: number): Record<string, unknown> {
  return {
    format: 'trevixal-encrypted',
    version: 1,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
    iv: 'AAAAAAAAAAAAAAAA',
    cipher: 'AES-GCM',
    data: 'AAAA',
    expiresAt: null,
    createdAt: 0,
  }
}

describe('PBKDF2 iteration bounds (untrusted envelopes)', () => {
  it('rejects an envelope whose iteration count would hang the tab', () => {
    // A hostile .json file can name any round count; without a ceiling,
    // decryptDocument would sit in PBKDF2 for hours before failing.
    expect(isEncryptedEnvelope(envelopeWith(1e12))).toBe(false)
    expect(parseEnvelope(JSON.stringify(envelopeWith(1e12)))).toBeNull()
    expect(isEncryptedEnvelope(envelopeWith(MAX_ITERATIONS + 1))).toBe(false)
  })

  it('still accepts sane counts, including the default and the ceiling', () => {
    expect(isEncryptedEnvelope(envelopeWith(1_000))).toBe(true)
    expect(isEncryptedEnvelope(envelopeWith(DEFAULT_ITERATIONS))).toBe(true)
    expect(isEncryptedEnvelope(envelopeWith(MAX_ITERATIONS))).toBe(true)
    expect(MAX_ITERATIONS).toBeGreaterThan(DEFAULT_ITERATIONS)
  })

  it('deriveKey refuses an out-of-range round count instead of grinding', async () => {
    const salt = new Uint8Array(16)
    await expect(deriveKey('pw', salt, MAX_ITERATIONS + 1)).rejects.toBeInstanceOf(TypeError)
  })

  it('decryptDocument refuses a tampered envelope before touching PBKDF2', async () => {
    const envelope = await encryptDocument({ a: 1 }, 'pw', { iterations: 1_000 })
    const inflated = { ...envelope, iterations: 5_000_000_000 } as unknown as EncryptedEnvelope
    await expect(decryptDocument(inflated, 'pw')).rejects.toBeInstanceOf(TypeError)
  })

  it('a round-tripped envelope survives serialize/parse unchanged', async () => {
    const envelope = await encryptDocument({ a: 1 }, 'pw', { iterations: 1_000 })
    expect(parseEnvelope(serializeEnvelope(envelope))).toEqual(envelope)
  })
})

describe('describeExpiry never overstates a deadline', () => {
  const now = 1_700_000_000_000

  it('rounds a remaining span down, not to the nearest unit', () => {
    // 1.9 days left must not read "in 2 days": a deadline shown as later than
    // it is invites the reader to come back after the document has died.
    expect(describeExpiry(now + 2 * DAY - 1, now)).toBe('in 1 day')
    expect(describeExpiry(now + 45 * DAY, now)).toBe('in 1 month')
    expect(describeExpiry(now + 364 * DAY, now)).toBe('in 11 months')
    expect(describeExpiry(now + 119 * MINUTE, now)).toBe('in 1 hour')
  })

  it('still names exact spans and keeps the singular/plural right', () => {
    expect(describeExpiry(now + MINUTE, now)).toBe('in 1 minute')
    expect(describeExpiry(now + 2 * MINUTE, now)).toBe('in 2 minutes')
    expect(describeExpiry(now + HOUR, now)).toBe('in 1 hour')
    expect(describeExpiry(now + DAY, now)).toBe('in 1 day')
    expect(describeExpiry(now + MONTH, now)).toBe('in 1 month')
    expect(describeExpiry(now + YEAR, now)).toBe('in 1 year')
    expect(describeExpiry(now + 2 * YEAR, now)).toBe('in 2 years')
  })

  it('keeps its boundary wording', () => {
    expect(describeExpiry(null, now)).toBe('never')
    expect(describeExpiry(now, now)).toBe('expired')
    expect(describeExpiry(now - 1, now)).toBe('expired')
    expect(describeExpiry(now + 1, now)).toBe('in less than a minute')
    expect(describeExpiry(now + MINUTE - 1, now)).toBe('in less than a minute')
  })
})
