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
  /**
   * A scheme the writer defined, as Word's Define New Multilevel List does:
   * all nine levels, each with its own marker, start and indent. Stored in
   * the document (see {@link parseListSchemes}); the built-in ones have none.
   */
  readonly custom?: readonly CustomListLevel[]
  /** A defined scheme's name, as the gallery labels it. */
  readonly name?: string
}

/**
 * How a defined level numbers: a counter style as CSS names it, `bullet`
 * for a level whose marker is its text alone, or `none` for no number.
 */
export type CustomLevelStyle = ListCounterStyle | 'decimal-leading-zero' | 'bullet' | 'none'

export const CUSTOM_LEVEL_STYLES: readonly CustomLevelStyle[] = [
  'decimal',
  'decimal-leading-zero',
  'lower-alpha',
  'upper-alpha',
  'lower-roman',
  'upper-roman',
  'bullet',
  'none',
]

/** One level of a defined scheme. */
export interface CustomListLevel {
  readonly style: CustomLevelStyle
  /**
   * The marker, in Word's notation: `%1` to `%9` are the numbers of levels 1
   * to 9, anything else is itself, so level 2 of a legal scheme is `%1.%2.`.
   * A bullet level's marker is its glyph.
   */
  readonly text: string
  /** The number the level's first item takes. */
  readonly start: number
  /** How far the level's text sits in from the level above's, in em. */
  readonly indent: number
}

/** Word's nine list levels. A defined scheme always has all of them. */
export const LIST_LEVELS = 9

/** What a defined scheme's id looks like: the gallery numbers them `custom-1`, `custom-2`. */
const CUSTOM_ID = /^custom-\d{1,4}$/

/** Whether an id names a defined scheme rather than a built-in one. */
export function isCustomNumberingId(value: unknown): value is string {
  return typeof value === 'string' && CUSTOM_ID.test(value)
}

/** Longest marker a level keeps, and longest name a scheme does. */
const MAX_MARKER = 24
const MAX_SCHEME_NAME = 40

/** Bounds on a level's start and indent, as Word's dialog has them. */
export const LEVEL_START = { min: 0, max: 999 } as const
export const LEVEL_INDENT = { min: 0, max: 10 } as const

/** A level's marker as it may be stored: one line, and only `%n` for this level or one above it. */
function sanitizeMarker(value: unknown, level: number, style: CustomLevelStyle): string {
  if (typeof value !== 'string') return ''
  // biome-ignore lint/suspicious/noControlCharactersInRegex: a marker is one line of plain text
  const text = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, MAX_MARKER)
  if (style === 'bullet') return text.replace(/%(\d)/g, '')
  return text.replace(/%(\d)/g, (placeholder, digit: string) =>
    Number(digit) >= 1 && Number(digit) <= level + 1 ? placeholder : '',
  )
}

function bounded(value: unknown, bounds: { min: number; max: number }, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value * 10) / 10))
}

/** The level Word's default numbering gives `level` (0-based), as a defined scheme starts from. */
export function defaultCustomLevel(level: number): CustomListLevel {
  return {
    style: levelMarker(DEFAULT_LIST_NUMBERING, level) as ListCounterStyle,
    text: `%${level + 1}.`,
    start: 1,
    indent: 1.5,
  }
}

/** A scheme from its levels: a bulleted list when its first level is a bullet. */
export function customListScheme(
  id: string,
  name: string,
  levels: readonly CustomListLevel[],
): ListNumberingScheme {
  const all = Array.from({ length: LIST_LEVELS }, (_, level) => {
    const raw = levels[level] ?? defaultCustomLevel(level)
    const style = CUSTOM_LEVEL_STYLES.includes(raw.style) ? raw.style : 'decimal'
    return {
      style,
      text: sanitizeMarker(raw.text, level, style),
      start: Math.round(bounded(raw.start, LEVEL_START, 1)),
      indent: bounded(raw.indent, LEVEL_INDENT, 1.5),
    }
  })
  return {
    id,
    name: name.trim().slice(0, MAX_SCHEME_NAME) || id,
    listType: all[0]?.style === 'bullet' ? 'bulletList' : 'orderedList',
    levels: all.map((level) => (level.style === 'bullet' ? level.text : level.style)),
    suffix: '',
    outline: false,
    custom: all,
  }
}

/**
 * A document's defined schemes, as its `listSchemes` setting holds them
 * (JSON). Anything that does not read as one is dropped.
 */
export function parseListSchemes(value: unknown): ListNumberingScheme[] {
  if (typeof value !== 'string' || value === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    // A hand-edited setting that no longer parses leaves every list as it was.
    return []
  }
  if (!Array.isArray(parsed)) return []
  const schemes = new Map<string, ListNumberingScheme>()
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue
    const raw = entry as Record<string, unknown>
    if (!isCustomNumberingId(raw.id) || !Array.isArray(raw.levels)) continue
    const levels = (raw.levels as unknown[]).map(
      (level) => (typeof level === 'object' && level !== null ? level : {}) as CustomListLevel,
    )
    const name = typeof raw.name === 'string' ? raw.name : ''
    schemes.set(raw.id, customListScheme(raw.id, name, levels))
  }
  return [...schemes.values()]
}

/** Defined schemes back as the setting; null when there are none. */
export function storedListSchemesAttr(schemes: readonly ListNumberingScheme[]): string | null {
  const defined = schemes.filter((scheme) => scheme.custom)
  if (defined.length === 0) return null
  return JSON.stringify(
    defined.map((scheme) => ({ id: scheme.id, name: scheme.name, levels: scheme.custom })),
  )
}

/** The schemes a document defined, in the order it defined them. */
export function documentListSchemes(doc: EditorNode | null | undefined): ListNumberingScheme[] {
  return doc ? parseListSchemes(doc.attrs.listSchemes) : []
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

/**
 * The scheme with this id, or null for one that does not exist. A defined
 * scheme is found among `doc`'s.
 */
export function listNumberingScheme(
  id: string,
  doc?: EditorNode | null,
): ListNumberingScheme | null {
  if (isCustomNumberingId(id)) {
    return documentListSchemes(doc).find((scheme) => scheme.id === id) ?? null
  }
  return SCHEMES_BY_ID.get(id) ?? null
}

/**
 * The built-in `numbering` values a list type may store. The default is left
 * out: it is stored as none, so the same list never has two spellings.
 */
export function storedNumberingsFor(listTypeName: string): ReadonlySet<string> {
  return new Set(
    LIST_NUMBERING_SCHEMES.filter(
      (scheme) => scheme.listType === listTypeName && scheme !== DEFAULT_LIST_NUMBERING,
    ).map((scheme) => scheme.id),
  )
}

/**
 * Whether a list type may store this `numbering`: a built-in scheme of its
 * type, or a defined one's id, which the document's settings resolve.
 */
export function isStoredNumbering(listTypeName: string, id: unknown): id is string {
  if (typeof id !== 'string') return false
  if (isCustomNumberingId(id))
    return listTypeName === 'orderedList' || listTypeName === 'bulletList'
  return storedNumberingsFor(listTypeName).has(id)
}

/** What a scheme is stored as in the `numbering` attr. */
export function storedNumbering(scheme: ListNumberingScheme): string | null {
  return scheme === DEFAULT_LIST_NUMBERING ? null : scheme.id
}

/**
 * The scheme a list numbers its tree with: the one it stores, or the default
 * for a numbered list that stores none. Null for a list no scheme describes:
 * plain bullets and task lists. A defined scheme is looked up in `doc`, and
 * one the document no longer defines falls back as a list storing none does.
 */
export function listNumberingOf(
  list: EditorNode,
  doc?: EditorNode | null,
): ListNumberingScheme | null {
  const stored = list.attrs.numbering
  if (isStoredNumbering(list.type.name, stored)) {
    const scheme = listNumberingScheme(stored, doc)
    if (scheme) return scheme
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
  if (scheme.custom) return customMarker(scheme.custom, numbers)
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

/** `n` in a defined level's style: `none` and `bullet` show no number, and `01` pads to two digits. */
function formatCustomCounter(n: number, style: CustomLevelStyle): string {
  if (style === 'none' || style === 'bullet') return ''
  if (style === 'decimal-leading-zero') return n >= 0 && n < 10 ? `0${n}` : String(n)
  return formatListCounter(n, style)
}

/** A defined level's marker for an item numbered `numbers`, outermost first. */
function customMarker(levels: readonly CustomListLevel[], numbers: readonly number[]): string {
  const level = levels[numbers.length - 1]
  if (!level) return ''
  if (level.style === 'bullet') return level.text
  return level.text.replace(/%([1-9])/g, (_, digit: string) => {
    const index = Number(digit) - 1
    const referenced = levels[index]
    const value = numbers[index]
    return referenced && value !== undefined ? formatCustomCounter(value, referenced.style) : ''
  })
}

/** Text as a CSS string. Markers hold no line breaks, so quotes and backslashes are all that need escaping. */
function cssString(text: string): string {
  return `"${text.replace(/["\\]/g, '\\$&')}"`
}

/** The counter a defined scheme numbers its level `level` (0-based) with. */
function levelCounter(level: number): string {
  return `tvx-list-${level + 1}`
}

/** A defined level's marker as CSS `content`: its text, with a counter for each `%n`. */
function markerContent(levels: readonly CustomListLevel[], level: number): string {
  const own = levels[level]
  if (!own) return 'none'
  if (own.style === 'bullet') return cssString(own.text)
  const parts: string[] = []
  own.text.split(/(%[1-9])/).forEach((piece, index) => {
    if (index % 2 === 0) {
      if (piece) parts.push(cssString(piece))
      return
    }
    const referenced = Number(piece.slice(1)) - 1
    const style = levels[referenced]?.style
    if (style && style !== 'bullet') parts.push(`counter(${levelCounter(referenced)}, ${style})`)
  })
  return parts.length > 0 ? parts.join(' ') : '""'
}

/**
 * The stylesheet a document's defined schemes draw with, under `scope`: the
 * editing surface, or a saved page's content. Every level numbers with a
 * counter of its own, so a marker can show the levels above it in their own
 * styles (`1.a)`), which the browser's one `list-item` counter cannot; the
 * marker is a `::before` in the gutter, as the parenthesis scheme's is. Ids
 * are checked and marker text is quoted, so neither can leave its rule.
 */
export function listSchemesCSS(doc: EditorNode, scope: string): string {
  const rules: string[] = []
  for (const scheme of documentListSchemes(doc)) {
    const levels = scheme.custom ?? []
    let list = `${scope} :is(ol, ul)[data-numbering="${scheme.id}"]`
    levels.forEach((level, index) => {
      // A task list starts a tree of its own, and keeps its checkboxes.
      if (index > 0) list += ' > li > :is(ol, ul):not([data-type])'
      const counter = levelCounter(index)
      // A list given a marker style of its own keeps it, as under a built-in scheme.
      const marked = `${list}:not([style*="list-style-type"])`
      rules.push(
        `${list} { padding-inline-start: ${level.indent}em; --tvx-fold-gutter: calc(${level.indent}em + 0.1em); counter-reset: ${counter} ${level.start - 1} }`,
        `${list} > li { position: relative; counter-increment: ${counter} }`,
        `${marked} { list-style-type: none }`,
        `${marked} > li::before { content: ${markerContent(levels, index)}; position: absolute; inset-inline-end: 100%; margin-inline-end: 0.3em; white-space: nowrap; font-variant-numeric: tabular-nums }`,
      )
    })
  }
  return rules.join('\n')
}
