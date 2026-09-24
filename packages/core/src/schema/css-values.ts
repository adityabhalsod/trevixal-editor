/**
 * CSS values the schema writes into style attributes and stylesheets, each
 * checked against a grammar of its own rather than escaped.
 */

/**
 * Named, hex, rgb() and hsl() colors only. Validated against an explicit
 * grammar rather than the general CSS sanitizer, which forbids the
 * parentheses these functional notations need.
 */
export function safeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 64) return null
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point
  if (/[\u0000-\u001f\u007f-\u009f]/.test(trimmed)) return null
  return COLOR.test(trimmed) ? trimmed : null
}

const COLOR =
  /^(#[0-9a-f]{3,8}|[a-z]+|rgba?\( *\d{1,3}%? *(,| ) *\d{1,3}%? *(,| ) *\d{1,3}%? *((,|\/) *[\d.]+%? *)?\)|hsla?\( *[\d.]+(deg|rad|turn)? *(,| ) *[\d.]+%? *(,| ) *[\d.]+%? *((,|\/) *[\d.]+%? *)?\))$/i

/**
 * A font stack. Quoted family names are allowed, unlike other CSS values,
 * but only as balanced quotes around plain words, never as a way to close
 * the declaration and start another.
 */
export function safeFontFamily(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 200) return null
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point
  if (/[\u0000-\u001f\u007f-\u009f]/.test(trimmed)) return null
  if (/[<>();{}]|url\(|expression|javascript:|@import/i.test(trimmed)) return null
  const families = trimmed.split(',').map((family) => family.trim())
  if (families.length === 0 || families.length > 12) return null
  return families.every((family) => FONT_FAMILY.test(family)) ? families.join(', ') : null
}

const FONT_FAMILY = /^("[\w \-]+"|'[\w \-]+'|[\w-]+)$/
