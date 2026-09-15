import type { EditorNode } from '../model/node'
import { type HTMLSerializeOptions, serializeToHTML } from './html'

export interface HTMLDocumentOptions {
  /** Goes in `<title>`. Defaults to "Document". */
  readonly title?: string
  /**
   * Stylesheet URLs to link. Relative URLs are resolved against `baseURL`,
   * so a document saved elsewhere still finds them.
   */
  readonly styleSheets?: readonly string[]
  /** Script URLs to load, resolved the same way. */
  readonly scripts?: readonly string[]
  /**
   * Base for resolving the URLs above, e.g. `"http://localhost:5173"`. Also
   * emitted as `<base href>` so any relative link inside the document itself
   * resolves against the origin it came from rather than wherever the file
   * ends up.
   */
  readonly baseURL?: string
  /** CSS embedded directly in the page, after the linked stylesheets. */
  readonly inlineCSS?: string
  /** JavaScript embedded directly, after the linked scripts. */
  readonly inlineJS?: string
  /** Language for `<html lang>`. Defaults to "en". */
  readonly lang?: string
  /** Passed to {@link serializeToHTML}; see {@link HTMLSerializeOptions.renderNode}. */
  readonly renderNode?: HTMLSerializeOptions['renderNode']
  /**
   * The palette the document was being edited in, baked into the page so it
   * opens in that theme rather than in whatever the reader's stylesheet, or
   * operating system, decides for it.
   */
  readonly theme?: HTMLDocumentTheme
}

/** The editor's theme, as an exported page has to carry it. */
export interface HTMLDocumentTheme {
  /** The ground the palette sits on; written to `data-trevixal-theme`. */
  readonly scheme?: 'light' | 'dark'
  /** The preset in force, if any; written to `data-trevixal-preset`. */
  readonly preset?: string | null
  /**
   * Resolved token values keyed by name without the `--tvx-` prefix, e.g.
   * `{ 'color-bg': '#2e3440' }`.
   */
  readonly tokens?: Readonly<Record<string, string>>
}

/** Absolute forms this will emit as-is. */
const ABSOLUTE = /^(?:https?:\/\/|\/\/)/i

// A theme can be authored by a user through a custom-theme dialog, so its
// name and every token value are untrusted text on the way into CSS. A name
// that could close the attribute it lands in, or a value that could close the
// declaration block, would let a "theme" write rules for the whole page.

/** A token name is the tail of a custom property: letters, digits, dashes. */
const SAFE_TOKEN_NAME = /^[a-zA-Z0-9-]+$/
/** A value that could end the declaration, close the block, or open a comment. */
const UNSAFE_IN_VALUE = /[{}<>;@\\]|\/\*/
/** A preset name that could break out of the attribute it is written to. */
const UNSAFE_IN_PRESET = /["'\\{}<>\n\r]/

/**
 * Whether a URL carries a scheme of its own. A colon appearing before the
 * first slash is what makes one, so `javascript:alert(1)` and `data:…` are
 * caught while `assets/a.css` and `/a.css` are not.
 */
function hasScheme(url: string): boolean {
  const colon = url.indexOf(':')
  if (colon === -1) return false
  const slash = url.indexOf('/')
  return slash === -1 || colon < slash
}

/**
 * Resolve a URL against a base, dropping anything that is not plainly a
 * document reference.
 *
 * `javascript:` and `data:` are refused outright: these URLs land in a `src`
 * or `href` that the receiving page will fetch and execute.
 */
function resolveURL(url: string, base: string | undefined): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  // A scheme other than http(s) is refused: these land in a src/href that the
  // receiving page will fetch and execute.
  if (hasScheme(trimmed) && !ABSOLUTE.test(trimmed)) return null
  if (!base) return trimmed
  // Already absolute: leave it alone.
  if (ABSOLUTE.test(trimmed)) return trimmed
  const origin = base.replace(/\/+$/, '')
  // `./assets/x.css` would otherwise join as `origin/./assets/x.css`.
  const path = trimmed.replace(/^\.\//, '')
  return path.startsWith('/') ? `${origin}${path}` : `${origin}/${path}`
}

/** Escape a string for use inside a double-quoted attribute. */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Escape text for a `<title>` or other element content. */
function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * The ground, as one of the two words that mean anything here. The type says
 * as much, but this is a plain-data option on a public function: a host that
 * reads a theme out of storage, or off the wire, hands over whatever is
 * there, and one of the places it lands is a CSS declaration.
 */
function scheme(theme: HTMLDocumentTheme): 'light' | 'dark' | null {
  return theme.scheme === 'light' || theme.scheme === 'dark' ? theme.scheme : null
}

/** `data-trevixal-theme` and `data-trevixal-preset`, ready to splice into a tag. */
function themeAttributes(theme: HTMLDocumentTheme | undefined): string {
  if (!theme) return ''
  let out = ''
  const ground = scheme(theme)
  if (ground) out += ` data-trevixal-theme="${ground}"`
  if (theme.preset && !UNSAFE_IN_PRESET.test(theme.preset)) {
    out += ` data-trevixal-preset="${escapeAttribute(theme.preset)}"`
  }
  return out
}

/**
 * The theme as a stylesheet of its own, emitted after everything the caller
 * collected so that it wins on source order.
 *
 * The palette is written out as resolved values rather than left to the
 * attributes above. Those only work if the rules reading them were collected
 * too, and a preset rule is in any case one selector among several competing
 * for the same tokens, which is how an export ends up plain white after the
 * editor it came from was not. Values written straight onto `.trevixal`
 * depend on nothing.
 */
function themeCSS(theme: HTMLDocumentTheme): string {
  const rules: string[] = []
  const declarations = Object.entries(theme.tokens ?? {})
    .filter(([token, value]) => SAFE_TOKEN_NAME.test(token) && !UNSAFE_IN_VALUE.test(value))
    .map(([token, value]) => `  --tvx-${token}: ${value};`)
  // `:root` as well as `.trevixal`: the page around the document reads the
  // same tokens, and nothing else defines them up there.
  if (declarations.length > 0) rules.push(`:root, .trevixal {\n${declarations.join('\n')}\n}`)
  const ground = scheme(theme)
  if (ground) rules.push(`:root { color-scheme: ${ground}; }`)
  // A dark document in a white gutter reads as a broken export rather than a
  // dark theme, and no `.trevixal` rule reaches that far.
  rules.push(
    'html, body { margin: 0; background: var(--tvx-color-bg, #ffffff); color: var(--tvx-color-text, #1a1a2b); }',
  )
  // The page's own scrollbar, in the palette the page is in.
  //
  // A standalone document is a whole browsing context: it paints its own bar,
  // and left alone that bar is the browser's default furniture, which on a
  // dark export, or in the side-by-side preview frame, is a heavy pale stripe
  // down the edge of an otherwise dark page. `color-scheme` above gets the
  // browser most of the way there; these match it to the editor it came from.
  rules.push(
    'html { scrollbar-width: thin; scrollbar-color: var(--tvx-color-border, #d9d9e3) transparent; }',
    '::-webkit-scrollbar { width: 10px; height: 10px; }',
    // Sized away rather than `display`-ed away: the injection tests over this
    // function use that exact declaration as their sentinel, and a cosmetic
    // rule here must not blunt one.
    '::-webkit-scrollbar-button { width: 0; height: 0; }',
    '::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }',
    '::-webkit-scrollbar-thumb { background: var(--tvx-color-border, #d9d9e3); border: 3px solid transparent; border-radius: 5px; background-clip: padding-box; }',
    '::-webkit-scrollbar-thumb:hover { background: var(--tvx-color-text-muted, #6b6b80); background-clip: padding-box; }',
  )
  // Browsers drop backgrounds when printing unless a page asks for them, and
  // "Save as PDF" is a print: without this a dark theme prints as pale text
  // on white paper, and code blocks and highlights lose their fills in every
  // theme.
  rules.push(
    '@media print {\n  html, body, .trevixal, .trevixal * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }\n}',
  )
  return rules.join('\n')
}

/**
 * Serialize a document as a complete, standalone HTML page.
 *
 * {@link serializeToHTML} returns a bare fragment, which is what you want for
 * a clipboard payload or for storing content, but pasted into a file on its
 * own it renders unstyled, because nothing carries the stylesheet with it.
 * This wraps the same markup in a real page with its styles and scripts
 * attached, so the file opens looking like the editor did.
 *
 * ```ts
 * serializeToHTMLDocument(editor.state.doc, {
 *   baseURL: 'http://localhost:5173',
 *   styleSheets: ['/styles.css'],
 * })
 * ```
 */
export function serializeToHTMLDocument(
  doc: EditorNode,
  options: HTMLDocumentOptions = {},
): string {
  const base = options.baseURL?.trim()
  const head: string[] = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
  ]

  // `<base>` first: it governs every relative URL that follows it, including
  // ones inside the document body.
  if (base) head.push(`<base href="${escapeAttribute(base.replace(/\/+$/, ''))}/">`)
  head.push(`<title>${escapeText(options.title ?? 'Document')}</title>`)

  for (const href of options.styleSheets ?? []) {
    const resolved = resolveURL(href, base)
    if (resolved) head.push(`<link rel="stylesheet" href="${escapeAttribute(resolved)}">`)
  }

  if (options.inlineCSS) {
    // `</style>` inside the CSS would close the block early and let the rest
    // be parsed as markup.
    head.push(`<style>\n${options.inlineCSS.replace(/<\/style>/gi, '<\\/style>')}\n</style>`)
  }

  if (options.theme) head.push(`<style>\n${themeCSS(options.theme)}\n</style>`)

  const themed = themeAttributes(options.theme)
  const body: string[] = [
    // `.trevixal` and `.trevixal-content` are what the stylesheet targets, so
    // the exported page has to reproduce that structure to be styled at all.
    `<div class="trevixal"${themed}>`,
    '<div class="trevixal-content">',
    serializeToHTML(doc, { renderNode: options.renderNode }),
    '</div>',
    '</div>',
  ]

  for (const src of options.scripts ?? []) {
    const resolved = resolveURL(src, base)
    if (resolved) body.push(`<script src="${escapeAttribute(resolved)}"></script>`)
  }

  if (options.inlineJS) {
    body.push(`<script>\n${options.inlineJS.replace(/<\/script>/gi, '<\\/script>')}\n</script>`)
  }

  return [
    '<!doctype html>',
    `<html lang="${escapeAttribute(options.lang ?? 'en')}"${themed}>`,
    '<head>',
    ...head,
    '</head>',
    '<body>',
    ...body,
    '</body>',
    '</html>',
    '',
  ].join('\n')
}
