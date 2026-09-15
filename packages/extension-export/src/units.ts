/**
 * Unit conversions between the editor's CSS lengths and the print-oriented
 * units Word and RTF use. Everything routes through points because both
 * target formats derive their measures from points (twips = 1/20 pt,
 * half-points, EMU) while the editor stores CSS lengths.
 */

/** EMUs (English Metric Units) per CSS pixel at 96 dpi. */
export const EMU_PER_PX = 9525

/** Twips (twentieths of a point) per CSS pixel. */
export const TWIPS_PER_PX = 15

const LENGTH = /^(-?\d*\.?\d+)\s*(px|pt|em|rem|%|in|cm|mm|pc)?$/i

/**
 * A CSS length in points. `basePt` is the surrounding font size, which is
 * what `em`, `rem` and percentages resolve against. Bare numbers are pixels,
 * matching how the core schema's `safeLength` interprets them.
 */
export function lengthToPoints(value: unknown, basePt = 12): number | null {
  const raw = typeof value === 'number' ? String(value) : value
  if (typeof raw !== 'string') return null
  const match = LENGTH.exec(raw.trim())
  if (!match) return null
  const amount = Number.parseFloat(match[1] ?? '')
  if (!Number.isFinite(amount)) return null
  switch ((match[2] ?? 'px').toLowerCase()) {
    case 'pt':
      return amount
    case 'em':
    case 'rem':
      return amount * basePt
    case '%':
      return (amount / 100) * basePt
    case 'in':
      return amount * 72
    case 'cm':
      return (amount / 2.54) * 72
    case 'mm':
      return (amount / 25.4) * 72
    case 'pc':
      return amount * 12
    default:
      return amount * 0.75
  }
}

/** A CSS length in CSS pixels (96 dpi). */
export function lengthToPx(value: unknown, basePt = 12): number | null {
  const points = lengthToPoints(value, basePt)
  return points === null ? null : (points * 4) / 3
}

/** A CSS length in twips, rounded. The unit of Word indents and spacing. */
export function lengthToTwips(value: unknown, basePt = 12): number | null {
  const points = lengthToPoints(value, basePt)
  return points === null ? null : Math.round(points * 20)
}

/** A CSS length in half-points, rounded. The unit of Word/RTF font sizes. */
export function lengthToHalfPoints(value: unknown, basePt = 12): number | null {
  const points = lengthToPoints(value, basePt)
  if (points === null || points <= 0) return null
  return Math.max(2, Math.round(points * 2))
}

/**
 * A `lineHeight` attr: a bare multiplier (`1.5`) or a length. Returns either
 * form so each writer can pick the control word that fits.
 */
export function parseLineHeight(
  value: unknown,
  basePt = 12,
): { readonly multiplier: number } | { readonly twips: number } | null {
  const raw = typeof value === 'number' ? String(value) : value
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (/^\d*\.?\d+$/.test(trimmed)) {
    const multiplier = Number.parseFloat(trimmed)
    return multiplier > 0 && multiplier <= 10 ? { multiplier } : null
  }
  const twips = lengthToTwips(trimmed, basePt)
  return twips === null || twips <= 0 ? null : { twips }
}

/** Clamp an `indent` attr to the 0-8 steps the core schema allows. */
export function indentSteps(value: unknown): number {
  const steps = typeof value === 'number' ? Math.round(value) : 0
  return Math.min(8, Math.max(0, steps))
}
