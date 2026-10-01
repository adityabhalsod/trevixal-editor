import { Fragment } from '../model/fragment'
import type { Mark } from '../model/mark'
import type { EditorNode, TextNode } from '../model/node'
import { TableMap } from '../model/table-map'
import { codeBlockTitle, normalizeLineRanges } from '../schema/code-block'
import { frontMatterOf } from '../schema/document-settings'

export interface MarkdownSerializeOptions {
  /** Bullet marker for unordered lists; `"-"` by default. */
  readonly bullet?: '-' | '*' | '+'
  /** Emphasis delimiter for italics; `"_"` by default. */
  readonly emphasis?: '_' | '*'
  /**
   * Node names to treat as tables, rows and cells when a table extension is
   * loaded. Defaults match `@trevixal/extension-table`.
   */
  readonly tableNames?: {
    readonly table?: string
    readonly row?: string
    readonly cell?: string
  }
  /**
   * Write MDX: a code block in the `mdx` language goes out as the imports,
   * exports and components it holds, rather than fenced as code.
   */
  readonly mdx?: boolean
}

interface Resolved {
  readonly bullet: string
  readonly emphasis: string
  readonly table: string
  readonly row: string
  readonly cell: string
  readonly mdx: boolean
}

/** The code block language MDX's own syntax is kept in. */
export const MDX_LANGUAGE = 'mdx'

/**
 * Markdown (GFM) export. Covers everything the default schema can hold, plus
 * tables and images from the bundled extensions when those nodes are present.
 *
 * Unknown block types degrade to their text content rather than being
 * dropped, so a schema with custom nodes still round-trips its prose.
 */
export function serializeToMarkdown(
  doc: EditorNode,
  options: MarkdownSerializeOptions = {},
): string {
  const config: Resolved = {
    bullet: options.bullet ?? '-',
    emphasis: options.emphasis ?? '_',
    table: options.tableNames?.table ?? 'table',
    row: options.tableNames?.row ?? 'tableRow',
    cell: options.tableNames?.cell ?? 'tableCell',
    mdx: options.mdx === true,
  }
  const blocks = doc.content.children.map((child) => serializeBlock(child, config, ''))
  const frontMatter = frontMatterOf(doc.attrs.frontMatter)
  const head = frontMatter ? `---\n${frontMatter}\n---\n\n` : ''
  // A trailing newline is conventional and makes the output diff-friendly.
  return `${head}${blocks.filter((block) => block !== null).join('\n\n')}\n`
}

/**
 * What follows a fence's language: the title, the lines picked out and how
 * the block shows, as documentation sites read it,
 * `title="app.ts" {1,3-5} showLineNumbers`.
 */
function fenceMeta(node: EditorNode): string {
  const parts: string[] = []
  const title = codeBlockTitle(node.attrs.title)
  if (title) parts.push(`title="${title.replace(/"/g, "'")}"`)
  const lines = normalizeLineRanges(node.attrs.highlightLines)
  if (lines) parts.push(`{${lines}}`)
  if (node.attrs.lineNumbers === true) parts.push('showLineNumbers')
  if (node.attrs.wrap === true) parts.push('wrap')
  if (node.attrs.collapsed === true) parts.push('collapsed')
  return parts.join(' ')
}

/**
 * One block, already indented for its nesting level. `indent` is the prefix
 * every line after the first must carry. That is what keeps nested list
 * content attached to its item.
 */
function serializeBlock(node: EditorNode, config: Resolved, indent: string): string {
  switch (node.type.name) {
    case 'paragraph':
      return indent + serializeInline(node.content, config)
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs.level) || 1))
      return `${indent}${'#'.repeat(level)} ${serializeInline(node.content, config)}`
    }
    case 'codeBlock': {
      const language = typeof node.attrs.language === 'string' ? node.attrs.language : ''
      const body = node.textContent
      // MDX's own syntax is the file's, not code shown in it.
      if (config.mdx && language === MDX_LANGUAGE) {
        return body
          .split('\n')
          .map((line) => indent + line)
          .join('\n')
      }
      // A fence must be longer than the longest backtick run inside it, or the
      // code closes the block early.
      const fence = '`'.repeat(Math.max(3, longestBacktickRun(body) + 1))
      const lines = body.length > 0 ? body.split('\n') : ['']
      const meta = fenceMeta(node)
      // With no language the first word of the meta would be read as one.
      const info = meta ? `${language || 'text'} ${meta}` : language
      return [
        `${indent}${fence}${info}`,
        ...lines.map((line) => indent + line),
        `${indent}${fence}`,
      ].join('\n')
    }
    case 'blockquote': {
      const inner = node.content.children
        .map((child) => serializeBlock(child, config, ''))
        .join('\n\n')
      return prefixLines(inner, `${indent}> `)
    }
    case 'horizontalRule':
      return `${indent}---`
    case 'bulletList':
    // A task list is a bullet list whose items each carry a checkbox; the
    // `taskMarker` below turns each item's `checked` attr into `[ ]`/`[x]`.
    case 'taskList':
      return serializeList(node, config, indent, null)
    case 'orderedList': {
      const start = typeof node.attrs.start === 'number' ? node.attrs.start : 1
      return serializeList(node, config, indent, start)
    }
    default:
      if (node.type.name === config.table) return serializeTable(node, config, indent)
      if (node.isTextblock) return indent + serializeInline(node.content, config)
      // Unknown container: emit its blocks so nothing is silently lost.
      return node.content.children
        .map((child) => serializeBlock(child, config, indent))
        .join('\n\n')
  }
}

function serializeList(
  list: EditorNode,
  config: Resolved,
  indent: string,
  start: number | null,
): string {
  const items: string[] = []
  let counter = start ?? 0
  for (const item of list.content.children) {
    const marker = start === null ? `${config.bullet} ` : `${counter++}. `
    // Continuation lines align under the marker, which is what makes a nested
    // list a child of this item rather than a sibling of the list.
    const childIndent = indent + ' '.repeat(marker.length)
    const task = taskMarker(item)
    const blocks = item.content.children.map((child, index) =>
      serializeBlock(child, config, index === 0 ? '' : childIndent),
    )
    const body = blocks.join('\n\n')
    items.push(indent + marker + task + body.replace(/^/, ''))
  }
  return items.join('\n')
}

/**
 * `[ ] ` / `[x] ` for a task item, else nothing. Keyed on the node type
 * rather than the mere presence of a `checked` attr, so an ordinary list
 * item that happens to carry one is not turned into a checkbox.
 */
function taskMarker(item: EditorNode): string {
  if (item.type.name !== 'taskItem') return ''
  return item.attrs.checked === true ? '[x] ' : '[ ] '
}

/**
 * A GFM pipe table. Alignment comes from the first row's cell attrs. A pipe
 * table has no spans, so a merged cell gives its text once, at its top-left,
 * and leaves the rest of the grid it covers empty: every row keeps its
 * columns.
 */
function serializeTable(table: EditorNode, config: Resolved, indent: string): string {
  const rows = table.content.children.filter((row) => row.type.name === config.row)
  if (rows.length === 0) return ''
  const grid = TableMap.of(table.withContent(Fragment.from(rows)))
  const columns = Math.max(1, grid.width)
  const renderRow = (rowIndex: number): string => {
    const rendered: string[] = []
    for (let column = 0; column < columns; column++) {
      const cell = grid.at(rowIndex, column)
      const own = cell && cell.top === rowIndex && cell.left === column
      rendered.push(own && cell.node.type.name === config.cell ? cellText(cell.node, config) : '')
    }
    return `${indent}| ${rendered.join(' | ')} |`
  }

  // One delimiter per column, taking its alignment from the header cell --
  // a short header row still needs a rule for every column.
  const delimiter = Array.from({ length: columns }, (_unused, column) =>
    alignmentRule(grid.at(0, column)?.node.attrs.align),
  )
  const lines = [renderRow(0), `${indent}| ${delimiter.join(' | ')} |`]
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) lines.push(renderRow(rowIndex))
  return lines.join('\n')
}

function alignmentRule(align: unknown): string {
  if (align === 'left') return ':---'
  if (align === 'center') return ':---:'
  if (align === 'right') return '---:'
  return '---'
}

/**
 * A cell's content flattened to one line: a pipe table has no way to express
 * a block break, so paragraphs join with a space and pipes are escaped. A
 * list or a table in the cell gives its text the same way, a space between
 * each of its items and cells.
 */
function cellText(cell: EditorNode, config: Resolved): string {
  const text = cell.content.children
    .map((block) => blockLine(block, config))
    .join(' ')
    .replaceAll('|', '\\|')
    .trim()
  // A checkbox cell's box, as a task list writes it.
  if (cell.attrs.valueType !== 'checkbox') return text
  return `${cell.attrs.checked === true ? '[x]' : '[ ]'} ${text}`.trim()
}

/** A block's text on one line: a textblock's inline content, or its own textblocks', spaced. */
function blockLine(block: EditorNode, config: Resolved): string {
  if (block.isTextblock) return serializeInline(block.content, config)
  return block.content.children
    .map((child) => blockLine(child, config))
    .filter(Boolean)
    .join(' ')
}

/** Inline content: text with marks, hard breaks, images and inline atoms. */
function serializeInline(content: Fragment, config: Resolved): string {
  let out = ''
  for (const child of content.children) {
    if (child.isText) {
      out += applyMarks(escapeMarkdown((child as TextNode).text), child.marks, config)
      continue
    }
    if (child.type.name === 'hardBreak') {
      // Two trailing spaces is the only hard break that survives a round trip
      // through every parser; a lone backslash is not universally supported.
      out += '  \n'
      continue
    }
    if (child.type.name === 'image') {
      out += serializeImage(child)
      continue
    }
    // Unknown inline node: fall back to its text, or its own toHTML text spec.
    out += escapeMarkdown(child.textContent || String(child.type.spec.toHTML?.(child)?.text ?? ''))
  }
  return out
}

function serializeImage(node: EditorNode): string {
  const src = typeof node.attrs.src === 'string' ? node.attrs.src : ''
  const alt = typeof node.attrs.alt === 'string' ? node.attrs.alt : ''
  const title = typeof node.attrs.title === 'string' ? node.attrs.title : ''
  const suffix = title ? ` "${title.replaceAll('"', '\\"')}"` : ''
  return `![${escapeLinkText(alt)}](${encodeDestination(src)}${suffix})`
}

/**
 * Wrap text in each of its marks, innermost first so the first mark in the
 * set ends up outermost, matching the HTML serializer's ordering.
 */
function applyMarks(text: string, marks: readonly Mark[], config: Resolved): string {
  if (marks.length === 0) return text
  let out = text
  // `code` must be applied first and suppresses the escaping of everything
  // inside it, so handle it before the wrapping marks.
  const codeMark = marks.find((mark) => mark.type.name === 'code')
  if (codeMark) out = wrapCode(unescapeMarkdown(out))
  for (let index = marks.length - 1; index >= 0; index--) {
    const mark = marks[index] as Mark
    switch (mark.type.name) {
      case 'bold':
        out = `**${out}**`
        break
      case 'italic':
        out = `${config.emphasis}${out}${config.emphasis}`
        break
      case 'strikethrough':
        out = `~~${out}~~`
        break
      case 'link': {
        const href = typeof mark.attrs.href === 'string' ? mark.attrs.href : ''
        const title = typeof mark.attrs.title === 'string' ? mark.attrs.title : ''
        const suffix = title ? ` "${title.replaceAll('"', '\\"')}"` : ''
        out = `[${out}](${encodeDestination(href)}${suffix})`
        break
      }
      // code is handled above; the rest (underline, highlight, colors, …)
      // have no markdown equivalent and pass through as plain text.
      default:
        break
    }
  }
  return out
}

/** Inline code needs a backtick run longer than any inside the text. */
function wrapCode(text: string): string {
  const fence = '`'.repeat(longestBacktickRun(text) + 1)
  // A leading/trailing backtick or space needs padding, per CommonMark.
  const pad = text.startsWith('`') || text.endsWith('`') || text.trim() !== text ? ' ' : ''
  return `${fence}${pad}${text}${pad}${fence}`
}

function longestBacktickRun(text: string): number {
  let longest = 0
  let run = 0
  for (const char of text) {
    if (char === '`') {
      run += 1
      if (run > longest) longest = run
    } else run = 0
  }
  return longest
}

/**
 * Characters that begin markdown constructs. Escaping these on the way out is
 * what makes a paragraph reading `*not emphasis*` come back as that literal
 * text instead of as emphasis. The central round-trip correctness rule.
 */
const INLINE_SPECIALS = /[\\`*_[\]<>&~|$]/g

/** Constructs that only mean something at the start of a line. */
const LINE_LEADERS = /^(\s*)(#{1,6}\s|[-*+]\s|>|={2,}\s*$|-{2,}\s*$)/
/** An ordered-item marker: the digits are literal, the delimiter is markup. */
const ORDERED_LEADER = /^(\s*)(\d{1,9})([.)]\s)/

export function escapeMarkdown(text: string): string {
  let escaped = text.replace(INLINE_SPECIALS, (char) => `\\${char}`)
  // `# ` and `- ` are markup only in leading position; escape just the marker
  // so the rest of the line is left readable.
  escaped = escaped.replace(LINE_LEADERS, (_match, space: string, marker: string) => {
    return `${space}\\${marker}`
  })
  // For "1. " the backslash must precede the delimiter, not the digits:
  // a backslash before a digit is not an escape at all, so it would
  // survive into the output as a literal backslash.
  escaped = escaped.replace(
    ORDERED_LEADER,
    (_match, space: string, digits: string, delimiter: string) => {
      return `${space}${digits}\\${delimiter}`
    },
  )
  return escaped
}

/** Undo {@link escapeMarkdown}; used for code spans, where nothing is markup. */
function unescapeMarkdown(text: string): string {
  return text.replace(/\\([\\`*_[\]<>&~|$#+.)>-])/g, '$1')
}

/** Link text may contain brackets; they must stay balanced-escaped. */
function escapeLinkText(text: string): string {
  return text.replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]')
}

/**
 * A link destination. Spaces and parens would end the destination early, so a
 * URL containing them is wrapped in angle brackets, as CommonMark allows.
 */
function encodeDestination(url: string): string {
  if (url === '') return ''
  if (/[\s()<>]/.test(url)) return `<${url.replaceAll('<', '%3C').replaceAll('>', '%3E')}>`
  return url
}

/** Prefix every line of a block, keeping blank lines quoted too. */
function prefixLines(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => (line.length > 0 ? prefix + line : prefix.trimEnd()))
    .join('\n')
}
