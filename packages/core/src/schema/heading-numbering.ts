import type { EditorNode } from '../model/node'
import { LIST_NUMBERING_SCHEMES, type ListNumberingScheme, listMarker } from './list-numbering'

/**
 * Heading numbering: `1.`, `1.1.`, `1.1.1.` down the outline, the way Word
 * numbers headings through a multilevel list linked to its heading styles.
 *
 * The scheme is a document setting (the doc node's `headingNumbering` attr),
 * and the schemes are the list gallery's numbered ones, so a heading and a
 * list item at the same depth under the same scheme read alike. Headings at
 * the top level of the document are numbered; one inside a callout, a column
 * or a table cell is not, as Word leaves a heading in a text box alone.
 *
 * The editor's stylesheet draws the numbers from CSS counters, and
 * {@link headingNumbers} computes the same ones for everything that has to
 * spell them out: cross-references, exports, the outline.
 */

/** The schemes headings can be numbered with, outline first: the usual choice. */
export const HEADING_NUMBERING_SCHEMES: readonly ListNumberingScheme[] = [
  'outline',
  'default',
  'parenthesis',
  'roman-outline',
]
  .map((id) => LIST_NUMBERING_SCHEMES.find((scheme) => scheme.id === id))
  .filter((scheme): scheme is ListNumberingScheme => scheme !== undefined)

/** A heading numbering scheme by id, or null for anything else. */
export function headingNumberingScheme(id: unknown): ListNumberingScheme | null {
  return HEADING_NUMBERING_SCHEMES.find((scheme) => scheme.id === id) ?? null
}

/** The scheme a document numbers its headings with, or null when it does not. */
export function headingNumberingOf(doc: EditorNode): ListNumberingScheme | null {
  return headingNumberingScheme(doc.attrs.headingNumbering)
}

/** Deepest heading level, and so the length of a number's parts. */
const HEADING_LEVELS = 6

export interface HeadingNumber {
  /** The heading's index among the document's top-level blocks. */
  readonly index: number
  readonly level: number
  /** Its number at every level, outermost first; a skipped level counts 0. */
  readonly numbers: readonly number[]
  /** The number as it is drawn: `2.1.`, `b.`, `II.`. */
  readonly label: string
}

/**
 * Every top-level heading's number, in document order; empty when the
 * document numbers no headings. A heading resets every level below its own,
 * and a level skipped on the way down counts 0 (`1.0.1.`), which is what the
 * stylesheet's counters and Word both draw.
 */
export function headingNumbers(doc: EditorNode): HeadingNumber[] {
  const scheme = headingNumberingOf(doc)
  if (!scheme) return []
  const counters: number[] = new Array(HEADING_LEVELS).fill(0)
  const found: HeadingNumber[] = []
  doc.content.children.forEach((child, index) => {
    if (child.type.name !== 'heading') return
    const level = clampLevel(child.attrs.level)
    counters[level - 1] = (counters[level - 1] as number) + 1
    for (let deeper = level; deeper < HEADING_LEVELS; deeper++) counters[deeper] = 0
    const numbers = counters.slice(0, level)
    found.push({ index, level, numbers, label: listMarker(scheme, numbers) })
  })
  return found
}

function clampLevel(level: unknown): number {
  const value = typeof level === 'number' ? Math.round(level) : 1
  return Math.min(HEADING_LEVELS, Math.max(1, value))
}
