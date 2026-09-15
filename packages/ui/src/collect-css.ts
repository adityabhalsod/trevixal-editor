/**
 * Gather the CSS a page has already parsed, so an exported document can carry
 * its own styling instead of linking back to the server it came from.
 *
 * A link to `http://localhost:5173/assets/x.css` only renders while that
 * server is running and reachable. A file saved to disk, mailed to someone,
 * or opened tomorrow gets nothing, which is exactly what "the style is not
 * working" looks like.
 */

export interface CollectCSSOptions {
  /** Document to read from. Defaults to the ambient one. */
  readonly document?: Document
  /**
   * Only keep rules whose selector mentions one of these strings. Defaults to
   * the editor's own prefixes, so a host page's unrelated CSS is left out.
   * Pass an empty array to keep everything.
   */
  readonly match?: readonly string[]
}

/** Prefixes that identify the editor's own rules. */
const DEFAULT_MATCH = ['.trevixal', '--tvx-', '.tvx-']

/**
 * A declaration the engine serialized as `property: ;`.
 *
 * This is what a shorthand holding a `var()` turns into once a longhand
 * overrides part of it: `border: solid var(--x)` followed by
 * `border-width: 0 2px 2px 0`. The engine can no longer print the shorthand,
 * so it prints the longhands instead, and the ones still waiting on the
 * variable come out empty. The original text is gone: asking the rule for the
 * shorthand returns an empty string too, so there is nothing to recover.
 *
 * Emitting them would put invalid declarations in the exported file, so they
 * are dropped here. The rules in this kit avoid the shape that produces them
 * (write the longhands instead) and a browser test holds them to it.
 */
const UNSERIALIZABLE = /(?:^|\s)[a-zA-Z-]+:\s*;/

/**
 * Serialize the matching CSS rules from every stylesheet in the document.
 *
 * Rules whose text cannot be read are skipped rather than throwing: a
 * cross-origin stylesheet raises on `cssRules` access, and one unreadable
 * sheet should not lose the rest.
 */
export function collectDocumentCSS(options: CollectCSSOptions = {}): string {
  const doc = options.document ?? globalThis.document
  if (!doc) return ''
  const match = options.match ?? DEFAULT_MATCH
  const blocks: string[] = []

  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList
    try {
      // Throws for a cross-origin sheet; there is no way to test for this
      // ahead of time, so the access itself is the test.
      const list = (sheet as CSSStyleSheet).cssRules
      if (!list) continue
      rules = list
    } catch {
      continue
    }

    for (const rule of Array.from(rules)) {
      const text = rule.cssText
      if (!text) continue
      if (match.length === 0 || match.some((needle) => text.includes(needle))) {
        blocks.push(UNSERIALIZABLE.test(text) ? dropEmptyDeclarations(text) : text)
      }
    }
  }

  return blocks.join('\n')
}

/** A declaration that names a property and then gives it nothing. */
const EMPTY_VALUE = /:\s*$/

/**
 * `a { x: 1; y: ; }` becomes `a { x: 1; }`; a rule left with none is dropped.
 *
 * The declarations are found by scanning rather than by splitting on `;`: a
 * value may hold one inside quotes or parentheses: `content: ";"`, or a
 * `data:…;base64,` URL, and cutting there would corrupt the very rule this
 * is trying to repair.
 *
 * A rule nested in `@media` or `@supports` is returned untouched; the kit's
 * own rules are kept clear of the shape by a browser test that reads the
 * whole exported stylesheet, nested blocks included.
 */
function dropEmptyDeclarations(text: string): string {
  const open = text.indexOf('{')
  const close = text.lastIndexOf('}')
  if (open === -1 || close <= open || text.includes('{', open + 1)) return text
  const kept: string[] = []
  let start = open + 1
  let depth = 0
  let quote = ''
  const take = (end: number): void => {
    const declaration = text.slice(start, end).trim()
    if (declaration && !EMPTY_VALUE.test(declaration)) kept.push(declaration)
    start = end + 1
  }
  for (let index = start; index < close; index++) {
    const char = text[index]
    if (quote) {
      if (char === '\\') index++
      else if (char === quote) quote = ''
    } else if (char === '"' || char === "'") quote = char
    else if (char === '(') depth++
    else if (char === ')') depth--
    else if (char === ';' && depth === 0) take(index)
  }
  take(close)
  if (kept.length === 0) return ''
  return `${text.slice(0, open + 1)} ${kept.join('; ')}; }`
}
