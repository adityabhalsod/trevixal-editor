import { Fragment } from '../model/fragment'
import { mergeInline } from '../model/inline'
import type { Mark } from '../model/mark'
import type { EditorNode } from '../model/node'
import { normalizeDoc } from '../model/normalize'
import type { Schema } from '../model/schema'
import { safeHref, safeImageSrc } from '../schema/basic'

export interface MarkdownParseOptions {
  /** Node names for tables, matching `@trevixal/extension-table`. */
  readonly tableNames?: {
    readonly table?: string
    readonly row?: string
    readonly cell?: string
  }
}

interface Names {
  readonly table: string
  readonly row: string
  readonly cell: string
}

/**
 * Markdown (GFM) import for the same subset {@link serializeToMarkdown}
 * emits. Block structure is resolved line by line, then each block's text is
 * scanned for inline markup.
 *
 * Security: link and image destinations go through the same `safeHref` /
 * `safeImageSrc` sanitizers the HTML parser and the schema use, so a
 * `javascript:` URL in markdown is dropped exactly as it is in HTML. The
 * mark is simply not applied.
 */
export function parseMarkdown(
  text: string,
  schema: Schema,
  options: MarkdownParseOptions = {},
): EditorNode {
  const names: Names = {
    table: options.tableNames?.table ?? 'table',
    row: options.tableNames?.row ?? 'tableRow',
    cell: options.tableNames?.cell ?? 'tableCell',
  }
  const parser = new BlockParser(schema, names)
  const blocks = parser.parseBlocks(text.replace(/\r\n?/g, '\n').split('\n'))
  const content = blocks.length > 0 ? blocks : [schema.nodeType('paragraph').create()]
  return normalizeDoc(schema.topType.create(undefined, Fragment.from(content)))
}

/** `- item`, `* item`, `+ item`, `1. item`; captures indent, marker and rest. */
const BULLET_ITEM = /^(\s*)([-*+])(\s+)(.*)$/
const ORDERED_ITEM = /^(\s*)(\d{1,9})[.)](\s+)(.*)$/
const HEADING = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/
const FENCE = /^(\s*)(`{3,}|~{3,})\s*([^\s`]*)\s*$/
const RULE = /^ {0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/
const BLOCKQUOTE = /^ {0,3}>\s?(.*)$/
const TASK = /^\[([ xX])\]\s+(.*)$/
const TABLE_DELIMITER = /^\s*\|?(\s*:?-{1,}:?\s*\|)+(\s*:?-{1,}:?\s*)\|?\s*$/

class BlockParser {
  constructor(
    private readonly schema: Schema,
    private readonly names: Names,
  ) {}

  private has(name: string): boolean {
    return Object.hasOwn(this.schema.nodes, name)
  }

  /** Consume lines into blocks until they run out. */
  parseBlocks(lines: readonly string[]): EditorNode[] {
    const out: EditorNode[] = []
    let index = 0

    while (index < lines.length) {
      const line = lines[index] as string

      if (line.trim() === '') {
        index += 1
        continue
      }

      const fence = FENCE.exec(line)
      if (fence) {
        const [, , marker, language] = fence as unknown as [string, string, string, string]
        const body: string[] = []
        index += 1
        // An unterminated fence runs to the end of the document, per CommonMark.
        while (index < lines.length && !isFenceClose(lines[index] as string, marker)) {
          body.push(lines[index] as string)
          index += 1
        }
        if (index < lines.length) index += 1
        out.push(this.codeBlock(body.join('\n'), language || null))
        continue
      }

      if (RULE.test(line) && this.has('horizontalRule')) {
        out.push(this.schema.nodeType('horizontalRule').create())
        index += 1
        continue
      }

      const heading = HEADING.exec(line)
      if (heading) {
        const level = (heading[1] as string).length
        out.push(this.schema.nodeType('heading').create({ level }, this.inline(heading[2] ?? '')))
        index += 1
        continue
      }

      if (BLOCKQUOTE.test(line)) {
        const quoted: string[] = []
        while (index < lines.length) {
          const match = BLOCKQUOTE.exec(lines[index] as string)
          if (match) {
            quoted.push(match[1] as string)
            index += 1
            continue
          }
          // A lazy continuation line belongs to the quote's last paragraph.
          if ((lines[index] as string).trim() === '') break
          if (this.startsNewBlock(lines[index] as string)) break
          quoted.push(lines[index] as string)
          index += 1
        }
        const inner = this.parseBlocks(quoted)
        out.push(
          this.schema
            .nodeType('blockquote')
            .create(undefined, Fragment.from(inner.length > 0 ? inner : [this.paragraph('')])),
        )
        continue
      }

      const table = this.tryTable(lines, index)
      if (table) {
        out.push(table.node)
        index = table.next
        continue
      }

      const list = this.tryList(lines, index)
      if (list) {
        out.push(list.node)
        index = list.next
        continue
      }

      // Paragraph: run until a blank line or the start of another block.
      const paragraph: string[] = [line]
      index += 1
      while (index < lines.length) {
        const candidate = lines[index] as string
        if (candidate.trim() === '' || this.startsNewBlock(candidate)) break
        paragraph.push(candidate)
        index += 1
      }
      out.push(this.paragraphLines(paragraph))
    }

    return out
  }

  /** Would this line begin a block other than a paragraph continuation? */
  private startsNewBlock(line: string): boolean {
    return (
      HEADING.test(line) ||
      FENCE.test(line) ||
      RULE.test(line) ||
      BLOCKQUOTE.test(line) ||
      BULLET_ITEM.test(line) ||
      ORDERED_ITEM.test(line)
    )
  }

  private codeBlock(text: string, language: string | null): EditorNode {
    return this.schema
      .nodeType('codeBlock')
      .create({ language }, text.length > 0 ? Fragment.of(this.schema.text(text)) : Fragment.empty)
  }

  private paragraph(text: string): EditorNode {
    return this.schema.nodeType('paragraph').create(undefined, this.inline(text))
  }

  /**
   * Several source lines forming one paragraph. A line ending in two spaces
   * is a hard break; otherwise the lines join with a space, as markdown says.
   */
  private paragraphLines(lines: readonly string[]): EditorNode {
    let text = ''
    lines.forEach((line, index) => {
      const isLast = index === lines.length - 1
      if (/ {2,}$/.test(line) && !isLast) text += `${line.trimEnd()}\n`
      else text += isLast ? line.trim() : `${line.trim()} `
    })
    return this.schema.nodeType('paragraph').create(undefined, this.inline(text))
  }

  /** A run of list items at the same indent, with nested lists inside them. */
  private tryList(
    lines: readonly string[],
    start: number,
  ): { node: EditorNode; next: number } | null {
    const first = lines[start] as string
    const bullet = BULLET_ITEM.exec(first)
    const ordered = bullet ? null : ORDERED_ITEM.exec(first)
    if (!bullet && !ordered) return null

    // A bullet list whose first item carries a checkbox is a task list, when
    // the schema has those nodes -- that is how GFM writes one.
    const isTask =
      Boolean(bullet) &&
      TASK.test((bullet as RegExpExecArray)[4] as string) &&
      this.has('taskList') &&
      this.has('taskItem')
    const listName = isTask ? 'taskList' : bullet ? 'bulletList' : 'orderedList'
    const itemName = isTask ? 'taskItem' : 'listItem'
    if (!this.has(listName) || !this.has(itemName)) return null
    const baseIndent = ((bullet ?? ordered) as RegExpExecArray)[1]?.length ?? 0
    const startNumber = ordered ? Number.parseInt(ordered[2] as string, 10) : null

    const items: EditorNode[] = []
    let index = start

    while (index < lines.length) {
      const line = lines[index] as string
      if (line.trim() === '') {
        // A blank line ends the list unless the next line continues an item.
        const following = lines[index + 1]
        if (following === undefined || following.trim() === '') break
        const nextIndent = following.length - following.trimStart().length
        const nextItem = BULLET_ITEM.exec(following) ?? ORDERED_ITEM.exec(following)
        if (!nextItem && nextIndent <= baseIndent) break
        if (nextItem && (nextItem[1]?.length ?? 0) < baseIndent) break
        index += 1
        continue
      }

      const match = BULLET_ITEM.exec(line) ?? ORDERED_ITEM.exec(line)
      if (!match) break
      const indent = match[1]?.length ?? 0
      if (indent < baseIndent) break
      // A more-indented marker belongs to the previous item, handled below.
      if (indent > baseIndent) break
      // A different list kind at the same level starts a new list.
      const isBullet = BULLET_ITEM.test(line)
      if (isBullet !== Boolean(bullet)) break

      // Everything indented past the marker is this item's content.
      const markerWidth =
        (match[1]?.length ?? 0) + (match[2]?.length ?? 0) + (match[3]?.length ?? 0)
      const itemLines: string[] = [match[4] as string]
      index += 1
      while (index < lines.length) {
        const candidate = lines[index] as string
        if (candidate.trim() === '') {
          const following = lines[index + 1]
          if (following === undefined || following.trim() === '') break
          const nextIndent = following.length - following.trimStart().length
          if (nextIndent < markerWidth) break
          itemLines.push('')
          index += 1
          continue
        }
        const candidateIndent = candidate.length - candidate.trimStart().length
        if (candidateIndent < markerWidth) break
        itemLines.push(candidate.slice(markerWidth))
        index += 1
      }

      items.push(this.listItem(itemLines, itemName))
    }

    if (items.length === 0) return null
    const attrs = startNumber !== null ? { start: startNumber } : undefined
    return {
      node: this.schema.nodeType(listName).create(attrs, Fragment.from(items)),
      next: index,
    }
  }

  /** One item's lines, including a leading task marker and nested blocks. */
  private listItem(lines: readonly string[], itemName: string): EditorNode {
    const first = lines[0] ?? ''
    const task = TASK.exec(first)
    const itemType = this.schema.nodeType(itemName)
    const supportsChecked = Object.hasOwn(itemType.spec.attrs ?? {}, 'checked')

    if (task && supportsChecked) {
      const blocks = this.parseBlocks([task[2] as string, ...lines.slice(1)])
      const checked = (task[1] as string).toLowerCase() === 'x'
      return itemType.create(
        { checked },
        Fragment.from(blocks.length > 0 ? blocks : [this.paragraph('')]),
      )
    }
    // A checkbox this schema cannot model stays literal text, rather than
    // being dropped: the escaped form round-trips as what the user wrote.
    const blocks = this.parseBlocks([...lines])
    return itemType.create(
      undefined,
      Fragment.from(blocks.length > 0 ? blocks : [this.paragraph('')]),
    )
  }

  /** A GFM pipe table: a header row, a delimiter row, then body rows. */
  private tryTable(
    lines: readonly string[],
    start: number,
  ): { node: EditorNode; next: number } | null {
    if (!this.has(this.names.table) || !this.has(this.names.row) || !this.has(this.names.cell)) {
      return null
    }
    const header = lines[start] as string
    const delimiter = lines[start + 1]
    if (!header.includes('|') || delimiter === undefined) return null
    if (!TABLE_DELIMITER.test(delimiter)) return null

    const aligns = splitRow(delimiter).map((spec) => {
      const trimmed = spec.trim()
      const left = trimmed.startsWith(':')
      const right = trimmed.endsWith(':')
      if (left && right) return 'center'
      if (left) return 'left'
      if (right) return 'right'
      return null
    })

    const rowLines: string[] = [header]
    let index = start + 2
    while (index < lines.length) {
      const candidate = lines[index] as string
      if (candidate.trim() === '' || !candidate.includes('|')) break
      rowLines.push(candidate)
      index += 1
    }

    const rows = rowLines.map((line, rowIndex) => {
      const cells = splitRow(line).map((cellSource, columnIndex) =>
        this.schema
          .nodeType(this.names.cell)
          .create(
            { header: rowIndex === 0, align: aligns[columnIndex] ?? null },
            Fragment.of(this.paragraph(cellSource.trim().replaceAll('\\|', '|'))),
          ),
      )
      return this.schema.nodeType(this.names.row).create(undefined, Fragment.from(cells))
    })

    return {
      node: this.schema.nodeType(this.names.table).create(undefined, Fragment.from(rows)),
      next: index,
    }
  }

  /** Scan one block's text for inline markup, producing an inline Fragment. */
  private inline(source: string): Fragment {
    const nodes = new InlineParser(this.schema, source).parse()
    return mergeInline(Fragment.from(nodes))
  }
}

/** Split a pipe-table row into its cells, honouring `\|` escapes. */
function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let current = ''
  let escaped = false
  for (const char of trimmed) {
    if (escaped) {
      // Keep the escape: the caller unescapes after trimming.
      current += char === '|' ? '\\|' : `\\${char}`
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '|') {
      cells.push(current)
      current = ''
      continue
    }
    current += char
  }
  cells.push(current)
  return cells
}

function isFenceClose(line: string, marker: string): boolean {
  const trimmed = line.trim()
  const char = marker[0] as string
  return trimmed.length >= marker.length && trimmed === char.repeat(trimmed.length)
}

/**
 * Inline scanner. Walks the text once, recognizing code spans first (nothing
 * inside them is markup), then images, links, and the emphasis delimiters.
 */
class InlineParser {
  private index = 0
  private readonly out: EditorNode[] = []
  private buffer = ''

  constructor(
    private readonly schema: Schema,
    private readonly source: string,
    private readonly marks: readonly Mark[] = [],
  ) {}

  parse(): EditorNode[] {
    while (this.index < this.source.length) {
      const char = this.source[this.index] as string

      if (char === '\\') {
        // A backslash escape contributes the next character literally.
        const next = this.source[this.index + 1]
        if (next !== undefined && /[\\`*_[\]<>&~|$#+.()!-]/.test(next)) {
          this.buffer += next
          this.index += 2
          continue
        }
        this.buffer += char
        this.index += 1
        continue
      }

      if (char === '\n') {
        this.flush()
        if (this.has('hardBreak')) this.out.push(this.schema.nodeType('hardBreak').create())
        this.index += 1
        continue
      }

      if (char === '`' && this.tryCode()) continue
      if (char === '!' && this.tryImage()) continue
      if (char === '[' && this.tryLink()) continue
      if ((char === '*' || char === '_' || char === '~') && this.tryEmphasis()) continue

      this.buffer += char
      this.index += 1
    }
    this.flush()
    return this.out
  }

  private has(name: string): boolean {
    return Object.hasOwn(this.schema.nodes, name)
  }

  private hasMark(name: string): boolean {
    return Object.hasOwn(this.schema.marks, name)
  }

  private flush(): void {
    if (this.buffer.length === 0) return
    this.out.push(this.schema.text(this.buffer, this.marks))
    this.buffer = ''
  }

  /** A code span: the matching run of backticks closes it. */
  private tryCode(): boolean {
    const fence = /^`+/.exec(this.source.slice(this.index))?.[0] as string
    const close = this.source.indexOf(fence, this.index + fence.length)
    if (close === -1) return false
    // Reject a longer run as the closer, per CommonMark.
    if (this.source[close + fence.length] === '`') return false
    let text = this.source.slice(this.index + fence.length, close)
    // A single leading and trailing space is stripped when both are present.
    if (text.startsWith(' ') && text.endsWith(' ') && text.trim().length > 0) {
      text = text.slice(1, -1)
    }
    this.flush()
    if (text.length > 0) {
      const marks = this.hasMark('code')
        ? this.schema.mark('code').addToSet(this.marks)
        : this.marks
      this.out.push(this.schema.text(text, marks))
    }
    this.index = close + fence.length
    return true
  }

  private tryImage(): boolean {
    if (this.source[this.index + 1] !== '[') return false
    const parsed = parseBracketLink(this.source, this.index + 1)
    if (!parsed) return false
    if (!this.has('image')) return false
    const src = safeImageSrc(parsed.destination)
    if (!src) {
      // Unsafe source: keep the alt text so nothing the user wrote is lost.
      this.buffer += parsed.text
      this.index = parsed.next
      return true
    }
    this.flush()
    const attrs: Record<string, unknown> = { src, alt: parsed.text }
    if (parsed.title) attrs.title = parsed.title
    this.out.push(this.schema.nodeType('image').create(attrs))
    this.index = parsed.next
    return true
  }

  private tryLink(): boolean {
    const parsed = parseBracketLink(this.source, this.index)
    if (!parsed) return false
    // The same sanitizer the schema and HTML parser use: a `javascript:` URL
    // yields no mark, and the link text survives as plain text.
    const href = safeHref(parsed.destination)
    const marks =
      href && this.hasMark('link')
        ? this.schema
            .mark('link', parsed.title ? { href, title: parsed.title } : { href })
            .addToSet(this.marks)
        : this.marks
    this.flush()
    const inner = new InlineParser(this.schema, parsed.text, marks).parse()
    this.out.push(...inner)
    this.index = parsed.next
    return true
  }

  /** `**bold**`, `*italic*`, `_italic_`, `~~strike~~`. */
  private tryEmphasis(): boolean {
    const char = this.source[this.index] as string
    const run = /^(\*+|_+|~+)/.exec(this.source.slice(this.index))?.[0] as string
    const isStrong = char !== '~' && run.length >= 2
    const delimiter = char === '~' ? '~~' : isStrong ? `${char}${char}` : char
    if (char === '~' && run.length < 2) return false

    const contentStart = this.index + delimiter.length
    const close = findClosing(this.source, contentStart, delimiter)
    if (close === -1) return false
    const inner = this.source.slice(contentStart, close)
    if (inner.length === 0) return false

    const markName = char === '~' ? 'strikethrough' : isStrong ? 'bold' : 'italic'
    const marks = this.hasMark(markName)
      ? this.schema.mark(markName).addToSet(this.marks)
      : this.marks
    this.flush()
    this.out.push(...new InlineParser(this.schema, inner, marks).parse())
    this.index = close + delimiter.length
    return true
  }
}

/** The closing delimiter for an emphasis run, skipping escapes and code. */
function findClosing(source: string, from: number, delimiter: string): number {
  let index = from
  while (index < source.length) {
    const char = source[index] as string
    if (char === '\\') {
      index += 2
      continue
    }
    if (char === '`') {
      const fence = /^`+/.exec(source.slice(index))?.[0] as string
      const close = source.indexOf(fence, index + fence.length)
      index = close === -1 ? index + fence.length : close + fence.length
      continue
    }
    if (source.startsWith(delimiter, index)) {
      // `*` must not match the first `*` of a `**` run used as strong.
      if (delimiter.length === 1 && source[index + 1] === delimiter) {
        index += 2
        continue
      }
      return index
    }
    index += 1
  }
  return -1
}

/**
 * `[text](destination "title")` starting at `at`. Handles nested brackets in
 * the text and an angle-bracketed destination.
 */
function parseBracketLink(
  source: string,
  at: number,
): { text: string; destination: string; title: string | null; next: number } | null {
  if (source[at] !== '[') return null
  let depth = 0
  let index = at
  let textEnd = -1
  while (index < source.length) {
    const char = source[index] as string
    if (char === '\\') {
      index += 2
      continue
    }
    if (char === '[') depth += 1
    else if (char === ']') {
      depth -= 1
      if (depth === 0) {
        textEnd = index
        break
      }
    }
    index += 1
  }
  if (textEnd === -1 || source[textEnd + 1] !== '(') return null

  const text = source.slice(at + 1, textEnd)
  let cursor = textEnd + 2
  let destination = ''

  if (source[cursor] === '<') {
    const close = source.indexOf('>', cursor)
    if (close === -1) return null
    destination = source.slice(cursor + 1, close)
    cursor = close + 1
  } else {
    let parens = 0
    while (cursor < source.length) {
      const char = source[cursor] as string
      if (char === '\\') {
        destination += source[cursor + 1] ?? ''
        cursor += 2
        continue
      }
      if (char === '(') parens += 1
      else if (char === ')') {
        if (parens === 0) break
        parens -= 1
      } else if (/\s/.test(char)) break
      destination += char
      cursor += 1
    }
  }

  // An optional quoted title, then the closing paren.
  let title: string | null = null
  while (cursor < source.length && /\s/.test(source[cursor] as string)) cursor += 1
  const quote = source[cursor]
  if (quote === '"' || quote === "'") {
    let collected = ''
    cursor += 1
    while (cursor < source.length && source[cursor] !== quote) {
      if (source[cursor] === '\\') {
        collected += source[cursor + 1] ?? ''
        cursor += 2
        continue
      }
      collected += source[cursor]
      cursor += 1
    }
    if (source[cursor] !== quote) return null
    title = collected
    cursor += 1
    while (cursor < source.length && /\s/.test(source[cursor] as string)) cursor += 1
  }
  if (source[cursor] !== ')') return null
  return { text, destination, title, next: cursor + 1 }
}
