/**
 * How a code block shows its code, beyond the code itself: which lines are
 * picked out, and the title above it. The values are the block's attributes;
 * these read them the one way, from HTML, Markdown and the dialogs alike.
 */

/** The longest title a code block keeps: a file path, not a paragraph. */
export const CODE_TITLE_MAX = 120

/** The highest line a range may name, so `1-99999999` cannot make a long loop. */
const MAX_LINE = 100_000

/** `3` or `3-5`, with space allowed around the numbers and the dash. */
const LINE_RANGE = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/

/** Each well-formed range in a list, as a pair of line numbers. */
function rangesOf(value: unknown): [number, number][] {
  if (typeof value !== 'string') return []
  const ranges: [number, number][] = []
  for (const piece of value.split(',')) {
    const match = LINE_RANGE.exec(piece)
    if (!match) continue
    const from = Number(match[1])
    const to = match[2] === undefined ? from : Number(match[2])
    if (from >= 1 && to >= from && to <= MAX_LINE) ranges.push([from, to])
  }
  return ranges
}

/**
 * A list of lines and ranges, `"1, 3-5"`, written the one way: `"1,3-5"`.
 * Pieces that name no line are dropped; null when none is left.
 */
export function normalizeLineRanges(value: unknown): string | null {
  const ranges = rangesOf(value)
  if (ranges.length === 0) return null
  return ranges.map(([from, to]) => (from === to ? String(from) : `${from}-${to}`)).join(',')
}

/** Whether a line, counted from 1, is one a range list names. */
export function lineRangeTest(value: unknown): (line: number) => boolean {
  const ranges = rangesOf(value)
  return (line) => ranges.some(([from, to]) => line >= from && line <= to)
}

/** A code block's title, on one line and bounded; null when it has none. */
export function codeBlockTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const title = value.replace(/\s+/g, ' ').trim().slice(0, CODE_TITLE_MAX)
  return title.length > 0 ? title : null
}
