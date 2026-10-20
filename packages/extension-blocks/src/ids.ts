/**
 * Ids reach the DOM as both an `id` attribute and a `#fragment` href, so
 * they are held to a strict allowlist rather than escaped. This rejects the
 * whole class of `../`, `javascript:` and quote-breaking payloads outright.
 * A malformed id drops the attribute instead of emitting something clever.
 */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/

/** A document-fragment-safe identifier, or null when it fails the allowlist. */
export function safeAnchorId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return SAFE_ID.test(value) ? value : null
}
