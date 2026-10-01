import { UnsupportedEnvironmentError } from '@trevixal/core'

/** The page's WebCrypto, or an error saying there is none (an insecure origin, say). */
export function subtle(): SubtleCrypto {
  const api = (globalThis as { crypto?: Crypto }).crypto?.subtle
  if (!api)
    throw new UnsupportedEnvironmentError(
      'WebCrypto (crypto.subtle) is not available in this environment',
    )
  return api
}

/** Cryptographically random bytes. */
export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const api = (globalThis as { crypto?: Crypto }).crypto
  if (!api)
    throw new UnsupportedEnvironmentError(
      'WebCrypto (crypto.getRandomValues) is not available in this environment',
    )
  return api.getRandomValues(new Uint8Array(length))
}
