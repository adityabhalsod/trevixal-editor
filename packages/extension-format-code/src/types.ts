/**
 * Every formatter returns this instead of throwing: a code block full of
 * half-typed JSON is the normal case, not an exceptional one, and the caller
 * needs the parser's message to show the user what is wrong.
 */
export type FormatResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly error: string }

/** The languages these formatters understand. */
export type FormatKind = 'json' | 'xml'

/** Clamp an indent to something a document can actually contain. */
export function normalizeIndent(indent: number | undefined, fallback = 2): number {
  if (typeof indent !== 'number' || !Number.isFinite(indent)) return fallback
  return Math.min(10, Math.max(0, Math.round(indent)))
}
