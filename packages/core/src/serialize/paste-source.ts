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
  } else {
    cleaned = cleaned
      .replace(CONDITIONAL_COMMENT, '')
      .replace(XML_ISLAND, '')
      .replace(STYLE_BLOCK, '')
      .replace(MSO_LIST_IGNORE, '')
      .replace(OFFICE_TAG, '')
  }
  return cleaned
    .replace(STYLE_ATTRIBUTE, cleanStyleAttribute)
    .replace(CLASS_ATTRIBUTE, cleanClassAttribute)
}

/** Drop `mso-*` and no-op weights; keep every declaration a browser understands. */
function cleanStyleAttribute(_match: string, doubled?: string, single?: string): string {
  const kept = (doubled ?? single ?? '')
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(
      (declaration) =>
        declaration.length > 0 &&
        !MSO_DECLARATION.test(declaration) &&
        !NORMAL_WEIGHT.test(declaration),
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
