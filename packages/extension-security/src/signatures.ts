import {
  type Command,
  type EditorNode,
  documentSignatureOf,
  setDocumentAttrs,
} from '@trevixal/core'
import { fromBase64, toBase64 } from './crypto'
import { subtle } from './web-crypto'

/**
 * Digital signatures: a SHA-256 hash of the document, signed with an ECDSA
 * P-256 key through WebCrypto, kept in the document beside what it signs.
 * Opening the document hashes it again: the same hash and a signature that
 * checks out mean nothing has changed since it was signed.
 *
 * The signature says the text is what the key's holder signed; it does not
 * say who holds the key. The key's fingerprint is shown with the signer's
 * name so it can be compared with one got some other way.
 */

export interface SignatureRecord {
  /** The name the signer gave. */
  readonly signer: string
  /** When, in milliseconds since the epoch. */
  readonly signedAt: number
  /** SHA-256 of the document without its signature, hex. */
  readonly digest: string
  /** The public half of the signing key. */
  readonly publicKey: JsonWebKey
  /** The ECDSA signature over the digest's bytes, base64. */
  readonly value: string
}

export type SignatureStatus =
  | { readonly state: 'unsigned' }
  /** Signed, and not changed since. */
  | {
      readonly state: 'valid'
      readonly signer: string
      readonly signedAt: number
      readonly key: string
    }
  /** Signed, but changed since: the text is not what was signed. */
  | {
      readonly state: 'changed'
      readonly signer: string
      readonly signedAt: number
      readonly key: string
    }
  /** A signature that does not check out: altered, or not made by the key it names. */
  | { readonly state: 'invalid' }

const KEY_ALGORITHM: EcKeyGenParams = { name: 'ECDSA', namedCurve: 'P-256' }
const SIGN_ALGORITHM: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' }

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

/** The document's SHA-256, its signature left out: what a signature covers. */
export async function documentDigest(doc: EditorNode): Promise<string> {
  // The document's settings as they differ from the defaults, the signature
  // left out: the same whether or not a signature has been added since.
  const defaults = doc.type.spec.attrs ?? {}
  const attrs = Object.fromEntries(
    Object.entries(doc.attrs).filter(
      ([name, value]) => name !== 'signature' && value !== (defaults[name]?.default ?? null),
    ),
  )
  // Built key by key: a spread would put `attrs` first or last depending on
  // whether the document had any, and the hash would follow the key order.
  const json = doc.toJSON()
  const unsigned = { type: json.type, attrs, content: json.content ?? [] }
  const bytes = new TextEncoder().encode(JSON.stringify(unsigned))
  return hex(await subtle().digest('SHA-256', bytes))
}

/** A new signing key; its private half cannot be read out of the browser. */
export function createSigningKeys(): Promise<CryptoKeyPair> {
  return subtle().generateKey(KEY_ALGORITHM, false, ['sign', 'verify'])
}

/** A key's fingerprint: the start of its SHA-256, grouped for reading aloud. */
export async function keyFingerprint(publicKey: JsonWebKey): Promise<string> {
  const bytes = new TextEncoder().encode(`${publicKey.crv}:${publicKey.x}:${publicKey.y}`)
  const digest = hex(await subtle().digest('SHA-256', bytes)).toUpperCase()
  return (digest.slice(0, 16).match(/.{4}/g) ?? []).join(' ')
}

/** Sign a document as `signer` with `keys`. */
export async function signDocument(
  doc: EditorNode,
  keys: CryptoKeyPair,
  signer: string,
  signedAt = Date.now(),
): Promise<SignatureRecord> {
  const digest = await documentDigest(doc)
  const value = await subtle().sign(
    SIGN_ALGORITHM,
    keys.privateKey,
    new TextEncoder().encode(digest),
  )
  const publicKey = await subtle().exportKey('jwk', keys.publicKey)
  return { signer, signedAt, digest, publicKey, value: toBase64(new Uint8Array(value)) }
}

/** The signature a document carries, or null. */
export function signatureOf(doc: EditorNode): SignatureRecord | null {
  const stored = documentSignatureOf(doc.attrs.signature)
  if (!stored) return null
  try {
    const record = JSON.parse(stored) as SignatureRecord
    return typeof record.digest === 'string' && typeof record.value === 'string' && record.publicKey
      ? record
      : null
  } catch {
    return null
  }
}

/** Keep a signature on the document, or with null, take it off. */
export function setDocumentSignature(record: SignatureRecord | null): Command {
  return setDocumentAttrs({ signature: record ? JSON.stringify(record) : null })
}

/** Whether the document is signed, and whether it still is what was signed. */
export async function verifyDocument(doc: EditorNode): Promise<SignatureStatus> {
  const record = signatureOf(doc)
  if (!record) return { state: 'unsigned' }
  try {
    const key = await subtle().importKey('jwk', record.publicKey, KEY_ALGORITHM, false, ['verify'])
    const checks = await subtle().verify(
      SIGN_ALGORITHM,
      key,
      fromBase64(record.value),
      new TextEncoder().encode(record.digest),
    )
    if (!checks) return { state: 'invalid' }
    const fingerprint = await keyFingerprint(record.publicKey)
    const same = (await documentDigest(doc)) === record.digest
    return {
      state: same ? 'valid' : 'changed',
      signer: record.signer,
      signedAt: record.signedAt,
      key: fingerprint,
    }
  } catch {
    return { state: 'invalid' }
  }
}
