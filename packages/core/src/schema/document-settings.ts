import type { EditorNode } from '../model/node'
import { headingNumberingScheme } from './heading-numbering'
import { parseListSchemes, storedListSchemesAttr } from './list-numbering'
import { parseStoredStyles, storedStylesAttr } from './named-styles'

/**
 * Settings that belong to the whole document rather than to any one block,
 * the way Word keeps them in its settings part: heading numbering, the
 * document's direction, line numbers, hyphenation, widow and orphan control,
 * text columns, named styles, list schemes. They are the doc node's
 * attributes, so they travel with the file and undo like any edit.
 *
 * In HTML a document with any of them set is wrapped in one element carrying
 * them, `<div data-trevixal-document …>`; a document with none is written
 * exactly as it always was. The live editor puts the same attributes on its
 * editing surface, so one stylesheet draws the editor, a print and a saved
 * page alike.
 */

/** The attribute marking the element that carries a document's settings. */
export const DOCUMENT_ATTRIBUTE = 'data-trevixal-document'

/** A text direction a block or a document may store. */
export type TextDirection = 'ltr' | 'rtl'

/** Coerce a value to a text direction, or null for anything else. */
export function textDirection(value: unknown): TextDirection | null {
  return value === 'ltr' || value === 'rtl' ? value : null
}

/** Most text columns a document takes, as Word's Columns gallery offers them. */
export const MAX_COLUMNS = 3

/** A column count, clamped to 1 (the default) to {@link MAX_COLUMNS}. */
export function columnCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  return Math.min(MAX_COLUMNS, Math.max(1, Math.round(value)))
}

/** The doc node's attributes. Every default is "as documents always were". */
export function documentAttrs(): Record<string, { default?: unknown }> {
  return {
    // A numbered multilevel scheme's id (see heading-numbering.ts), or null.
    headingNumbering: { default: null },
    // `rtl`, or null for left to right.
    direction: { default: null },
    // Numbers in the margin beside every line, as Word's Line Numbers.
    lineNumbers: { default: false },
    // Words broken across lines at their syllables, as Word's Automatic hyphenation.
    hyphenation: { default: false },
    // Keep a paragraph's first and last lines off a page of their own, in
    // print and in Word. On, as in Word; off is stored.
    widowControl: { default: true },
    // Newspaper columns: the text flows down one column and on into the next.
    columns: { default: 1 },
    // A line between the columns, as Word's Line between.
    columnRule: { default: false },
    // Named styles' definitions, where they differ from the built-in look:
    // JSON, see named-styles.ts. Null is every style as it ships.
    styles: { default: null },
    // Multilevel list schemes the writer defined, as JSON (see
    // list-numbering.ts); the gallery offers them beside the built-in ones.
    listSchemes: { default: null },
  }
}

/** The HTML attributes a document's settings are written as; none when it has none. */
export function documentSettingsAttrs(doc: EditorNode): Record<string, string> {
  const attrs: Record<string, string> = {}
  const numbering = headingNumberingScheme(doc.attrs.headingNumbering)
  if (numbering) attrs['data-heading-numbering'] = numbering.id
  if (textDirection(doc.attrs.direction) === 'rtl') attrs.dir = 'rtl'
  if (doc.attrs.lineNumbers === true) attrs['data-line-numbers'] = ''
  if (doc.attrs.hyphenation === true) attrs['data-hyphenation'] = ''
  if (doc.attrs.widowControl === false) attrs['data-widow-control'] = 'off'
  const columns = columnCount(doc.attrs.columns)
  if (columns > 1) attrs['data-columns'] = String(columns)
  if (columns > 1 && doc.attrs.columnRule === true) attrs['data-column-rule'] = ''
  const styles = storedStylesAttr(parseStoredStyles(doc.attrs.styles))
  if (styles) attrs['data-styles'] = styles
  const schemes = storedListSchemesAttr(parseListSchemes(doc.attrs.listSchemes))
  if (schemes) attrs['data-list-schemes'] = schemes
  if (Object.keys(attrs).length > 0) attrs[DOCUMENT_ATTRIBUTE] = ''
  return attrs
}

/** Read a document's settings back from the element carrying them. Unknown values are dropped. */
export function parseDocumentSettings(element: Element): Record<string, unknown> {
  const attrs: Record<string, unknown> = {}
  const numbering = headingNumberingScheme(element.getAttribute('data-heading-numbering'))
  if (numbering) attrs.headingNumbering = numbering.id
  if (textDirection(element.getAttribute('dir')?.toLowerCase()) === 'rtl') attrs.direction = 'rtl'
  if (element.hasAttribute('data-line-numbers')) attrs.lineNumbers = true
  if (element.hasAttribute('data-hyphenation')) attrs.hyphenation = true
  if (element.getAttribute('data-widow-control') === 'off') attrs.widowControl = false
  const columns = columnCount(Number.parseInt(element.getAttribute('data-columns') ?? '', 10))
  if (columns > 1) attrs.columns = columns
  if (element.hasAttribute('data-column-rule')) attrs.columnRule = true
  const styles = storedStylesAttr(parseStoredStyles(element.getAttribute('data-styles')))
  if (styles) attrs.styles = styles
  const schemes = storedListSchemesAttr(parseListSchemes(element.getAttribute('data-list-schemes')))
  if (schemes) attrs.listSchemes = schemes
  return attrs
}

/**
 * The element carrying a document's settings, if the markup has one: our own
 * wrapper, anywhere near the top (a saved page nests it in the page's body).
 */
export function documentSettingsElement(root: ParentNode): Element | null {
  return root.querySelector(`[${DOCUMENT_ATTRIBUTE}]`)
}
