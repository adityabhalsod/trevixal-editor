import { UnsupportedEnvironmentError } from '@trevixal/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deriveKey, encryptDocument } from '../src/crypto'

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * What encryption does where WebCrypto is not reachable.
 *
 * An http:// origin, an old browser and some hardened embeds all get here, and
 * there is no fallback worth having. A hand-rolled cipher would be worse than
 * refusing. So the contract is that it says which API is missing and says it
 * before touching a password.
 */
describe('without WebCrypto', () => {
  it('refuses to encrypt, naming the API it needs', async () => {
    vi.stubGlobal('crypto', undefined)
    await expect(encryptDocument({ doc: 1 }, 'hunter2')).rejects.toThrow(
      /WebCrypto \(crypto\.getRandomValues\) is not available/,
    )
  })

  it('refuses to derive a key, naming the API it needs', async () => {
    vi.stubGlobal('crypto', {})
    await expect(deriveKey('hunter2', new Uint8Array(16), 1000)).rejects.toThrow(
      /WebCrypto \(crypto\.subtle\) is not available/,
    )
  })

  it('throws the type a host can act on, not a bare Error', async () => {
    vi.stubGlobal('crypto', undefined)
    // The distinction that matters: a missing API is the browser's problem and
    // no password will fix it, so a host can disable the menu entry rather
    // than let the user try again.
    await expect(encryptDocument({ doc: 1 }, 'hunter2')).rejects.toThrow(
      UnsupportedEnvironmentError,
    )
  })
})
