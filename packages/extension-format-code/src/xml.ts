import { type FormatResult, normalizeIndent } from './types'

/** Matches nesting depth guard in json.ts; see MAX_DEPTH there. */
const MAX_DEPTH = 500

/**
 * A parsed piece of the document. Formatting only ever re-indents these. It
 * never rewrites their content, so text, comments and CDATA survive verbatim.
 */
type Token =
  | { kind: 'open'; text: string; name: string }
  | { kind: 'close'; text: string; name: string }
  | { kind: 'selfClosing'; text: string; name: string }
  /** Declarations, comments, CDATA and processing instructions. */
  | { kind: 'standalone'; text: string }
  | { kind: 'text'; text: string }

/**
 * Security note: this formatter does its own tokenizing and never hands the
 * source to `DOMParser` or any other XML engine, so there is no entity
 * expansion, no external-entity resolution and no DTD subset processing to
 * attack. A billion-laughs or XXE payload is inert here because nothing
 * ever expands an entity reference. (Even in a browser, `DOMParser` disables
 * entity expansion by default; relying on that default is still weaker than
 * not having an expander at all.) A doctype that declares an ENTITY is
 * rejected outright regardless, so such a payload cannot survive a round
 * trip through the editor into a consumer that *does* expand entities.
 */
const DOCTYPE_WITH_ENTITY = /<!DOCTYPE[^>]*\[[\s\S]*?<!ENTITY/i

/** Elements whose content is never re-indented, because whitespace is data. */
const PRESERVE_WHITESPACE = new Set(['pre'])

/**
 * Pretty-print XML: re-indent one node per line, leaving every node's own
 * text untouched. Returns the parser's complaint on malformed input rather
 * than emitting a half-formatted document.
 */
export function formatXML(source: string, indent?: number): FormatResult {
  const parsed = tokenizeXML(source)
  if (!parsed.ok) return parsed
  const step = ' '.repeat(normalizeIndent(indent))

  const lines: string[] = []
  let depth = 0
  /** >0 while inside an element whose whitespace must survive verbatim. */
  let preserving = 0

  for (const token of parsed.tokens) {
    if (token.kind === 'text') {
      if (preserving > 0) lines.push(token.text)
      else if (token.text.trim().length > 0) lines.push(step.repeat(depth) + token.text.trim())
      continue
    }
    if (token.kind === 'close') {
      depth = Math.max(0, depth - 1)
      if (preserving > 0) {
        lines.push(token.text)
        if (PRESERVE_WHITESPACE.has(token.name)) preserving -= 1
        continue
      }
      lines.push(step.repeat(depth) + token.text)
      continue
    }
    if (preserving > 0) {
      lines.push(token.text)
      if (token.kind === 'open') depth += 1
      continue
    }
    lines.push(step.repeat(depth) + token.text)
    if (token.kind === 'open') {
      if (PRESERVE_WHITESPACE.has(token.name)) preserving += 1
      depth += 1
    }
  }

  return { ok: true, text: lines.join('\n') }
}

/**
 * Collapse an XML document to a single line: drop the whitespace between
 * nodes, keep the text inside them.
 */
export function minifyXML(source: string): FormatResult {
  const parsed = tokenizeXML(source)
  if (!parsed.ok) return parsed
  const out: string[] = []
  for (const token of parsed.tokens) {
    if (token.kind === 'text') {
      const trimmed = token.text.trim()
      if (trimmed.length > 0) out.push(trimmed)
      continue
    }
    out.push(token.text)
  }
  return { ok: true, text: out.join('') }
}

type TokenizeResult = { ok: true; tokens: Token[] } | { ok: false; error: string }

/**
 * A single left-to-right scan. Strict enough to reject the malformed input a
 * user wants told about, unbalanced or mismatched tags, an unterminated tag
 * or comment, without implementing namespaces, DTD validation or entities.
 */
function tokenizeXML(source: string): TokenizeResult {
  if (source.trim().length === 0) return { ok: false, error: 'Empty document' }
  if (DOCTYPE_WITH_ENTITY.test(source)) {
    return { ok: false, error: 'Refusing a DOCTYPE that declares an ENTITY' }
  }

  const tokens: Token[] = []
  const stack: string[] = []
  let index = 0

  while (index < source.length) {
    const next = source.indexOf('<', index)
    if (next === -1) {
      tokens.push({ kind: 'text', text: source.slice(index) })
      break
    }
    if (next > index) tokens.push({ kind: 'text', text: source.slice(index, next) })

    // Comments, CDATA and processing instructions end on their own terminator
    // and carry no nesting, so they pass through as opaque single tokens.
    const opaque = matchOpaque(source, next)
    if (opaque) {
      if (opaque.end === -1) return { ok: false, error: `Unterminated ${opaque.label}` }
      tokens.push({ kind: 'standalone', text: source.slice(next, opaque.end) })
      index = opaque.end
      continue
    }

    const end = findTagEnd(source, next)
    if (end === -1) return { ok: false, error: 'Unterminated tag' }
    const text = source.slice(next, end)
    const name = tagName(text)
    if (!name) return { ok: false, error: `Malformed tag: ${truncate(text)}` }

    if (text.startsWith('</')) {
      const open = stack.pop()
      if (open === undefined) return { ok: false, error: `Unexpected closing tag </${name}>` }
      if (open !== name)
        return { ok: false, error: `Closing tag </${name}> does not match <${open}>` }
      tokens.push({ kind: 'close', text, name })
    } else if (text.endsWith('/>')) {
      tokens.push({ kind: 'selfClosing', text, name })
    } else {
      stack.push(name)
      if (stack.length > MAX_DEPTH) {
        return { ok: false, error: `XML nested deeper than ${MAX_DEPTH} levels` }
      }
      tokens.push({ kind: 'open', text, name })
    }
    index = end
  }

  if (stack.length > 0) return { ok: false, error: `Unclosed tag <${stack[stack.length - 1]}>` }
  return { ok: true, tokens }
}

/** Recognize the constructs that terminate on a fixed string. */
function matchOpaque(source: string, at: number): { end: number; label: string } | null {
  const rest = source.slice(at, at + 9)
  if (rest.startsWith('<!--')) return { end: endOf(source, at, '-->'), label: 'comment' }
  if (rest.startsWith('<![CDATA[')) return { end: endOf(source, at, ']]>'), label: 'CDATA section' }
  if (rest.startsWith('<?'))
    return { end: endOf(source, at, '?>'), label: 'processing instruction' }
  if (rest.startsWith('<!')) return { end: endOf(source, at, '>'), label: 'declaration' }
  return null
}

function endOf(source: string, at: number, terminator: string): number {
  const found = source.indexOf(terminator, at)
  return found === -1 ? -1 : found + terminator.length
}

/**
 * The end of a tag, skipping any `>` that appears inside a quoted attribute
 * value, `<a title="a > b">` is one tag, not two.
 */
function findTagEnd(source: string, at: number): number {
  let quote: string | null = null
  for (let index = at + 1; index < source.length; index++) {
    const char = source[index] as string
    if (quote) {
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") quote = char
    else if (char === '>') return index + 1
    else if (char === '<') return -1 // a new tag started: this one never closed
  }
  return -1
}

/** The element name of a start, end or self-closing tag. */
function tagName(text: string): string | null {
  const match = /^<\/?\s*([^\s/>]+)/.exec(text)
  return match ? (match[1] as string) : null
}

function truncate(text: string): string {
  return text.length <= 40 ? text : `${text.slice(0, 40)}…`
}
