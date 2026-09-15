/**
 * A small, non-validating XML parser for the well-formed documents inside an
 * OOXML package. It keeps namespace prefixes verbatim (`w:p`, `r:id`) since
 * that is how the WordprocessingML vocabulary is universally referred to,
 * and it never throws on structure it does not understand. A mismatched
 * close tag simply closes the nearest open element.
 */

export interface XmlText {
  readonly text: string
}

export type XmlNode = XmlElement | XmlText

export class XmlElement {
  constructor(
    readonly name: string,
    readonly attrs: Record<string, string>,
    readonly children: XmlNode[] = [],
  ) {}

  /** The concatenated text of every descendant text node. */
  text(): string {
    let out = ''
    for (const child of this.children) {
      out += child instanceof XmlElement ? child.text() : child.text
    }
    return out
  }

  /** An attribute value, or undefined. */
  attr(name: string): string | undefined {
    return this.attrs[name]
  }

  /** Direct children that are elements. */
  elements(): XmlElement[] {
    return this.children.filter((child): child is XmlElement => child instanceof XmlElement)
  }

  /** Direct children with the given name. */
  childrenNamed(name: string): XmlElement[] {
    return this.elements().filter((child) => child.name === name)
  }

  /** The first direct child with the given name. */
  child(name: string): XmlElement | undefined {
    return this.elements().find((child) => child.name === name)
  }

  /** The first descendant (depth-first) with the given name. */
  find(name: string): XmlElement | undefined {
    for (const child of this.elements()) {
      if (child.name === name) return child
      const nested = child.find(name)
      if (nested) return nested
    }
    return undefined
  }

  /** Every descendant with the given name, in document order. */
  findAll(name: string): XmlElement[] {
    const out: XmlElement[] = []
    const visit = (element: XmlElement): void => {
      for (const child of element.elements()) {
        if (child.name === name) out.push(child)
        visit(child)
      }
    }
    visit(this)
    return out
  }
}

export function isXmlElement(node: XmlNode): node is XmlElement {
  return node instanceof XmlElement
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

/** Decode the five XML entities plus decimal and hexadecimal character references. */
export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16)
      return codePoint(code, match)
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10)
      return codePoint(code, match)
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match
  })
}

function codePoint(code: number, fallback: string): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return fallback
  try {
    return String.fromCodePoint(code)
  } catch {
    return fallback
  }
}

/**
 * Characters XML 1.0 forbids even when escaped: C0 controls other than tab,
 * newline and carriage return, the two non-characters U+FFFE/U+FFFF, and lone
 * surrogates (which cannot be encoded as UTF-8). Word refuses to open a part
 * containing any of them, so they are dropped rather than escaped.
 */
const INVALID_XML_CHARS =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g

/**
 * Escape text for use in element content or a double-quoted attribute value.
 * Characters XML cannot carry at all are removed.
 */
export function escapeXML(text: string): string {
  return text
    .replace(INVALID_XML_CHARS, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

const NAME_CHAR = /[A-Za-z0-9_:.\-\u00b7\u00c0-\uffef]/

/**
 * Parse an XML document and return its root element. Leading declarations,
 * comments, processing instructions and a DOCTYPE are skipped; a document
 * without any element yields an empty root named `#document`.
 */
export function parseXML(text: string): XmlElement {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const root = new XmlElement('#document', {})
  const stack: XmlElement[] = [root]
  const top = (): XmlElement => stack[stack.length - 1] as XmlElement
  let index = 0
  const length = source.length

  while (index < length) {
    const open = source.indexOf('<', index)
    if (open === -1) {
      appendText(top(), source.slice(index))
      break
    }
    if (open > index) appendText(top(), source.slice(index, open))

    if (source.startsWith('<!--', open)) {
      const close = source.indexOf('-->', open + 4)
      index = close === -1 ? length : close + 3
      continue
    }
    if (source.startsWith('<![CDATA[', open)) {
      const close = source.indexOf(']]>', open + 9)
      const end = close === -1 ? length : close
      top().children.push({ text: source.slice(open + 9, end) })
      index = close === -1 ? length : close + 3
      continue
    }
    if (source.startsWith('<?', open)) {
      const close = source.indexOf('?>', open + 2)
      index = close === -1 ? length : close + 2
      continue
    }
    if (source.startsWith('<!', open)) {
      // DOCTYPE, possibly with an internal subset in brackets.
      index = skipDeclaration(source, open + 2)
      continue
    }
    if (source.startsWith('</', open)) {
      const close = source.indexOf('>', open + 2)
      const name = source.slice(open + 2, close === -1 ? length : close).trim()
      closeElement(stack, name)
      index = close === -1 ? length : close + 1
      continue
    }

    // Start tag.
    let cursor = open + 1
    const nameStart = cursor
    while (cursor < length && NAME_CHAR.test(source[cursor] as string)) cursor++
    const name = source.slice(nameStart, cursor)
    const attrs: Record<string, string> = {}
    let selfClosing = false
    for (;;) {
      cursor = skipWhitespace(source, cursor)
      if (cursor >= length) break
      const char = source[cursor] as string
      if (char === '>') {
        cursor++
        break
      }
      if (char === '/') {
        selfClosing = true
        cursor = source.indexOf('>', cursor)
        cursor = cursor === -1 ? length : cursor + 1
        break
      }
      const attrStart = cursor
      while (cursor < length && NAME_CHAR.test(source[cursor] as string)) cursor++
      if (cursor === attrStart) {
        // Not a name character: skip it so a stray byte cannot stall the parser.
        cursor++
        continue
      }
      const attrName = source.slice(attrStart, cursor)
      cursor = skipWhitespace(source, cursor)
      if (source[cursor] !== '=') {
        attrs[attrName] = ''
        continue
      }
      cursor = skipWhitespace(source, cursor + 1)
      const quote = source[cursor]
      if (quote === '"' || quote === "'") {
        const close = source.indexOf(quote, cursor + 1)
        const end = close === -1 ? length : close
        attrs[attrName] = decodeEntities(source.slice(cursor + 1, end))
        cursor = close === -1 ? length : close + 1
      } else {
        const valueStart = cursor
        while (cursor < length && !/[\s>]/.test(source[cursor] as string)) cursor++
        attrs[attrName] = decodeEntities(source.slice(valueStart, cursor))
      }
    }
    const element = new XmlElement(name, attrs)
    top().children.push(element)
    if (!selfClosing && name.length > 0) stack.push(element)
    index = cursor
  }

  const first = root.elements()[0]
  return first ?? root
}

function appendText(parent: XmlElement, raw: string): void {
  if (raw.length === 0) return
  parent.children.push({ text: decodeEntities(raw) })
}

function closeElement(stack: XmlElement[], name: string): void {
  for (let depth = stack.length - 1; depth > 0; depth--) {
    if ((stack[depth] as XmlElement).name === name) {
      stack.length = depth
      return
    }
  }
  // No matching open element: a stray close tag is ignored.
}

function skipWhitespace(source: string, index: number): number {
  let cursor = index
  while (cursor < source.length && /\s/.test(source[cursor] as string)) cursor++
  return cursor
}

function skipDeclaration(source: string, start: number): number {
  let depth = 0
  for (let cursor = start; cursor < source.length; cursor++) {
    const char = source[cursor]
    if (char === '[') depth++
    else if (char === ']') depth--
    else if (char === '>' && depth <= 0) return cursor + 1
  }
  return source.length
}
