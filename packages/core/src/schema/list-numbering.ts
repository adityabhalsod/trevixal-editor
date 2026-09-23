import type { EditorNode } from '../model/node'

/**
 * Multilevel list numbering: one scheme marks a whole tree of nested lists,
 * the way Word's multilevel list gallery does.
 *
 * The scheme is stored once, in the outermost list's `numbering` attr, and
 * every list nested under it takes the marker for its depth. Nothing is
 * written to the nested lists themselves, which is what lets an item indented
 * later pick up the scheme's next level without any command knowing about it.
 *
 * This table is the one description of each scheme: the Word and RTF writers
 * read it, the gallery draws its previews from it, and the editor's stylesheet
 * mirrors it, which a browser test holds to the table level by level.
 */

/** A numbered level's counter style, named as CSS `list-style-type` names it. */
export type ListCounterStyle =
  | 'decimal'
  | 'lower-alpha'
  | 'upper-alpha'
  | 'lower-roman'
  | 'upper-roman'

export interface ListNumberingScheme {
  /** The gallery's key, and what the outermost list's `numbering` stores. */
  readonly id: string
  /** The list type every level of the tree becomes. */
  readonly listType: 'orderedList' | 'bulletList'
  /**
   * One marker per level, repeating from the first past the last: a counter
   * style for a numbered scheme, the glyph itself for a bulleted one.
   */
  readonly levels: readonly string[]
  /** What follows a number. Bullets have none. */
  readonly suffix: '.' | ')' | ''
  /** Whether each number carries its ancestors': `1.1.1.` rather than `i.`. */
  readonly outline: boolean
}

/**
 * Word's own default: `1.` then `a.` then `i.`, and round again. It is what a
 * numbered list shows with no scheme stored, so it is stored as none.
 */
export const DEFAULT_LIST_NUMBERING: ListNumberingScheme = {
  id: 'default',
  listType: 'orderedList',
  levels: ['decimal', 'lower-alpha', 'lower-roman'],
  suffix: '.',
  outline: false,
}

/**
 * The gallery, in the order it is offered. Word's entries that number
 * headings rather than lists (Article/Section, Heading 1, Chapter) have no
 * list to live on, so they are not here.
 */
export const LIST_NUMBERING_SCHEMES: readonly ListNumberingScheme[] = [
  DEFAULT_LIST_NUMBERING,
  {
    id: 'parenthesis',
    listType: 'orderedList',
    levels: ['decimal', 'lower-alpha', 'lower-roman'],
    suffix: ')',
    outline: false,
  },
  { id: 'outline', listType: 'orderedList', levels: ['decimal'], suffix: '.', outline: true },
  {
    id: 'roman-outline',
    listType: 'orderedList',
    levels: ['upper-roman', 'upper-alpha', 'decimal', 'lower-alpha', 'lower-roman'],
    suffix: '.',
    outline: false,
  },
  { id: 'symbols', listType: 'bulletList', levels: ['❖', '➢', '▪'], suffix: '', outline: false },
]

const SCHEMES_BY_ID: ReadonlyMap<string, ListNumberingScheme> = new Map(
  LIST_NUMBERING_SCHEMES.map((scheme) => [scheme.id, scheme]),
)

/** The scheme with this id, or null for one that does not exist. */
export function listNumberingScheme(id: string): ListNumberingScheme | null {
  return SCHEMES_BY_ID.get(id) ?? null
}

/**
 * The `numbering` values a list type may store. The default is left out: it
 * is stored as none, so the same list never has two spellings.
 */
export function storedNumberingsFor(listTypeName: string): ReadonlySet<string> {
  return new Set(
    LIST_NUMBERING_SCHEMES.filter(
      (scheme) => scheme.listType === listTypeName && scheme !== DEFAULT_LIST_NUMBERING,
    ).map((scheme) => scheme.id),
  )
}

/** What a scheme is stored as in the `numbering` attr. */
export function storedNumbering(scheme: ListNumberingScheme): string | null {
  return scheme === DEFAULT_LIST_NUMBERING ? null : scheme.id
}

/**
 * The scheme a list numbers its tree with: the one it stores, or the default
 * for a numbered list that stores none. Null for a list no scheme describes:
 * plain bullets and task lists.
 */
export function listNumberingOf(list: EditorNode): ListNumberingScheme | null {
  const stored = list.attrs.numbering
  if (typeof stored === 'string' && storedNumberingsFor(list.type.name).has(stored)) {
    return listNumberingScheme(stored)
  }
  return list.type.name === 'orderedList' ? DEFAULT_LIST_NUMBERING : null
}

/** The marker style a scheme gives a level; levels count from 0. */
export function levelMarker(scheme: ListNumberingScheme, level: number): string {
  return scheme.levels[level % scheme.levels.length] as string
}

/**
 * The marker an item shows, as text. `numbers` holds its number at every
 * level, outermost first, so the last is the item's own.
 */
export function listMarker(scheme: ListNumberingScheme, numbers: readonly number[]): string {
  const level = numbers.length - 1
  const own = numbers[level] ?? 1
  if (scheme.listType === 'bulletList') return levelMarker(scheme, level)
  // Every part in decimal, as `counters()` and Word's legal numbering write it.
  if (scheme.outline) return `${numbers.join('.')}.`
  return `${formatListCounter(own, levelMarker(scheme, level))}${scheme.suffix}`
}

const ROMAN: readonly (readonly [number, string])[] = [
  [1000, 'm'],
  [900, 'cm'],
  [500, 'd'],
  [400, 'cd'],
  [100, 'c'],
  [90, 'xc'],
  [50, 'l'],
  [40, 'xl'],
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
]

/** CSS writes roman numerals only up to this, and falls back to decimal past it. */
const ROMAN_LIMIT = 3999

/**
 * `n` in a counter style, as a browser would draw it: `3` is `c` in
 * lower-alpha and `iii` in lower-roman. Outside the range a style covers
 * (below 1, or roman past 3999) it falls back to decimal, as CSS does.
 */
export function formatListCounter(n: number, style: string): string {
  if (!Number.isInteger(n) || n < 1) return String(n)
  switch (style) {
    case 'lower-alpha':
    case 'upper-alpha': {
      // Bijective base 26: z is followed by aa, not by ba.
      let rest = n
      let text = ''
      while (rest > 0) {
        rest -= 1
        text = String.fromCharCode(97 + (rest % 26)) + text
        rest = Math.floor(rest / 26)
      }
      return style === 'upper-alpha' ? text.toUpperCase() : text
    }
    case 'lower-roman':
    case 'upper-roman': {
      if (n > ROMAN_LIMIT) return String(n)
      let rest = n
      let text = ''
      for (const [value, numeral] of ROMAN) {
        while (rest >= value) {
          text += numeral
          rest -= value
        }
      }
      return style === 'upper-roman' ? text.toUpperCase() : text
    }
    default:
      return String(n)
  }
}
