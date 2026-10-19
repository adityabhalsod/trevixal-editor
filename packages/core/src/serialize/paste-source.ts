/**
 * Where a piece of pasted HTML came from, and how to clean it up.
 *
 * Office suites do not write HTML for other people to read. Word ships an
 * XML island, conditional comments, hundreds of `mso-` style properties and
 * literal bullet glyphs; Google Docs wraps the whole selection in a `<b>` that
 * turns everything bold in any editor that takes the markup at face value.
 * Pasting either one straight into a document imports the mess along with the
 * words.
 *
 * This runs **before** the sanitizer, not instead of it. Nothing here is a
 * security measure. The allowlist in `parseHTML` is, and it still runs on
 * whatever comes out. This is about the *quality* of what survives.
 */

/** The producer of a clipboard payload, as far as its markup betrays. */
export type PasteSource = 'word' | 'excel' | 'google-docs' | 'html'

/** `<!--[if gte mso 9]>…<![endif]-->` and friends, including their contents. */
const CONDITIONAL_COMMENT = /<!--\[if[^\]]*\]>[\s\S]*?<!\[endif\]-->/gi
/** Word's XML island: `<xml>…</xml>`, plus the `<w:…>` tags it may leave loose. */
const XML_ISLAND = /<xml\b[^>]*>[\s\S]*?<\/xml>/gi
/**
 * Word's own stylesheet: tens of kilobytes of `mso-` rules describing the
 * document it came from. The sanitizer drops `<style>` anyway, so nothing is
 * lost by cutting it here; what is gained is not carrying it through the
 * parser first.
 */
const STYLE_BLOCK = /<style\b[^>]*>[\s\S]*?<\/style>/gi
/** `<o:p></o:p>`: Office paragraph markers that carry no content. */
const OFFICE_TAG = /<\/?[a-z]+:[a-z][^>]*>/gi
// Word quotes attributes with apostrophes and often not at all, `class=MsoNormal`
// is what it really writes. Matching only `class="…"` would leave every one of
// them in place, which is the whole point of these two passes.
/** A `style` attribute, however it happens to be quoted. */
const STYLE_ATTRIBUTE = /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
/** A `class` attribute, however it happens to be quoted, or not at all. */
const CLASS_ATTRIBUTE = /\sclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi
/** The span Word uses to hold a bullet it has already drawn. */
const MSO_LIST_IGNORE = /<span\b[^>]*mso-list\s*:\s*ignore[^>]*>[\s\S]*?<\/span>/gi
/** Google's wrapper: a `<b>` whose only job is to carry an id. */
const GOOGLE_BOLD_WRAPPER = /<b\b[^>]*id\s*=\s*"docs-internal-guid[^"]*"[^>]*>([\s\S]*)<\/b>/i
/** `font-weight:400` and `font-weight:normal` mean "not bold", so say nothing. */
const NORMAL_WEIGHT = /^font-weight\s*:\s*(400|normal)$/i
/** A single CSS declaration Word invented for itself. */
const MSO_DECLARATION = /^\s*mso-/i
/**
 * A paragraph Word draws as a list item: no list markup, only its level in
 * the style (`mso-list:l0 level2 lfo1`) and its bullet or number as text.
 */
const WORD_LIST_PARAGRAPH = /<p\b[^>]*?mso-list\s*:\s*l\d+\s+level(\d+)[^>]*>([\s\S]*?)<\/p>/gi
/** The bullet or number Word wrote into a list paragraph, inside its ignored span. */
const WORD_LIST_MARKER = /<span\b[^>]*mso-list\s*:\s*ignore[^>]*>([\s\S]*?)<\/span>/i
/** `1.`, `a)`, `iv.`: a marker that counts, so the list is numbered. */
const ORDERED_MARKER = /^(?:\d+|[a-z]|[ivxlcdm]+)[.)]/i
/**
 * What Google Docs writes on every paragraph and run whatever the writer
 * chose: its own default spacing, font, size and black. Kept, they made a
 * paste look unlike the document around it, and black text vanish on a dark
 * theme.
 */
const GOOGLE_DEFAULT_DECLARATION =
  /^(?:line-height\s*:\s*1\.(?:38|2)|margin-(?:top|bottom)\s*:\s*0(?:pt|px)?|font-size\s*:\s*11pt|font-family\s*:\s*Arial\s*,\s*sans-serif|color\s*:\s*#000000|background-color\s*:\s*transparent)$/i
/** `dir="ltr"`, which Google Docs puts on every block of a left-to-right document. */
const GOOGLE_LTR = /\sdir\s*=\s*"ltr"/gi

/**
 * A code editor's copy: VS Code writes each line as a `<div>` of coloured
 * spans inside one `<div style="white-space: pre">`. As markup it is a page
 * of one-line paragraphs, its indentation collapsed, so the plain text is
 * what a paste should take, as code. On Windows the clipboard wraps the
 * fragment in `<html><body><!--StartFragment-->` first.
 */
const CODE_EDITOR_HTML =
  /^\s*(?:<html\b[^>]*>\s*)?(?:<body\b[^>]*>\s*)?(?:<!--StartFragment-->\s*)?(?:<meta\b[^>]*>\s*)?<div\b[^>]*\bstyle\s*=\s*"[^"]*white-space\s*:\s*pre/i

/** Whether pasted HTML is a code editor's lines rather than a document. */
export function isCodeEditorHTML(html: string): boolean {
  return CODE_EDITOR_HTML.test(html)
}

/**
 * Which application produced this HTML.
 *
 * The markers are the ones each application writes into every payload, not
 * heuristics over the content: a document that merely mentions Word is not
 * from Word.
 */
export function detectPasteSource(html: string): PasteSource {
  if (/id\s*=\s*"docs-internal-guid/i.test(html)) return 'google-docs'
  if (/urn:schemas-microsoft-com:office:excel/i.test(html)) return 'excel'
  if (/content\s*=\s*"?Microsoft Excel/i.test(html)) return 'excel'
  if (/urn:schemas-microsoft-com:office:word/i.test(html)) return 'word'
  if (/content\s*=\s*"?Microsoft Word/i.test(html)) return 'word'
  // `class=MsoNormal` without the namespace happens when only a fragment of
  // the clipboard payload survived whatever passed it along.
  if (/class\s*=\s*"?Mso[A-Z]/.test(html)) return 'word'
  if (/\bmso-[a-z-]+\s*:/i.test(html)) return 'word'
  return 'html'
}

/**
 * Strip what the source application added for itself.
 *
 * Returns the input unchanged for ordinary web HTML: paying the cost of these
 * passes on every paste, to fix markup that was never broken, is how a paste
 * becomes noticeably slow.
 */
export function cleanPastedHTML(
  html: string,
  source: PasteSource = detectPasteSource(html),
): string {
  if (source === 'html') return html
  let cleaned = html
  if (source === 'google-docs') {
    // The famous one: Google wraps the selection in `<b style="font-weight:
    // normal">`. An editor that trusts the tag makes the entire paste bold.
    const wrapper = GOOGLE_BOLD_WRAPPER.exec(cleaned)
    if (wrapper?.[1] !== undefined) cleaned = wrapper[1]
    cleaned = cleaned.replace(GOOGLE_LTR, '')
  } else {
    cleaned = wordLists(
      cleaned.replace(CONDITIONAL_COMMENT, '').replace(XML_ISLAND, '').replace(STYLE_BLOCK, ''),
    )
      .replace(MSO_LIST_IGNORE, '')
      .replace(OFFICE_TAG, '')
  }
  const google = source === 'google-docs'
  return cleaned
    .replace(STYLE_ATTRIBUTE, (_match, doubled?: string, single?: string) =>
      cleanStyleAttribute(doubled ?? single ?? '', google),
    )
    .replace(CLASS_ATTRIBUTE, cleanClassAttribute)
}

/**
 * Word's list paragraphs as lists: a run of them, with nothing but space
 * between, becomes one list, nested by each paragraph's level, numbered when
 * its marker counts and bulleted otherwise. Without this a pasted list
 * arrived as plain paragraphs, its bullets gone with the span that held them.
 */
function wordLists(html: string): string {
  let out = ''
  let cursor = 0
  const open: string[] = []
  const closeTo = (depth: number): string => {
    let closing = ''
    while (open.length > depth) closing += `</li></${open.pop()}>`
    return closing
  }
  for (const match of html.matchAll(WORD_LIST_PARAGRAPH)) {
    const index = match.index ?? 0
    const gap = html.slice(cursor, index)
    if (gap.trim() !== '' || open.length === 0) out += closeTo(0) + gap
    const level = Math.max(1, Number(match[1]))
    const body = match[2] ?? ''
    const marker = (WORD_LIST_MARKER.exec(body)?.[1] ?? '').replace(/<[^>]*>|&nbsp;/g, '').trim()
    const tag = ORDERED_MARKER.test(marker) ? 'ol' : 'ul'
    if (level <= open.length) {
      out += `${closeTo(level)}</li>`
      // A numbered list after a bulleted one at the same level is a new list.
      if (open[level - 1] !== tag) {
        out += `</${open.pop()}><${tag}>`
        open.push(tag)
      }
    } else {
      while (open.length < level) {
        out += `<${tag}>`
        open.push(tag)
      }
    }
    out += `<li>${body}`
    cursor = index + match[0].length
  }
  return out + closeTo(0) + html.slice(cursor)
}

/**
 * Drop `mso-*` and no-op weights, and Google Docs' defaults from its paste;
 * keep every declaration a browser understands.
 */
function cleanStyleAttribute(declarations: string, google: boolean): string {
  const kept = declarations
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(
      (declaration) =>
        declaration.length > 0 &&
        !MSO_DECLARATION.test(declaration) &&
        !NORMAL_WEIGHT.test(declaration) &&
        !(google && GOOGLE_DEFAULT_DECLARATION.test(declaration)),
    )
  return kept.length > 0 ? ` style="${kept.join('; ')}"` : ''
}

/** Drop `Mso*` class names; keep anything the author actually chose. */
function cleanClassAttribute(
  _match: string,
  doubled?: string,
  single?: string,
  bare?: string,
): string {
  const kept = (doubled ?? single ?? bare ?? '')
    .split(/\s+/)
    .filter((name) => name.length > 0 && !/^Mso/.test(name))
  return kept.length > 0 ? ` class="${kept.join(' ')}"` : ''
}
