import { type EditorNode, headingNumberingOf } from '@trevixal/core'
import { escapeXML } from './xml'

/**
 * Word fields for the reference apparatus: SEQ for a caption's number, REF
 * for a cross-reference, TOC \c for a table of figures, XE and INDEX for the
 * index. Each is written with the result the editor already computed, so the
 * document reads correctly the moment it opens; Word recomputes them, page
 * numbers included, when it updates its fields.
 */

/** Word's sequence for each caption kind: `SEQ Figure`, `SEQ Table`, `SEQ Equation`. */
const SEQUENCES: Readonly<Record<string, string>> = {
  figure: 'Figure',
  table: 'Table',
  equation: 'Equation',
}

export function sequenceName(kind: unknown): string {
  return SEQUENCES[typeof kind === 'string' ? kind : ''] ?? 'Figure'
}

/**
 * What a bookmark spans. A caption carries three, so each cross-reference
 * format reads back as it was written: the number alone, its label and
 * number, the whole caption. A heading carries one, over its text.
 */
export type BookmarkPart = 'number' | 'label' | 'full' | 'heading'

const PART_PREFIX: Readonly<Record<BookmarkPart, string>> = {
  number: 'N',
  label: 'L',
  full: 'F',
  heading: 'H',
}

/** Room for an id in a bookmark name: Word allows 40 characters, `_RefN_` takes six. */
const STEM_LENGTH = 34

/**
 * A hidden bookmark's name for the id: an underscore, then letters, digits
 * and underscores, 40 at most. Its stem is the id's own, made unique across
 * the export by {@link referenceIds}, since Word keeps one bookmark per name
 * and two long ids can shorten to the same one.
 */
export function bookmarkName(references: ReferenceIds, part: BookmarkPart, id: string): string {
  return `_Ref${PART_PREFIX[part]}_${references.stems.get(id) ?? stemOf(id)}`
}

function stemOf(id: string): string {
  return id.replace(/[^A-Za-z0-9]/g, '_').slice(0, STEM_LENGTH)
}

export function bookmarkStart(id: number, name: string): string {
  return `<w:bookmarkStart w:id="${id}" w:name="${escapeXML(name)}"/>`
}

export function bookmarkEnd(id: number): string {
  return `<w:bookmarkEnd w:id="${id}"/>`
}

/** A field held in one paragraph, with the runs it shows until Word computes it. */
export function simpleField(instruction: string, result: string): string {
  return `<w:fldSimple w:instr="${escapeXML(` ${instruction} `)}">${result}</w:fldSimple>`
}

/** The start of a field whose result spans paragraphs: a table of figures, an index. */
export function fieldBegin(instruction: string): string {
  return [
    '<w:r><w:fldChar w:fldCharType="begin"/></w:r>',
    `<w:r><w:instrText xml:space="preserve"> ${escapeXML(instruction)} </w:instrText></w:r>`,
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r>',
  ].join('')
}

export const FIELD_END = '<w:r><w:fldChar w:fldCharType="end"/></w:r>'

/**
 * An index entry as XE writes it: `entry:sub`, with the words' own
 * backslashes, colons and quotes escaped. Backslashes first: they are the
 * escape, and one left bare swallows the character after it.
 */
export function indexEntryText(entry: string, sub: string | null): string {
  const part = (words: string): string =>
    words.replace(/\\/g, '\\\\').replace(/"/g, "'").replace(/:/g, '\\:')
  return sub ? `${part(entry)}:${part(sub)}` : part(entry)
}

/** The ids a cross-reference can name, by what they belong to. */
export interface ReferenceIds {
  readonly captions: ReadonlySet<string>
  readonly headings: ReadonlySet<string>
  /** The headings Word numbers, top-level ones under heading numbering: `REF \r` reads theirs. */
  readonly numberedHeadings: ReadonlySet<string>
  /** Each id's bookmark stem, unique across the export. */
  readonly stems: ReadonlyMap<string, string>
}

/** Every caption and heading id in the document, found once for the whole export. */
export function referenceIds(doc: EditorNode): ReferenceIds {
  const captions = new Set<string>()
  const headings = new Set<string>()
  const stems = new Map<string, string>()
  const taken = new Set<string>()
  const name = (id: string): void => {
    if (stems.has(id)) return
    const base = stemOf(id)
    let stem = base
    for (let n = 2; taken.has(stem); n++) {
      const suffix = `_${n}`
      stem = `${base.slice(0, STEM_LENGTH - suffix.length)}${suffix}`
    }
    taken.add(stem)
    stems.set(id, stem)
  }
  const visit = (node: EditorNode): void => {
    const id = typeof node.attrs.id === 'string' ? node.attrs.id : null
    if (id && node.type.name === 'captionNumber') {
      captions.add(id)
      name(id)
    }
    if (id && node.type.name === 'heading') {
      headings.add(id)
      name(id)
    }
    for (const child of node.content.children) visit(child)
  }
  visit(doc)
  const numberedHeadings = new Set<string>()
  if (headingNumberingOf(doc)) {
    for (const child of doc.content.children) {
      if (child.type.name === 'heading' && typeof child.attrs.id === 'string') {
        numberedHeadings.add(child.attrs.id)
      }
    }
  }
  return { captions, headings, numberedHeadings, stems }
}

/**
 * A list attribute the editor keeps as JSON text (a table of figures'
 * entries, the index's), as plain objects; nothing for anything malformed.
 */
export function jsonEntries(value: unknown): Record<string, unknown>[] {
  if (typeof value !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
        )
      : []
  } catch {
    // Written by the editor; a hand-edited list that no longer parses is
    // written as an empty field, which Word fills when it updates it.
    return []
  }
}
