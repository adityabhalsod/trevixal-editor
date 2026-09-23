import type { EditorNode } from '../model/node'
import { headingNumberingScheme } from './heading-numbering'

/**
 * Settings that belong to the whole document rather than to any one block,
 * the way Word keeps them in its settings part: heading numbering, the
 * document's direction, line numbers. They are the doc node's attributes, so
 * they travel with the file and undo like any edit.
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

/** The doc node's attributes. Every default is "as documents always were". */
export function documentAttrs(): Record<string, { default?: unknown }> {
  return {
    // A numbered multilevel scheme's id (see heading-numbering.ts), or null.
    headingNumbering: { default: null },
    // `rtl`, or null for left to right.
    direction: { default: null },
    // Numbers in the margin beside every line, as Word's Line Numbers.
    lineNumbers: { default: false },
  }
}

/** The HTML attributes a document's settings are written as; none when it has none. */
export function documentSettingsAttrs(doc: EditorNode): Record<string, string> {
  const attrs: Record<string, string> = {}
  const numbering = headingNumberingScheme(doc.attrs.headingNumbering)
  if (numbering) attrs['data-heading-numbering'] = numbering.id
  if (textDirection(doc.attrs.direction) === 'rtl') attrs.dir = 'rtl'
  if (doc.attrs.lineNumbers === true) attrs['data-line-numbers'] = ''
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
  return attrs
}

/**
 * The element carrying a document's settings, if the markup has one: our own
 * wrapper, anywhere near the top (a saved page nests it in the page's body).
 */
export function documentSettingsElement(root: ParentNode): Element | null {
  return root.querySelector(`[${DOCUMENT_ATTRIBUTE}]`)
}
