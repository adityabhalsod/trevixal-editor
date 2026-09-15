import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ITERATIONS,
  DocumentExpiredError,
  type EncryptedEnvelope,
  WrongPasswordError,
  decryptDocument,
  decryptWithKey,
  deriveKey,
  describeExpiry,
  encryptDocument,
  encryptWithKey,
  fromBase64,
  fromBase64URL,
  isEncryptedEnvelope,
  isExpired,
  parseEnvelope,
  serializeEnvelope,
  toBase64,
  toBase64URL,
} from '../src'

/** Few rounds: PBKDF2 cost is irrelevant to correctness and the default would slow every test. */
const FAST = { iterations: 1_000 }
const DOC = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Héllo — 世界 🔒' }] }],
}
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const MONTH = 30 * DAY
const YEAR = 365 * DAY

describe('encryptDocument / decryptDocument', () => {
  it('round-trips a JSON payload under a password', async () => {
    const envelope = await encryptDocument(DOC, 'correct horse', FAST)
    const result = await decryptDocument<typeof DOC>(envelope, 'correct horse')
    expect(result.payload).toEqual(DOC)
    expect(result.expiresAt).toBeNull()
    expect(result.expired).toBe(false)
  })

  it('produces an envelope with the documented shape and sizes', async () => {
    const envelope = await encryptDocument(DOC, 'pw', { ...FAST, title: 'Quarterly plan' })
    expect(envelope.format).toBe('trevixal-encrypted')
    expect(envelope.version).toBe(1)
    expect(envelope.kdf).toBe('PBKDF2-SHA256')
    expect(envelope.cipher).toBe('AES-GCM')
    expect(envelope.iterations).toBe(1_000)
    expect(fromBase64(envelope.salt)).toHaveLength(16)
    expect(fromBase64(envelope.iv)).toHaveLength(12)
    expect(envelope.data.length).toBeGreaterThan(0)
    expect(envelope.expiresAt).toBeNull()
    expect(envelope.title).toBe('Quarterly plan')
    expect(typeof envelope.createdAt).toBe('number')
    expect(isEncryptedEnvelope(envelope)).toBe(true)
  })

  it('defaults to 310000 PBKDF2 rounds and omits title when none is given', async () => {
    expect(DEFAULT_ITERATIONS).toBe(310_000)
    const envelope = await encryptDocument({ a: 1 }, 'pw')
    expect(envelope.iterations).toBe(310_000)
    expect('title' in envelope).toBe(false)
    expect((await decryptDocument(envelope, 'pw')).payload).toEqual({ a: 1 })
  })

  it('draws a fresh salt and nonce on every call', async () => {
    const first = await encryptDocument(DOC, 'pw', FAST)
    const second = await encryptDocument(DOC, 'pw', FAST)
    expect(first.salt).not.toBe(second.salt)
    expect(first.iv).not.toBe(second.iv)
    expect(first.data).not.toBe(second.data)
  })

  it('rejects a wrong password with WrongPasswordError', async () => {
    const envelope = await encryptDocument(DOC, 'right', FAST)
    await expect(decryptDocument(envelope, 'wrong')).rejects.toBeInstanceOf(WrongPasswordError)
  })

  it('rejects an empty password on both sides', async () => {
    await expect(encryptDocument(DOC, '', FAST)).rejects.toBeInstanceOf(TypeError)
    const envelope = await encryptDocument(DOC, 'pw', FAST)
    await expect(decryptDocument(envelope, '')).rejects.toBeInstanceOf(WrongPasswordError)
  })

  it('rejects tampered ciphertext as a wrong password', async () => {
    const envelope = await encryptDocument(DOC, 'pw', FAST)
    const bytes = fromBase64(envelope.data)
    bytes[0] ^= 0xff
    const tampered: EncryptedEnvelope = { ...envelope, data: toBase64(bytes) }
    await expect(decryptDocument(tampered, 'pw')).rejects.toBeInstanceOf(WrongPasswordError)
  })

  it('rejects an edited expiresAt because it is bound as additional data', async () => {
    const soon = Date.now() + DAY
    const envelope = await encryptDocument(DOC, 'pw', { ...FAST, expiresAt: soon })
    const extended: EncryptedEnvelope = { ...envelope, expiresAt: soon + 30 * DAY }
    await expect(decryptDocument(extended, 'pw')).rejects.toBeInstanceOf(WrongPasswordError)
    const cleared: EncryptedEnvelope = { ...envelope, expiresAt: null }
    await expect(decryptDocument(cleared, 'pw')).rejects.toBeInstanceOf(WrongPasswordError)
  })

  it('throws DocumentExpiredError once the deadline has passed', async () => {
    const expiresAt = 1_700_000_000_000
    const envelope = await encryptDocument(DOC, 'pw', { ...FAST, expiresAt })
    const failure = await decryptDocument(envelope, 'pw', { now: expiresAt + 1 }).catch((e) => e)
    expect(failure).toBeInstanceOf(DocumentExpiredError)
    expect((failure as DocumentExpiredError).expiresAt).toBe(expiresAt)
  })

  it('checks the password before the deadline, so a wrong password never reads as expired', async () => {
    const envelope = await encryptDocument(DOC, 'pw', { ...FAST, expiresAt: 1 })
    await expect(decryptDocument(envelope, 'nope', { now: 2 })).rejects.toBeInstanceOf(
      WrongPasswordError,
    )
  })

  it('opens before the deadline and reports it', async () => {
    const expiresAt = 1_700_000_000_000
    const envelope = await encryptDocument(DOC, 'pw', { ...FAST, expiresAt })
    const result = await decryptDocument(envelope, 'pw', { now: expiresAt - 1 })
    expect(result.payload).toEqual(DOC)
    expect(result.expiresAt).toBe(expiresAt)
    expect(result.expired).toBe(false)
  })

  it('opens an expired document with ignoreExpiry and flags it', async () => {
    const expiresAt = 1_700_000_000_000
    const envelope = await encryptDocument(DOC, 'pw', { ...FAST, expiresAt })
    const result = await decryptDocument(envelope, 'pw', { now: expiresAt, ignoreExpiry: true })
    expect(result.payload).toEqual(DOC)
    expect(result.expired).toBe(true)
  })

  it('rejects something that is not an envelope', async () => {
    await expect(
      decryptDocument({ format: 'other' } as unknown as EncryptedEnvelope, 'pw'),
    ).rejects.toBeInstanceOf(TypeError)
  })

  it('reuses a derived key across encryptWithKey / decryptWithKey', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const key = await deriveKey('pw', salt, 1_000)
    const a = await encryptWithKey(key, 'first', { salt, iterations: 1_000 })
    const b = await encryptWithKey(key, 'second', { salt, iterations: 1_000 })
    expect(a.salt).toBe(b.salt)
    expect(a.iv).not.toBe(b.iv)
    expect((await decryptWithKey<string>(key, a)).payload).toBe('first')
    expect((await decryptDocument<string>(b, 'pw')).payload).toBe('second')
  })
})

describe('envelope serialization and guard', () => {
  it('serializes to readable JSON and parses back to an equal envelope', async () => {
    const envelope = await encryptDocument(DOC, 'pw', { ...FAST, title: 'T', expiresAt: 5 })
    const text = serializeEnvelope(envelope)
    expect(text).toContain('\n')
    expect(parseEnvelope(text)).toEqual(envelope)
  })

  it('parseEnvelope returns null for junk and for JSON of the wrong shape', () => {
    expect(parseEnvelope('not json')).toBeNull()
    expect(parseEnvelope('{"format":"trevixal-encrypted"}')).toBeNull()
    expect(parseEnvelope('"a string"')).toBeNull()
    expect(parseEnvelope('null')).toBeNull()
  })

  it('isEncryptedEnvelope rejects missing or mistyped fields', async () => {
    const envelope = await encryptDocument(DOC, 'pw', FAST)
    const drop = (field: keyof EncryptedEnvelope) => {
      const copy: Record<string, unknown> = { ...envelope }
      delete copy[field]
      return copy
    }
    expect(isEncryptedEnvelope(null)).toBe(false)
    expect(isEncryptedEnvelope('x')).toBe(false)
    expect(isEncryptedEnvelope(drop('salt'))).toBe(false)
    expect(isEncryptedEnvelope(drop('data'))).toBe(false)
    expect(isEncryptedEnvelope(drop('expiresAt'))).toBe(false)
    expect(isEncryptedEnvelope({ ...envelope, version: 2 })).toBe(false)
    expect(isEncryptedEnvelope({ ...envelope, iterations: 0 })).toBe(false)
    expect(isEncryptedEnvelope({ ...envelope, title: 3 })).toBe(false)
    expect(isEncryptedEnvelope({ ...envelope, expiresAt: '5' })).toBe(false)
  })
})

describe('expiry helpers', () => {
  it('isExpired treats null as never and the deadline itself as expired', () => {
    expect(isExpired(null)).toBe(false)
    expect(isExpired(1_000, 999)).toBe(false)
    expect(isExpired(1_000, 1_000)).toBe(true)
    expect(isExpired(1_000, 1_001)).toBe(true)
  })

  it('describeExpiry words the remaining time', () => {
    const now = 1_700_000_000_000
    expect(describeExpiry(null, now)).toBe('never')
    expect(describeExpiry(now - 1, now)).toBe('expired')
    expect(describeExpiry(now, now)).toBe('expired')
    expect(describeExpiry(now + 3 * DAY, now)).toBe('in 3 days')
    expect(describeExpiry(now + DAY, now)).toBe('in 1 day')
    expect(describeExpiry(now + 2 * 60 * 60 * 1000, now)).toBe('in 2 hours')
    expect(describeExpiry(now + 5 * 60 * 1000, now)).toBe('in 5 minutes')
    expect(describeExpiry(now + 30 * 1000, now)).toBe('in less than a minute')
    // 45 days is a month and a half; wording it "in 2 months" would promise
    // access the document does not have. The count is floored, never rounded.
    expect(describeExpiry(now + 45 * DAY, now)).toBe('in 1 month')
    expect(describeExpiry(now + 2 * 365 * DAY, now)).toBe('in 2 years')
  })

  it('describeExpiry names each unit boundary exactly', () => {
    const now = 1_700_000_000_000
    expect(describeExpiry(now + MINUTE, now)).toBe('in 1 minute')
    expect(describeExpiry(now + HOUR, now)).toBe('in 1 hour')
    expect(describeExpiry(now + DAY, now)).toBe('in 1 day')
    expect(describeExpiry(now + MONTH, now)).toBe('in 1 month')
    expect(describeExpiry(now + YEAR, now)).toBe('in 1 year')
  })

  it('describeExpiry steps down a unit one millisecond below each boundary', () => {
    const now = 1_700_000_000_000
    expect(describeExpiry(now + MINUTE - 1, now)).toBe('in less than a minute')
    expect(describeExpiry(now + HOUR - 1, now)).toBe('in 59 minutes')
    expect(describeExpiry(now + DAY - 1, now)).toBe('in 23 hours')
    expect(describeExpiry(now + MONTH - 1, now)).toBe('in 29 days')
    // Twelve 30-day months fall short of a 365-day year, so the last sliver of
    // the year must still read as months, and as 11, since "12 months" is a
    // year to anyone reading it.
    expect(describeExpiry(now + YEAR - 1, now)).toBe('in 11 months')
  })

  it('describeExpiry caps the month count at the first span that would read as a year', () => {
    const now = 1_700_000_000_000
    // 12 * MONTH is 360 days: the lowest span whose unfloored count is 12, and
    // so the exact point the cap has to start binding. Below it the count is
    // naturally under twelve; from here to YEAR the cap is the only thing
    // keeping the wording out of the next unit.
    expect(describeExpiry(now + 12 * MONTH - 1, now)).toBe('in 11 months')
    expect(describeExpiry(now + 12 * MONTH, now)).toBe('in 11 months')
    expect(describeExpiry(now + 12 * MONTH + 1, now)).toBe('in 11 months')
  })

  // Reviewer-added: locks both halves of the promise generically, so a
  // regression at any rung fails even if the specific boundary cases above
  // are edited. (a) the named span never exceeds the time actually left, and
  // (b) the count never reaches the next unit up -- "in 12 months" is heard as
  // a year, which is the overstatement the cap exists to prevent.
  it('describeExpiry never names a count that reads as the next unit up', () => {
    const now = 1_700_000_000_000
    const SIZE: Record<string, number> = {
      minute: MINUTE,
      hour: HOUR,
      day: DAY,
      month: MONTH,
      year: YEAR,
    }
    // How many of a unit a reader hears as one of the unit above, stated
    // independently of the module's own (non-nesting) unit sizes.
    const READS_AS_NEXT: Record<string, number> = { minute: 60, hour: 24, day: 30, month: 12 }
    const bad: string[] = []
    for (let minutes = 1; minutes <= 800 * 24 * 60; minutes += 13) {
      const remaining = minutes * MINUTE
      const worded = describeExpiry(now + remaining, now)
      const match = /^in (\d+) (minute|hour|day|month|year)s?$/.exec(worded)
      if (!match) {
        if (worded !== 'in less than a minute') bad.push(`${remaining}ms -> ${worded}`)
        continue
      }
      const [, rawCount, unit] = match
      const count = Number(rawCount)
      if (count * SIZE[unit] > remaining) bad.push(`${remaining}ms overstated as ${worded}`)
      const readsAsNext = READS_AS_NEXT[unit]
      if (readsAsNext !== undefined && count >= readsAsNext) {
        bad.push(`${remaining}ms worded ${worded}, which reads as the next unit up`)
      }
    }
    expect(bad).toEqual([])
  })

  it('describeExpiry says "expired" from the deadline onwards', () => {
    const now = 1_700_000_000_000
    expect(describeExpiry(now, now)).toBe('expired')
    expect(describeExpiry(now - 1, now)).toBe('expired')
    expect(describeExpiry(now - YEAR, now)).toBe('expired')
  })
})

describe('base64 helpers', () => {
  const sample = new TextEncoder().encode('naïve café — 日本語 🎉  ÿ')

  it('toBase64 / fromBase64 round-trip non-ASCII bytes', () => {
    const text = toBase64(sample)
    expect(text).toBe(Buffer.from(sample).toString('base64'))
    expect([...fromBase64(text)]).toEqual([...sample])
  })

  it('toBase64URL is URL-safe and round-trips, padded or not', () => {
    // Five bytes: standard base64 needs one '=' here, which the URL form drops.
    const bytes = new Uint8Array([0xfb, 0xff, 0xbf, 0x3e, 0x3f])
    const url = toBase64URL(bytes)
    expect(url).not.toMatch(/[+/=]/)
    expect(url).toHaveLength(7)
    expect(toBase64(bytes)).toMatch(/[+/]/)
    expect([...fromBase64URL(url)]).toEqual([...bytes])
    expect([...fromBase64URL(`${url}=`)]).toEqual([...bytes])
    expect([...fromBase64URL(toBase64URL(sample))]).toEqual([...sample])
  })

  it('handles large inputs beyond a single fromCharCode call', () => {
    const big = new Uint8Array(200_000).map((_, i) => i % 251)
    expect([...fromBase64(toBase64(big))]).toEqual([...big])
  })
})
