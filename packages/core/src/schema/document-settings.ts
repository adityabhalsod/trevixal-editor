import type { EditorNode } from '../model/node'
import { headingNumberingScheme } from './heading-numbering'
import { parseListSchemes, storedListSchemesAttr } from './list-numbering'
import { parseStoredStyles, storedStylesAttr } from './named-styles'
import { columnCount, pageSetupAttr } from './page-setup'

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

// Columns are page layout, so they are defined with it; they are exported
// here too, where the document settings have always offered them.
export { MAX_COLUMNS, columnCount } from './page-setup'

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
    // A Markdown file's front matter, the YAML between its `---` lines, kept
    // as written so it goes back out the same.
    frontMatter: { default: null },
    // Template variables, as JSON: `{"plan": "pro"}`. A block shown only when
    // one is set reads them (see extension-blocks).
    variables: { default: null },
    // The theme saved with the document, as a theme file's JSON; the UI
    // checks it before it paints anything with it.
    theme: { default: null },
    // Comment threads, as JSON; the text each is on carries a `comment` mark
    // with its id (see extension-comments).
    comments: { default: null },
    // A digital signature over the rest of the document, as JSON (see
    // extension-security); it signs everything but itself.
    signature: { default: null },
    // The paper, margins, header, footer and watermark, as JSON (see
    // page-setup.ts). Null is A4 with 20 mm margins.
    pageSetup: { default: null },
  }
}

/** The longest stored signature kept: a key and a signature are a few hundred bytes. */
const DOCUMENT_SIGNATURE_MAX = 4000

/** A document's stored signature as JSON, or null for none. */
export function documentSignatureOf(value: unknown): string | null {
  return typeof value === 'string' && value !== '' && value.length <= DOCUMENT_SIGNATURE_MAX
    ? value
    : null
}

/** The longest stored comment data kept, generous for a long review. */
const DOCUMENT_COMMENTS_MAX = 500_000

/** A document's stored comment threads as JSON, or null for none. */
export function documentCommentsOf(value: unknown): string | null {
  return typeof value === 'string' && value !== '' && value.length <= DOCUMENT_COMMENTS_MAX
    ? value
    : null
}

/** The longest saved theme kept: a full palette is well under it. */
const DOCUMENT_THEME_MAX = 8000

/** A document's saved theme as stored, or null for none, or one too long to be a theme. */
export function documentThemeOf(value: unknown): string | null {
  return typeof value === 'string' && value !== '' && value.length <= DOCUMENT_THEME_MAX
    ? value
    : null
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
  const frontMatter = frontMatterOf(doc.attrs.frontMatter)
  if (frontMatter) attrs['data-front-matter'] = frontMatter
  const variables = storedVariables(templateVariables(doc.attrs.variables))
  if (variables) attrs['data-variables'] = variables
  const theme = documentThemeOf(doc.attrs.theme)
  if (theme) attrs['data-document-theme'] = theme
  const comments = documentCommentsOf(doc.attrs.comments)
  if (comments) attrs['data-comments'] = comments
  const signature = documentSignatureOf(doc.attrs.signature)
  if (signature) attrs['data-signature'] = signature
  const pageSetup = pageSetupAttr(doc.attrs.pageSetup)
  if (pageSetup) attrs['data-page-setup'] = pageSetup
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
  const frontMatter = frontMatterOf(element.getAttribute('data-front-matter'))
  if (frontMatter) attrs.frontMatter = frontMatter
  const variables = storedVariables(templateVariables(element.getAttribute('data-variables')))
  if (variables) attrs.variables = variables
  const theme = documentThemeOf(element.getAttribute('data-document-theme'))
  if (theme) attrs.theme = theme
  const comments = documentCommentsOf(element.getAttribute('data-comments'))
  if (comments) attrs.comments = comments
  const signature = documentSignatureOf(element.getAttribute('data-signature'))
  if (signature) attrs.signature = signature
  const pageSetup = pageSetupAttr(element.getAttribute('data-page-setup'))
  if (pageSetup) attrs.pageSetup = pageSetup
  return attrs
}

/** The longest name and value a template variable keeps. */
const VARIABLE_NAME = /^[A-Za-z_][\w-]{0,39}$/
const VARIABLE_VALUE_MAX = 200

/**
 * A document's template variables as a map, from its stored JSON: names are
 * identifiers, values text, and anything else is dropped.
 */
export function templateVariables(value: unknown): Record<string, string> {
  if (typeof value !== 'string' || !value) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const out: Record<string, string> = {}
  for (const [name, entry] of Object.entries(parsed as Record<string, unknown>)) {
    if (VARIABLE_NAME.test(name) && typeof entry === 'string')
      out[name] = entry.slice(0, VARIABLE_VALUE_MAX)
  }
  return out
}

/** Template variables as the document stores them; null for none. */
export function storedVariables(variables: Readonly<Record<string, string>>): string | null {
  const names = Object.keys(variables)
    .filter((name) => VARIABLE_NAME.test(name))
    .sort()
  if (names.length === 0) return null
  const sorted: Record<string, string> = {}
  for (const name of names) sorted[name] = (variables[name] ?? '').slice(0, VARIABLE_VALUE_MAX)
  return JSON.stringify(sorted)
}

/** Front matter as a document keeps it: the text between the fences, or null for none. */
export function frontMatterOf(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/\r\n?/g, '\n').replace(/^\n+|\s+$/g, '')
  return text.length > 0 ? text : null
}

/**
 * The element carrying a document's settings, if the markup has one: our own
 * wrapper, anywhere near the top (a saved page nests it in the page's body).
 */
export function documentSettingsElement(root: ParentNode): Element | null {
  return root.querySelector(`[${DOCUMENT_ATTRIBUTE}]`)
}
