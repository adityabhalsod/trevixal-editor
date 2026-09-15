import { parseColor, toHex } from './color'

/**
 * The editor's palette, keyed by token name without the `--tvx-` prefix.
 * The same vocabulary the UI kit writes its themes in, so a caller can hand
 * one straight through without translating it first.
 */
export type ThemeTokens = Readonly<Record<string, string>>

/** The palette resolved to the colours a document format can carry. */
export interface DocumentPalette {
  /** The page's own colour, as `RRGGBB`. */
  readonly background: string | null
  /** Body text. */
  readonly text: string | null
  /** Captions and other secondary text. */
  readonly muted: string | null
  /** Links. */
  readonly accent: string | null
  /** Table and quote rules. */
  readonly border: string | null
  /** The fill behind a code block. */
  readonly code: string | null
}

/** Every colour absent: what a writer gets when no theme was passed. */
const UNTHEMED: DocumentPalette = {
  background: null,
  text: null,
  muted: null,
  accent: null,
  border: null,
  code: null,
}

/**
 * Resolve a theme into the colours a Word or RTF document can write.
 *
 * A token the theme leaves out, or one holding something no document format
 * can express (a gradient, `transparent`, a `var()` that never resolved)
 * comes back null, and the writer keeps the colour it used before there were
 * themes rather than emitting something Word will reject.
 */
export function documentPalette(tokens: ThemeTokens | undefined): DocumentPalette {
  if (!tokens) return UNTHEMED
  const hex = (name: string): string | null => {
    const parsed = parseColor(tokens[name])
    return parsed ? toHex(parsed) : null
  }
  return {
    background: hex('color-bg'),
    text: hex('color-text'),
    muted: hex('color-text-muted'),
    accent: hex('color-accent'),
    border: hex('color-border'),
    code: hex('color-code-bg'),
  }
}
