import type { EditorNode, Mark, MarkSpec, NodeSpec } from '@trevixal/core'
import { escapeHTML, formatListCounter, safeElementId } from '@trevixal/core'
import { safeAnchorId } from './ids'

/**
 * A document's reference apparatus, as Word builds it out of fields: caption
 * numbers (SEQ), cross-references (REF), tables of figures (TOC \c), an index
 * (XE and INDEX) and endnotes beside the footnotes.
 *
 * A field's result is kept in the document, in the node's own attributes,
 * the way Word keeps the result between a field's code and its end. So every
 * serializer (HTML, Markdown, Word, RTF, plain text) writes what the reader
 * sees without computing anything, and `fields.ts` brings the results up to
 * date as part of each edit, which is also why one undo takes back both.
 */

/** What a caption numbers: each kind counts on its own, as Word's SEQ Figure and SEQ Table do. */
export type CaptionKind = 'figure' | 'table' | 'equation'

export const CAPTION_KINDS: readonly CaptionKind[] = ['figure', 'table', 'equation']

/** Coerce a value to a caption kind, falling back to `figure`. */
export function captionKind(value: unknown): CaptionKind {
  return CAPTION_KINDS.includes(value as CaptionKind) ? (value as CaptionKind) : 'figure'
}

/**
 * What a cross-reference shows of its target, after Word's "Insert reference
 * to" list: `label` is "Figure 2", `number` is "2", `text` is the caption or
 * heading text alone, and `full` is all of it, "Figure 2: A cat".
 */
export type CrossReferenceFormat = 'label' | 'number' | 'text' | 'full'

export const CROSS_REFERENCE_FORMATS: readonly CrossReferenceFormat[] = [
  'label',
  'number',
  'text',
  'full',
]

export function crossReferenceFormat(value: unknown): CrossReferenceFormat {
  return CROSS_REFERENCE_FORMATS.includes(value as CrossReferenceFormat)
    ? (value as CrossReferenceFormat)
    : 'label'
}

/** What a cross-reference reads when its target has gone, as Word's "Error! Reference source not found." */
export const MISSING_REFERENCE = 'Reference not found'

/** One line of a table of figures: the caption's id and its whole text. */
export interface CaptionListEntry {
  readonly id: string
  readonly text: string
}

/** One place an index entry points to, and what the link to it reads. */
export interface IndexLocation {
  readonly id: string
  readonly label: string
}

export interface IndexEntry {
  readonly term: string
  readonly locations: readonly IndexLocation[]
  readonly subentries: readonly {
    readonly term: string
    readonly locations: readonly IndexLocation[]
  }[]
}

/**
 * A list attribute kept as JSON text. A string compares by value, so an
 * unchanged list is an unchanged attribute and the node is left alone; an
 * array would be a new object on every update and redraw every time.
 */
export function readJSONList<T>(value: unknown, accept: (item: unknown) => item is T): T[] {
  if (typeof value !== 'string' || value.length === 0) return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter(accept) : []
  } catch {
    // Written by us, so a parse failure means a hand-edited file: treat it as
    // no entries, and the next update writes a correct list over it.
    return []
  }
}

export function isCaptionListEntry(item: unknown): item is CaptionListEntry {
  const entry = item as CaptionListEntry
  return typeof entry?.id === 'string' && typeof entry.text === 'string'
}

function isIndexLocation(item: unknown): item is IndexLocation {
  const location = item as IndexLocation
  return typeof location?.id === 'string' && typeof location.label === 'string'
}

export function isIndexEntry(item: unknown): item is IndexEntry {
  const entry = item as IndexEntry
  return (
    typeof entry?.term === 'string' &&
    Array.isArray(entry.locations) &&
    entry.locations.every(isIndexLocation) &&
    Array.isArray(entry.subentries) &&
    entry.subentries.every(
      (sub) =>
        typeof sub?.term === 'string' &&
        Array.isArray(sub.locations) &&
        sub.locations.every(isIndexLocation),
    )
  )
}

/** A positive integer, or null: caption numbers and footnote ids alike. */
function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

/** A link inside a generated list: a span, since an `<a href>` imports as a link mark. */
function linkHTML(id: string, text: string): string {
  return `<span class="trevixal-ref-link" data-href="#${escapeHTML(id)}">${escapeHTML(text)}</span>`
}

const EMPTY_LIST: Readonly<Record<CaptionKind, string>> = {
  figure: 'No figures in this document',
  table: 'No tables in this document',
  equation: 'No equations in this document',
}

/** The markup a table of figures shows for its entries. Everything in it is escaped. */
export function captionListHTML(kind: CaptionKind, entries: readonly CaptionListEntry[]): string {
  if (entries.length === 0) {
    return `<p class="trevixal-caption-list__empty">${EMPTY_LIST[kind]}</p>`
  }
  const items = entries.map((entry) => `<li>${linkHTML(entry.id, entry.text)}</li>`).join('')
  return `<ol class="trevixal-caption-list__items">${items}</ol>`
}

function locationsHTML(locations: readonly IndexLocation[]): string {
  return locations.map((location) => linkHTML(location.id, location.label)).join(', ')
}

/** The markup an index shows: its entries under their initial letters. Everything in it is escaped. */
export function indexHTML(entries: readonly IndexEntry[]): string {
  if (entries.length === 0) {
    return '<p class="trevixal-index__empty">No index entries in this document</p>'
  }
  const groups = new Map<string, IndexEntry[]>()
  for (const entry of entries) {
    const letter = entry.term.charAt(0).toLocaleUpperCase()
    groups.set(letter, [...(groups.get(letter) ?? []), entry])
  }
  let html = ''
  for (const [letter, group] of groups) {
    html += `<div class="trevixal-index__group"><p class="trevixal-index__letter">${escapeHTML(letter)}</p><ul>`
    for (const entry of group) {
      const own = entry.locations.length > 0 ? `, ${locationsHTML(entry.locations)}` : ''
      const subs = entry.subentries
        .map((sub) => `<li>${escapeHTML(sub.term)}, ${locationsHTML(sub.locations)}</li>`)
        .join('')
      html += `<li>${escapeHTML(entry.term)}${own}${subs ? `<ul>${subs}</ul>` : ''}</li>`
    }
    html += '</ul></div>'
  }
  return html
}

/** How an endnote's number is drawn: i, ii, iii, as Word numbers endnotes by default. */
export function endnoteLabel(id: unknown): string {
  const n = typeof id === 'string' ? Number.parseInt(id, 10) : Number.NaN
  return Number.isInteger(n) && n > 0 ? formatListCounter(n, 'lower-roman') : String(id ?? '')
}

/** The reference nodes: merged into {@link blockNodes}, so a kit schema has them all. */
export function referenceNodes(): Record<string, NodeSpec> {
  return {
    // "Figure 3": the 3. It sits in a caption's text beside the label a
    // reader can edit ("Figure", "Fig.", "Abbildung"), exactly as Word's
    // caption is a label followed by a SEQ field.
    captionNumber: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { kind: { default: 'figure' }, id: { default: null }, number: { default: null } },
      toHTML: (node) => {
        const attrs: Record<string, string> = {
          class: 'trevixal-caption-number',
          'data-caption': captionKind(node.attrs.kind),
        }
        const id = safeElementId(node.attrs.id)
        if (id) attrs.id = id
        const number = positiveInteger(node.attrs.number)
        return { tag: 'span', attrs, text: number === null ? '' : String(number) }
      },
      parseHTML: [
        {
          tag: 'span',
          attribute: 'data-caption',
          getAttrs: (element) => ({
            kind: captionKind(element.getAttribute('data-caption')),
            id: safeElementId(element.getAttribute('id')),
            number: positiveInteger(Number.parseInt(element.textContent ?? '', 10)),
          }),
        },
      ],
    },

    crossReference: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { target: { default: null }, format: { default: 'label' }, text: { default: '' } },
      toHTML: (node) => {
        const target = safeElementId(node.attrs.target)
        const attrs: Record<string, string> = {
          class: 'trevixal-xref',
          'data-xref': target ?? '',
          'data-xref-format': crossReferenceFormat(node.attrs.format),
        }
        if (target) attrs['data-href'] = `#${target}`
        const text = typeof node.attrs.text === 'string' ? node.attrs.text : ''
        return { tag: 'span', attrs, text: text || MISSING_REFERENCE }
      },
      parseHTML: [
        {
          tag: 'span',
          attribute: 'data-xref',
          getAttrs: (element) => ({
            target: safeElementId(element.getAttribute('data-xref')),
            format: crossReferenceFormat(element.getAttribute('data-xref-format')),
            text: element.textContent ?? '',
          }),
        },
      ],
    },

    // Word's Table of Figures, for one caption kind: its entries are kept as
    // JSON text (see readJSONList) and brought up to date with the captions.
    captionList: {
      group: 'block',
      atom: true,
      attrs: { kind: { default: 'figure' }, entries: { default: '[]' } },
      toHTML: (node) => {
        const kind = captionKind(node.attrs.kind)
        return {
          tag: 'nav',
          attrs: { class: 'trevixal-caption-list', 'data-caption-list': kind },
          innerHTML: captionListHTML(kind, readJSONList(node.attrs.entries, isCaptionListEntry)),
        }
      },
      // The entries are derived, so they are not read back: the next update
      // rebuilds them from the captions in the document.
      parseHTML: [
        {
          tag: 'nav',
          attribute: 'data-caption-list',
          getAttrs: (element) => ({ kind: captionKind(element.getAttribute('data-caption-list')) }),
        },
      ],
    },

    documentIndex: {
      group: 'block',
      atom: true,
      attrs: { entries: { default: '[]' } },
      toHTML: (node) => ({
        tag: 'div',
        attrs: { class: 'trevixal-index', 'data-document-index': 'true' },
        innerHTML: indexHTML(readJSONList(node.attrs.entries, isIndexEntry)),
      }),
      parseHTML: [{ tag: 'div', attribute: 'data-document-index' }],
    },

    // Endnotes mirror footnotes: a reference where the note is cited, and the
    // note's body in a list that sits at the very end of the document.
    endnoteRef: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { id: {} },
      // A <span>, as footnoteRef explains: <sup> and <a> import as marks.
      toHTML: (node) => {
        const id = safeAnchorId(node.attrs.id)
        const attrs: Record<string, string> = { class: 'trevixal-endnote-ref' }
        if (!id) return { tag: 'span', attrs }
        return {
          tag: 'span',
          attrs: { ...attrs, id: `enref-${id}`, 'data-endnote': id, 'data-href': `#en-${id}` },
          text: endnoteLabel(id),
        }
      },
      parseHTML: [
        {
          tag: 'span',
          attribute: 'data-endnote',
          getAttrs: (element) => {
            const id = safeAnchorId(element.getAttribute('data-endnote'))
            return id ? { id } : false
          },
        },
      ],
    },
    endnoteList: {
      content: 'endnoteItem+',
      group: 'block',
      toHTML: () => ({ tag: 'ol', attrs: { class: 'trevixal-endnotes', 'data-endnotes': 'true' } }),
      parseHTML: [{ tag: 'ol', attribute: 'data-endnotes' }],
    },
    endnoteItem: {
      content: 'block+',
      attrs: { id: {} },
      toHTML: (node) => {
        const id = safeAnchorId(node.attrs.id)
        const attrs: Record<string, string> = { class: 'trevixal-endnotes__item' }
        if (id) {
          attrs.id = `en-${id}`
          attrs['data-endnote'] = id
        }
        return { tag: 'li', attrs }
      },
      parseHTML: [
        {
          tag: 'li',
          attribute: 'data-endnote',
          getAttrs: (element) => {
            const id = safeAnchorId(element.getAttribute('data-endnote'))
            return id ? { id } : false
          },
        },
      ],
    },
  }
}

/**
 * The index mark: the marked words are an index entry, filed under `entry`
 * (the words themselves when null) and, when given, the subentry `sub`, as
 * Word's XE field files "apple:red". `id` is what the index links to; it is
 * written as `data-index-term`, not `id`, because a mark broken by bold in the
 * middle is written as two spans, and two elements may not share an id.
 */
export function referenceMarks(): Record<string, MarkSpec> {
  return {
    indexTerm: {
      attrs: { id: { default: null }, entry: { default: null }, sub: { default: null } },
      toHTML: (mark: Mark) => {
        const attrs: Record<string, string> = { class: 'trevixal-index-term' }
        attrs['data-index-term'] = safeAnchorId(mark.attrs.id) ?? ''
        const entry = indexWords(mark.attrs.entry)
        if (entry) attrs['data-index-entry'] = entry
        const sub = indexWords(mark.attrs.sub)
        if (sub) attrs['data-index-sub'] = sub
        return { tag: 'span', attrs }
      },
      parseHTML: [
        {
          tag: 'span',
          attribute: 'data-index-term',
          getAttrs: (element) => ({
            id: safeAnchorId(element.getAttribute('data-index-term')),
            entry: indexWords(element.getAttribute('data-index-entry')),
            sub: indexWords(element.getAttribute('data-index-sub')),
          }),
        },
      ],
    },
  }
}

/** Entry text as stored: trimmed, bounded, and null when there is none. */
export function indexWords(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed.length === 0 ? null : trimmed.slice(0, 200)
}

/** The text of inline nodes, with each atom read as the text it draws. */
export function drawnText(nodes: readonly EditorNode[]): string {
  let text = ''
  for (const node of nodes) {
    if (node.isText) text += node.textContent
    else text += String(node.type.spec.toHTML?.(node)?.text ?? '')
  }
  return text
}
