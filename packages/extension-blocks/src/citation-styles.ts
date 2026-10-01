// Citation styles: a source's details, kept on its reference entry, written
// out the way APA, MLA, Chicago (author-date) or IEEE would have it, and the
// in-text citation to match. Sources come in from BibTeX or CSL-JSON, the
// two formats every reference manager exports.

/** The four styles the reference list can be set in. */
export type CitationStyle = 'apa' | 'mla' | 'chicago' | 'ieee'

export const CITATION_STYLES: readonly { readonly id: CitationStyle; readonly label: string }[] = [
  { id: 'apa', label: 'APA' },
  { id: 'mla', label: 'MLA' },
  { id: 'chicago', label: 'Chicago' },
  { id: 'ieee', label: 'IEEE' },
]

/** The style a list is in when it names none: numbered, as citations always were. */
export const DEFAULT_CITATION_STYLE: CitationStyle = 'ieee'

export interface CitationAuthor {
  readonly family: string
  readonly given?: string
}

/** A source's details: a subset of CSL, as much as the four styles print. */
export interface CitationSource {
  /** CSL type: `article-journal`, `book`, `chapter`, `webpage`, `report`… */
  readonly type?: string
  readonly author?: readonly CitationAuthor[]
  /** Year of publication. */
  readonly issued?: number
  readonly title?: string
  /** The journal, book or site the source appears in. */
  readonly containerTitle?: string
  readonly publisher?: string
  readonly volume?: string
  readonly issue?: string
  readonly page?: string
  readonly url?: string
  readonly doi?: string
}

/** A source read from a file, with the key it was filed under. */
export interface ImportedSource {
  readonly id: string
  readonly source: CitationSource
}

/** A file that holds no source this can read. */
export class SourceFileError extends Error {
  override readonly name = 'SourceFileError'
}

/** Whether a value names one of the four styles. */
export function isCitationStyle(value: unknown): value is CitationStyle {
  return CITATION_STYLES.some((style) => style.id === value)
}

const text = (value: unknown, max = 500): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, max) : undefined

/** A source from stored JSON, with anything that is not text or a year dropped. */
export function parseSource(value: unknown): CitationSource | null {
  let data: unknown = value
  if (typeof value === 'string') {
    try {
      data = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (typeof data !== 'object' || data === null) return null
  const raw = data as Record<string, unknown>
  const author = Array.isArray(raw.author)
    ? raw.author.flatMap((entry) => {
        const person = entry as Record<string, unknown>
        const family = text(person?.family, 100)
        return family
          ? [{ family, ...(text(person.given, 100) ? { given: text(person.given, 100) } : {}) }]
          : []
      })
    : []
  const year = Number(raw.issued)
  const source: Record<string, unknown> = {
    type: text(raw.type, 40),
    author: author.length > 0 ? author : undefined,
    issued: Number.isInteger(year) && year > 0 && year < 10000 ? year : undefined,
    title: text(raw.title),
    containerTitle: text(raw.containerTitle),
    publisher: text(raw.publisher, 200),
    volume: text(raw.volume, 20),
    issue: text(raw.issue, 20),
    page: text(raw.page, 40),
    url: text(raw.url, 2000),
    doi: text(raw.doi, 200),
  }
  return Object.fromEntries(
    Object.entries(source).filter(([, each]) => each !== undefined),
  ) as CitationSource
}

// ------------------------------------------------------------------ BibTeX

/** BibTeX entry types to their CSL type. */
const BIBTEX_TYPES: Readonly<Record<string, string>> = {
  article: 'article-journal',
  book: 'book',
  inbook: 'chapter',
  incollection: 'chapter',
  inproceedings: 'paper-conference',
  conference: 'paper-conference',
  techreport: 'report',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  online: 'webpage',
  misc: 'document',
}

/** One field's value: the text inside its braces or quotes, TeX braces removed. */
function fieldValue(raw: string): string {
  let value = raw.trim()
  if (
    (value.startsWith('{') && value.endsWith('}')) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    value = value.slice(1, -1)
  }
  return value.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()
}

/** `Family, Given and Given Family` to people. */
function bibtexAuthors(value: string): CitationAuthor[] {
  return value
    .split(/\s+and\s+/i)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => {
      if (name.includes(',')) {
        const [family = '', given = ''] = name.split(',').map((part) => part.trim())
        return given ? { family, given } : { family }
      }
      const parts = name.split(' ')
      const family = parts.pop() ?? name
      return parts.length > 0 ? { family, given: parts.join(' ') } : { family }
    })
}

/** The fields of one entry's body, `key = {value},` by `key = {value},`. */
function bibtexFields(body: string): Map<string, string> {
  const fields = new Map<string, string>()
  let at = 0
  while (at < body.length) {
    const name = /\s*,?\s*([A-Za-z][\w-]*)\s*=\s*/y
    name.lastIndex = at
    const found = name.exec(body)
    if (!found) break
    at = name.lastIndex
    let end = at
    if (body[at] === '{') {
      let depth = 0
      for (end = at; end < body.length; end++) {
        if (body[end] === '{') depth++
        else if (body[end] === '}' && --depth === 0) break
      }
      end++
    } else if (body[at] === '"') {
      end = body.indexOf('"', at + 1) + 1 || body.length
    } else {
      while (end < body.length && body[end] !== ',') end++
    }
    fields.set((found[1] as string).toLowerCase(), fieldValue(body.slice(at, end)))
    at = end
  }
  return fields
}

/** Every entry in a `.bib` file, by its citation key. */
export function parseBibTeX(input: string): ImportedSource[] {
  const sources: ImportedSource[] = []
  const entry = /@([A-Za-z]+)\s*\{\s*([^,\s]+)\s*,/g
  for (let match = entry.exec(input); match; match = entry.exec(input)) {
    const kind = (match[1] as string).toLowerCase()
    if (kind === 'comment' || kind === 'string' || kind === 'preamble') continue
    // The body runs to the brace that closes the entry's own.
    let depth = 1
    let end = entry.lastIndex
    for (; end < input.length && depth > 0; end++) {
      if (input[end] === '{') depth++
      else if (input[end] === '}') depth--
    }
    const fields = bibtexFields(input.slice(entry.lastIndex, end - 1))
    entry.lastIndex = end
    const source = parseSource({
      type: BIBTEX_TYPES[kind] ?? 'document',
      author: bibtexAuthors(fields.get('author') ?? fields.get('editor') ?? ''),
      issued: Number.parseInt(fields.get('year') ?? fields.get('date') ?? '', 10),
      title: fields.get('title'),
      containerTitle:
        fields.get('journal') ?? fields.get('booktitle') ?? fields.get('journaltitle'),
      publisher: fields.get('publisher') ?? fields.get('institution') ?? fields.get('school'),
      volume: fields.get('volume'),
      issue: fields.get('number'),
      page: fields.get('pages')?.replace(/-+/g, '–'),
      url: fields.get('url'),
      doi: fields.get('doi'),
    })
    if (source) sources.push({ id: match[2] as string, source })
  }
  return sources
}

// ---------------------------------------------------------------- CSL-JSON

/** Every item in a CSL-JSON file (an array, or one item), by its `id`. */
export function parseCSLJSON(input: string): ImportedSource[] {
  let data: unknown
  try {
    data = JSON.parse(input)
  } catch {
    throw new SourceFileError('This file is not JSON.')
  }
  const items = Array.isArray(data) ? data : [data]
  return items.flatMap((item, index) => {
    if (typeof item !== 'object' || item === null) return []
    const raw = item as Record<string, unknown>
    const issued = raw.issued as { 'date-parts'?: unknown[][] } | undefined
    const source = parseSource({
      type: raw.type,
      author: raw.author,
      issued: issued?.['date-parts']?.[0]?.[0],
      title: raw.title,
      containerTitle: raw['container-title'],
      publisher: raw.publisher,
      volume: raw.volume === undefined ? undefined : String(raw.volume),
      issue: raw.issue === undefined ? undefined : String(raw.issue),
      page: raw.page === undefined ? undefined : String(raw.page),
      url: raw.URL ?? raw.url,
      doi: raw.DOI ?? raw.doi,
    })
    const id =
      typeof raw.id === 'string' || typeof raw.id === 'number' ? String(raw.id) : `item${index + 1}`
    return source ? [{ id, source }] : []
  })
}

/** Sources from a file: BibTeX by its `@` entries, CSL-JSON otherwise. */
export function parseSources(input: string): ImportedSource[] {
  const start = input.trimStart()
  const sources =
    start.startsWith('[') || start.startsWith('{') ? parseCSLJSON(input) : parseBibTeX(input)
  if (sources.length === 0) throw new SourceFileError('No sources were found in this file.')
  return sources
}

// -------------------------------------------------------------- formatting

const initials = (given: string | undefined, spaced = true): string =>
  (given ?? '')
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((name) => `${name.charAt(0).toUpperCase()}.`)
    .join(spaced ? ' ' : '')

/** A title, ended with one full stop however it ends. */
const sentence = (value: string): string => (/[.?!]$/.test(value) ? value : `${value}.`)

/** "Smith", "Smith and Doe" or "Smith et al.", as an in-text citation names them. */
function shortAuthors(authors: readonly CitationAuthor[], and: string): string {
  const [first, second] = authors
  if (!first) return ''
  if (authors.length === 1) return first.family
  if (authors.length === 2 && second) return `${first.family} ${and} ${second.family}`
  return `${first.family} et al.`
}

function apaAuthors(authors: readonly CitationAuthor[]): string {
  const names = authors.map((person) =>
    person.given ? `${person.family}, ${initials(person.given)}` : person.family,
  )
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}`
}

function mlaAuthors(authors: readonly CitationAuthor[]): string {
  const [first, second] = authors
  if (!first) return ''
  const inverted = first.given ? `${first.family}, ${first.given}` : first.family
  if (authors.length === 1) return inverted
  if (authors.length === 2 && second) {
    return `${inverted}, and ${second.given ? `${second.given} ${second.family}` : second.family}`
  }
  return `${inverted}, et al.`
}

function chicagoAuthors(authors: readonly CitationAuthor[]): string {
  const names = authors.map((person, index) =>
    index === 0
      ? person.given
        ? `${person.family}, ${person.given}`
        : person.family
      : person.given
        ? `${person.given} ${person.family}`
        : person.family,
  )
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

function ieeeAuthors(authors: readonly CitationAuthor[]): string {
  const names = authors.map((person) =>
    person.given ? `${initials(person.given)} ${person.family}` : person.family,
  )
  if (names.length <= 2) return names.join(' and ')
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

/** Where to find it: the DOI as a link when there is one, else the address. */
const locator = (source: CitationSource): string =>
  source.doi
    ? `https://doi.org/${source.doi.replace(/^https?:\/\/doi\.org\//, '')}`
    : (source.url ?? '')

/** One reference-list entry, in a style. */
export function formatReference(source: CitationSource, style: CitationStyle): string {
  const authors = source.author ?? []
  const year = source.issued
  const title = source.title ?? 'Untitled'
  const container = source.containerTitle
  const isPart = Boolean(container)
  const volume = source.volume
  const issue = source.issue
  const page = source.page
  const link = locator(source)
  switch (style) {
    case 'apa': {
      const who = authors.length > 0 ? `${apaAuthors(authors)} ` : ''
      const when = `(${year ?? 'n.d.'}). `
      const where = isPart
        ? ` ${container}${volume ? `, ${volume}` : ''}${issue ? `(${issue})` : ''}${page ? `, ${page}` : ''}.`
        : source.publisher
          ? ` ${source.publisher}.`
          : ''
      return `${who}${when}${sentence(title)}${where}${link ? ` ${link}` : ''}`.trim()
    }
    case 'mla': {
      const who = authors.length > 0 ? `${sentence(mlaAuthors(authors))} ` : ''
      const what = isPart ? `“${sentence(title)}” ` : `${sentence(title)} `
      const parts = [
        container,
        volume ? `vol. ${volume}` : undefined,
        issue ? `no. ${issue}` : undefined,
        isPart ? undefined : source.publisher,
        year ? String(year) : undefined,
        page ? `pp. ${page}` : undefined,
      ].filter(Boolean)
      return `${who}${what}${parts.length > 0 ? `${parts.join(', ')}.` : ''}${link ? ` ${link}` : ''}`.trim()
    }
    case 'chicago': {
      const who = authors.length > 0 ? `${sentence(chicagoAuthors(authors))} ` : ''
      const when = `${year ?? 'n.d.'}. `
      const what = isPart ? `“${sentence(title)}” ` : `${sentence(title)} `
      const where = isPart
        ? `${container}${volume ? ` ${volume}` : ''}${issue ? ` (${issue})` : ''}${page ? `: ${page}` : ''}.`
        : source.publisher
          ? `${source.publisher}.`
          : ''
      return `${who}${when}${what}${where}${link ? ` ${link}` : ''}`.trim()
    }
    case 'ieee': {
      const who = authors.length > 0 ? `${ieeeAuthors(authors)}, ` : ''
      const what = `“${title},” `
      const parts = [
        container,
        volume ? `vol. ${volume}` : undefined,
        issue ? `no. ${issue}` : undefined,
        page ? `pp. ${page}` : undefined,
        isPart ? undefined : source.publisher,
        year ? String(year) : undefined,
      ].filter(Boolean)
      return `${who}${what}${parts.join(', ')}.${link ? ` ${link}` : ''}`.trim()
    }
  }
}

/**
 * The in-text citation for the entry at `index` of the list: its number in
 * IEEE, the author and year in the others. An entry with no details to name
 * is numbered in every style, as it would have been before.
 */
export function citationLabel(
  source: CitationSource | null,
  style: CitationStyle,
  index: number,
): string {
  const authors = source?.author ?? []
  if (style === 'ieee' || !source || (authors.length === 0 && !source.title))
    return String(index + 1)
  const who =
    authors.length > 0 ? shortAuthors(authors, style === 'apa' ? '&' : 'and') : `“${source.title}”`
  const year = source.issued ? String(source.issued) : 'n.d.'
  if (style === 'apa') return `(${who}, ${year})`
  if (style === 'mla') return `(${who})`
  return `(${who} ${year})`
}

/** How an author-date list orders its entries: first author, then year, then title. */
export function referenceSortKey(source: CitationSource | null, fallback: string): string {
  if (!source) return `~${fallback.toLowerCase()}`
  const author = source.author?.[0]?.family ?? source.title ?? fallback
  return `${author.toLowerCase()}\u0000${source.issued ?? 9999}\u0000${(source.title ?? '').toLowerCase()}`
}
