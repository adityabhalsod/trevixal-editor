import type { Command } from '@trevixal/core'
import { insertCodeBlock } from './insert'

/**
 * Past this many line pairs a diff stops comparing line by line and shows
 * the whole of the old text removed and the new added: the comparison table
 * grows with the product of the two lengths.
 */
const MAX_COMPARED_PAIRS = 4_000_000

/**
 * Two versions of some text as one unified diff body: each line of the
 * longest run they share kept with a space before it, each line only the
 * old one has with `-`, each only the new one has with `+`, in order.
 */
export function lineDiff(before: string, after: string): string {
  const old = before.split('\n')
  const next = after.split('\n')
  if (old.length * next.length > MAX_COMPARED_PAIRS) {
    return [...old.map((line) => `-${line}`), ...next.map((line) => `+${line}`)].join('\n')
  }
  // shared[i][j]: how many lines the longest common run of old[i..] and next[j..] has.
  const shared = Array.from({ length: old.length + 1 }, () => new Uint32Array(next.length + 1))
  for (let i = old.length - 1; i >= 0; i--) {
    const row = shared[i] as Uint32Array
    const below = shared[i + 1] as Uint32Array
    for (let j = next.length - 1; j >= 0; j--) {
      row[j] =
        old[i] === next[j]
          ? (below[j + 1] as number) + 1
          : Math.max(below[j] as number, row[j + 1] as number)
    }
  }
  const lines: string[] = []
  let i = 0
  let j = 0
  while (i < old.length && j < next.length) {
    if (old[i] === next[j]) {
      lines.push(` ${old[i]}`)
      i += 1
      j += 1
    } else if ((shared[i + 1]?.[j] ?? 0) >= (shared[i]?.[j + 1] ?? 0)) {
      lines.push(`-${old[i]}`)
      i += 1
    } else {
      lines.push(`+${next[j]}`)
      j += 1
    }
  }
  while (i < old.length) lines.push(`-${old[i++]}`)
  while (j < next.length) lines.push(`+${next[j++]}`)
  return lines.join('\n')
}

/**
 * Put in a code block in the diff language comparing two versions of some
 * code: what was removed coloured red, what was added green.
 */
export function insertCodeDiff(before: string, after: string, title?: string): Command {
  return insertCodeBlock({ language: 'diff', ...(title ? { title } : {}) }, lineDiff(before, after))
}
