import { fromBase64, fromBase64URL, toBase64, toBase64URL } from './crypto'
import { randomBytes, subtle } from './web-crypto'

/**
 * Passkeys: unlock with the device's own sign-in (a fingerprint, a face, a
 * PIN) beside the password. Registering one keeps its public key; unlocking
 * asks the authenticator to sign a fresh random challenge, and the signature
 * is checked here, against that key, before anything opens. No server is
 * involved: the key never leaves the authenticator, and nothing leaves the
 * page.
 */

/** What a registered passkey leaves behind: enough to check it, nothing secret. */
export interface PasskeyRecord {
  /** The credential's id, base64url. */
  readonly credentialId: string
  /** Its public key, SPKI, base64. */
  readonly publicKey: string
}

/** A passkey that could not be made or checked. */
export class PasskeyError extends Error {
  override readonly name = 'PasskeyError'
}

/** COSE's number for ECDSA with P-256 and SHA-256, the one algorithm checked here. */
const ES256 = -7
/** How long the browser waits for the authenticator, in ms. */
const TIMEOUT = 60_000
/** Bit 2 of the authenticator data's flags: the user proved who they are. */
const USER_VERIFIED = 0x04

/** Whether this browser can use passkeys at all. */
export function passkeysAvailable(window: Window): boolean {
  const scope = window as Window & { PublicKeyCredential?: unknown }
  return typeof scope.PublicKeyCredential === 'function' && Boolean(window.navigator.credentials)
}

/** Register a passkey for `name`. */
export async function registerPasskey(window: Window, name: string): Promise<PasskeyRecord> {
  const credential = (await window.navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: window.document.title || 'Trevixal' },
      user: { id: randomBytes(16), name, displayName: name },
      pubKeyCredParams: [{ type: 'public-key', alg: ES256 }],
      authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
      timeout: TIMEOUT,
    },
  })) as PublicKeyCredential | null
  if (!credential) throw new PasskeyError('No passkey was made.')
  const response = credential.response as AuthenticatorAttestationResponse
  const key = response.getPublicKey?.()
  if (!key || response.getPublicKeyAlgorithm?.() !== ES256) {
    throw new PasskeyError('This authenticator does not offer a key this page can check.')
  }
  return {
    credentialId: toBase64URL(new Uint8Array(credential.rawId)),
    publicKey: toBase64(new Uint8Array(key)),
  }
}

/** An ASN.1 DER ECDSA signature as the raw r‖s WebCrypto checks. */
export function derToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> {
  // SEQUENCE { INTEGER r, INTEGER s }, each at most 33 bytes with a sign byte.
  const raw = new Uint8Array(64)
  let at = 2
  for (const half of [0, 32]) {
    if (der[at] !== 0x02) throw new PasskeyError('A malformed signature.')
    const length = der[at + 1] ?? 0
    let value = der.subarray(at + 2, at + 2 + length)
    while (value.length > 32 && value[0] === 0) value = value.subarray(1)
    raw.set(value, half + 32 - value.length)
    at += 2 + length
  }
  return raw
}

/**
 * Ask for the passkey, and check what it signs: a challenge made here just
 * now, for this page, by the key registered, with the user verified. True
 * only then; false when it is refused or does not check out.
 */
export async function verifyPasskey(window: Window, record: PasskeyRecord): Promise<boolean> {
  const challenge = randomBytes(32)
  let assertion: PublicKeyCredential | null
  try {
    assertion = (await window.navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ type: 'public-key', id: fromBase64URL(record.credentialId) }],
        userVerification: 'required',
        timeout: TIMEOUT,
      },
    })) as PublicKeyCredential | null
  } catch {
    return false
  }
  if (!assertion) return false
  const response = assertion.response as AuthenticatorAssertionResponse
  const client = JSON.parse(new TextDecoder().decode(response.clientDataJSON)) as {
    type?: string
    challenge?: string
    origin?: string
  }
  if (
    client.type !== 'webauthn.get' ||
    client.challenge !== toBase64URL(challenge) ||
    client.origin !== window.location.origin
  ) {
    return false
  }
  const data = new Uint8Array(response.authenticatorData)
  if (((data[32] ?? 0) & USER_VERIFIED) === 0) return false
  const key = await subtle().importKey(
    'spki',
    fromBase64(record.publicKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  )
  const clientHash = new Uint8Array(await subtle().digest('SHA-256', response.clientDataJSON))
  const signed = new Uint8Array(data.length + clientHash.length)
  signed.set(data)
  signed.set(clientHash, data.length)
  return subtle().verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    derToRaw(new Uint8Array(response.signature)),
    signed,
  )
}
