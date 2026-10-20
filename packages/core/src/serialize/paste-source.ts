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
export type PasteSource = 'word' | 'excel' | 'google-docs' | 'google-sheets' | 'html'

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
 * A heading as Google Docs writes one: its default size and grey on the runs
 * inside, its default space above and below on itself. Kept, a pasted
 * heading looked unlike every other heading in the document.
 */
const GOOGLE_HEADING = /<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi
const GOOGLE_HEADING_DEFAULT =
  /^(?:font-size\s*:\s*\d+(?:\.\d+)?pt|color\s*:\s*#(?:000000|434343|666666)|margin-(?:top|bottom)\s*:\s*\d+(?:\.\d+)?pt|font-weight\s*:\s*(?:400|normal))$/i
/** The `<br>` Google Docs leaves between two blocks: a blank line nobody typed. */
const GOOGLE_STRAY_BREAK =
  /(<\/(?:p|ul|ol|table|div|h[1-6])>)\s*<br\s*\/?>\s*(?=<(?:p|ul|ol|table|div|h[1-6])\b)/gi

/** A block's opening tag, whose own style is the page's layout, not the words'. */
const BLOCK_TAG =
  /<(p|h[1-6]|li|ul|ol|div|blockquote|table|tbody|tr|td|th|section|article)\b([^>]*)>/gi
/**
 * What a web page or a word processor sets on a block for its own layout:
 * margins, padding, no indent, a white or clear ground. Taken as the pasted
 * block's own, they left gaps and white boxes (on a dark theme too) that the
 * writer never chose.
 */
const LAYOUT_DECLARATIONS: readonly RegExp[] = [
  /^(?:margin|padding)(?:-[a-z]+)?\s*:/i,
  /^text-indent\s*:\s*0(?:px|pt|em|in|cm)?$/i,
  /^background(?:-color)?\s*:\s*(?:#fff(?:fff)?|white|transparent|rgba?\(\s*255\s*,\s*255\s*,\s*255\s*(?:,\s*1\s*)?\)|rgba\([^)]*,\s*0\s*\)|inherit|initial|none)$/i,
]
/** The line spacing a writer chooses on purpose: one and a half lines or more. */
const DELIBERATE_SPACING = 1.5

/**
 * Whether a declaration is a block's own layout rather than its look: one of
 * `LAYOUT_DECLARATIONS`, or line spacing under one and a half lines, which
 * is each application's single spacing (`normal`, `107%`, `1.38`, `24px`).
 */
function isLayout(declaration: string): boolean {
  if (LAYOUT_DECLARATIONS.some((pattern) => pattern.test(declaration))) return true
  const spacing = /^line-height\s*:\s*(.+)$/i.exec(declaration)?.[1]?.trim()
  if (spacing === undefined) return false
  const multiple = /^\d*\.?\d+$/.test(spacing)
    ? Number(spacing)
    : /^\d*\.?\d+%$/.test(spacing)
      ? Number.parseFloat(spacing) / 100
      : 0
  return multiple < DELIBERATE_SPACING
}
/**
 * A spreadsheet's table as it lays itself out: a width of nothing, fixed
 * columns, a row's pixel height, a cell's bottom alignment, padding and grid.
 */
const SHEET_DECLARATIONS: readonly RegExp[] = [
  /^width\s*:\s*0(?:px)?$/i,
  /^vertical-align\s*:\s*bottom$/i,
  /^(?:table-layout|height|overflow|padding|border)(?:-[a-z]+)?\s*:/i,
]
const isSheetLayout = (declaration: string): boolean =>
  SHEET_DECLARATIONS.some((pattern) => pattern.test(declaration))
/** A web page's rule round a block, a heading's underline: the site's, not the words'. */
const BORDER_DECLARATION = /^border(?:-[a-z]+)*\s*:/i
/** A cell's run-level look, which the words inside have to carry to keep it. */
const RUN_DECLARATION =
  /^(?:font-weight|font-style|color|text-decoration|font-size|font-family)\s*:/i
/** A cell, with its style and its content. */
const CELL = /<(td|th)\b([^>]*?)\sstyle\s*=\s*"([^"]*)"([^>]*)>([\s\S]*?)<\/\1>/gi
/** An Excel class rule in its stylesheet: `.xl65 {font-weight:700;}`. */
const EXCEL_CLASS_RULE = /\.(xl\d+)\s*\{([^}]*)\}/gi
/** A Notion to-do's box, as it copies one. */
const NOTION_CHECKBOX = /<div\b[^>]*class\s*=\s*"[^"]*\bcheckbox-(on|off)\b[^"]*"[^>]*>\s*<\/div>/gi

/**
 * A code editor's copy: VS Code writes each line as a `<div>` of coloured
 * spans inside one `<div style="white-space: pre">`. As markup it is a page
 * of one-line paragraphs, its indentation collapsed, so the plain text is
 * what a paste should take, as code. On Windows the clipboard wraps the
 * fragment in `<html><body><!--StartFragment-->` first.
 */
const CODE_EDITOR_HTML =
  /^\s*(?:<html\b[^>]*>\s*)?(?:<body\b[^>]*>\s*)?(?:<!--StartFragment-->\s*)?(?:<meta\b[^>]*>\s*)?<div\b[^>]*\bstyle\s*=\s*"[^"]*white-space\s*:\s*pre/i

/** Markdown's marks at the start of a line: a heading, a list item, a quote, a fence, a table rule. */
const MARKDOWN_BLOCK =
  /^(?:#{1,6}\s+\S|\s{0,3}(?:[-*+]|\d{1,9}[.)])\s+\S|\s{0,3}>\s?\S|\s{0,3}(?:```|~~~)|\|?\s*:?-{3,}:?\s*\|)/
/** Markdown's inline marks: strong, a link, inline code. */
const MARKDOWN_INLINE = /\*\*[^*\n]+\*\*|__[^_\n]+__|\[[^\]\n]+\]\([^)\s]+\)|`[^`\n]+`/
/** A fenced code block's fence. */
const MARKDOWN_FENCE = /^\s{0,3}(?:```|~~~)/m

/**
 * Whether pasted plain text is Markdown, as a chat app's copy button or a
 * `.md` file gives it: a code fence, two lines marked up as blocks, or one
 * with inline marks beside it. Single lines never are: a pasted `**` alone
 * is the writer's text.
 */
export function looksLikeMarkdown(text: string): boolean {
  const lines = text.split(/\r?\n/)
  if (lines.length < 2) return false
  if (MARKDOWN_FENCE.test(text)) return true
  const marked = lines.filter((line) => MARKDOWN_BLOCK.test(line)).length
  return marked >= 2 || (marked >= 1 && MARKDOWN_INLINE.test(text))
}

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
  if (/<google-sheets-html-origin|data-sheets-root/i.test(html)) return 'google-sheets'
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
 * Ordinary web HTML gets one light pass, over its blocks' own styles: a page
 * copied from a browser carries its layout inline, which is not the words'.
 */
export function cleanPastedHTML(
  html: string,
  source: PasteSource = detectPasteSource(html),
): string {
  if (source === 'html') {
    // A Notion to-do's box as the checkbox a task list reads.
    return blockLayout(
      html.replace(NOTION_CHECKBOX, (_match, state: string) =>
        state === 'on' ? '<input type="checkbox" checked>' : '<input type="checkbox">',
      ),
      true,
    )
  }
  let cleaned = html
  if (source === 'google-docs') {
    // The famous one: Google wraps the selection in `<b style="font-weight:
    // normal">`. An editor that trusts the tag makes the entire paste bold.
    const wrapper = GOOGLE_BOLD_WRAPPER.exec(cleaned)
    if (wrapper?.[1] !== undefined) cleaned = wrapper[1]
    cleaned = cleaned
      .replace(GOOGLE_LTR, '')
      .replace(GOOGLE_STRAY_BREAK, '$1')
      .replace(GOOGLE_HEADING, (_match, level: string, attributes: string, inner: string) => {
        const plain = (text: string): string =>
          text.replace(STYLE_ATTRIBUTE, (_style, doubled?: string, single?: string) =>
            keptStyle(
              doubled ?? single ?? '',
              (declaration) => !GOOGLE_HEADING_DEFAULT.test(declaration),
            ),
          )
        return `<h${level}${plain(attributes)}>${plain(inner)}</h${level}>`
      })
  } else {
    // Excel keeps a cell's look in its stylesheet's classes, which go with it.
    if (source === 'excel') cleaned = inlineExcelClasses(cleaned)
    cleaned = wordLists(
      cleaned.replace(CONDITIONAL_COMMENT, '').replace(XML_ISLAND, '').replace(STYLE_BLOCK, ''),
    )
      .replace(MSO_LIST_IGNORE, '')
      .replace(OFFICE_TAG, '')
  }
  const google = source === 'google-docs'
  const normalized = cleaned
    .replace(STYLE_ATTRIBUTE, (_match, doubled?: string, single?: string) =>
      cleanStyleAttribute(doubled ?? single ?? '', google),
    )
    .replace(CLASS_ATTRIBUTE, cleanClassAttribute)
  // Every style double-quoted by now, as the spreadsheet pass reads them.
  const sheet = source === 'excel' || source === 'google-sheets'
  return blockLayout(sheet ? sheetCells(normalized) : normalized)
}

/** A `style` attribute holding the declarations `keep` accepts, quoted safely; empty when none. */
function keptStyle(declarations: string, keep: (declaration: string) => boolean): string {
  const kept = declarations
    .split(';')
    .map((declaration) => declaration.trim())
    .filter((declaration) => declaration.length > 0 && keep(declaration))
  // A font name keeps its quotes, which a double-quoted attribute cannot hold
  // as they are: Word's `font-family:"Georgia",serif` cut the style short.
  return kept.length > 0 ? ` style="${kept.join('; ').replaceAll('"', '&quot;')}"` : ''
}

/**
 * Each block's own layout dropped (see `isLayout`), its alignment and look
 * kept. A web page's rules round its blocks go too; a word processor's are
 * borders its writer drew.
 */
function blockLayout(html: string, web = false): string {
  return html.replace(BLOCK_TAG, (_match, tag: string, attributes: string) => {
    const cleaned = attributes.replace(
      STYLE_ATTRIBUTE,
      (_style, doubled?: string, single?: string) =>
        keptStyle(
          doubled ?? single ?? '',
          (declaration) => !isLayout(declaration) && !(web && BORDER_DECLARATION.test(declaration)),
        ),
    )
    return `<${tag}${cleaned}>`
  })
}

/**
 * A spreadsheet's cells: its own layout dropped, and a cell's run-level look
 * (a bold header, a red figure) moved onto a span round its words, which is
 * where the parser reads type from.
 */
function sheetCells(html: string): string {
  const table = html.replace(
    /<(table|tr|col)\b([^>]*)>/gi,
    (_match, tag: string, attributes: string) => {
      const cleaned = attributes.replace(
        STYLE_ATTRIBUTE,
        (_style, doubled?: string, single?: string) =>
          keptStyle(doubled ?? single ?? '', (declaration) => !isSheetLayout(declaration)),
      )
      return `<${tag}${cleaned}>`
    },
  )
  return table.replace(
    CELL,
    (_match, tag: string, before: string, style: string, after: string, inner: string) => {
      const declarations = style.split(';').map((declaration) => declaration.trim())
      const run = declarations.filter((declaration) => RUN_DECLARATION.test(declaration))
      const own = declarations.filter(
        (declaration) =>
          declaration && !RUN_DECLARATION.test(declaration) && !isSheetLayout(declaration),
      )
      const body =
        run.length > 0
          ? `<span style="${run.join('; ').replaceAll('"', '&quot;')}">${inner}</span>`
          : inner
      return `<${tag}${before}${own.length > 0 ? ` style="${own.join('; ')}"` : ''}${after}>${body}</${tag}>`
    },
  )
}

/** Excel's class rules written onto the elements carrying the class, before the stylesheet goes. */
function inlineExcelClasses(html: string): string {
  const rules = new Map<string, string>()
  for (const match of html.matchAll(EXCEL_CLASS_RULE)) {
    rules.set((match[1] as string).toLowerCase(), (match[2] as string).replace(/\s+/g, ' ').trim())
  }
  if (rules.size === 0) return html
  return html.replace(/<(td|th)\b([^>]*)>/gi, (whole, tag: string, attributes: string) => {
    const name = /\sclass\s*=\s*"?(xl\d+)/i.exec(attributes)?.[1]?.toLowerCase()
    const rule = name ? rules.get(name) : undefined
    if (!rule) return whole
    const existing = /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attributes)
    const merged = `${rule}${existing ? `;${existing[1] ?? existing[2] ?? ''}` : ''}`
    const rest = attributes.replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*')/i, '')
    return `<${tag}${rest} style="${merged.replaceAll('"', "'")}">`
  })
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
  return keptStyle(
    declarations,
    (declaration) =>
      !MSO_DECLARATION.test(declaration) &&
      !NORMAL_WEIGHT.test(declaration) &&
      !(google && GOOGLE_DEFAULT_DECLARATION.test(declaration)),
  )
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
