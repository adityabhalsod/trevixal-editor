import {
  type Command,
  type EditorNode,
  type EditorState,
  Fragment,
  type Path,
  ReplaceNodesStep,
  type Schema,
  SetNodeAttrsStep,
  TextSelection,
  blocksInRange,
  pos,
  safeColor,
} from '@trevixal/core'
import { cellContextAt, colspanOf, columnStart } from './commands'
import { type TableBorders, tableBorders } from './schema'

// ---------------------------------------------------------------- cell styling

export interface CellRef {
  readonly path: Path
  readonly cell: EditorNode
}

/**
 * The cells a selection covers, as a rectangle of the grid: every row between
 * the anchor's and the head's, and in each of them the cells overlapping the
 * columns between the two. A caret yields just its own cell; a selection that
 * leaves the table yields nothing.
 */
export function cellsInSelection(state: EditorState): readonly CellRef[] {
  const from = cellContextAt(state.doc, state.selection.from)
  const to = cellContextAt(state.doc, state.selection.to)
  if (!from) return []
  if (!to || to.tablePath.join('/') !== from.tablePath.join('/')) {
    return [{ path: cellPath(from.tablePath, from.rowIndex, from.cellIndex), cell: from.cell }]
  }
  const firstColumn = Math.min(
    columnStart(from.row, from.cellIndex),
    columnStart(to.row, to.cellIndex),
  )
  const lastColumn = Math.max(
    columnStart(from.row, from.cellIndex) + colspanOf(from.cell) - 1,
    columnStart(to.row, to.cellIndex) + colspanOf(to.cell) - 1,
  )
  const cells: CellRef[] = []
  const firstRow = Math.min(from.rowIndex, to.rowIndex)
  const lastRow = Math.max(from.rowIndex, to.rowIndex)
  for (let rowIndex = firstRow; rowIndex <= lastRow; rowIndex++) {
    const row = from.table.content.maybeChild(rowIndex)
    if (!row) continue
    let column = 0
    for (let cellIndex = 0; cellIndex < row.childCount; cellIndex++) {
      const cell = row.child(cellIndex)
      const end = column + colspanOf(cell) - 1
      if (end >= firstColumn && column <= lastColumn) {
        cells.push({ path: cellPath(from.tablePath, rowIndex, cellIndex), cell })
      }
      column = end + 1
    }
  }
  return cells
}

function cellPath(tablePath: Path, rowIndex: number, cellIndex: number): Path {
  return [...tablePath, rowIndex, cellIndex]
}

/**
 * Paint the background of every cell the selection covers. `null` clears it.
 * Colours go through the core sanitizer, so an unparseable value declines
 * rather than landing in a `style` attribute.
 */
export function setCellBackground(color: string | null): Command {
  return (state) => {
    const background = color === null ? null : safeColor(color)
    if (color !== null && !background) return null
    const cells = cellsInSelection(state)
    if (cells.length === 0) return null
    const tr = state.tr
    for (const { path, cell } of cells) {
      if (cell.attrs.background === background) continue
      tr.step(new SetNodeAttrsStep(path, { ...cell.attrs, background }))
    }
    if (!tr.docChanged) return null
    tr.setSelection(new TextSelection(state.selection.from, state.selection.to))
    return tr
  }
}

/** Choose which rules the table draws: all, only the outline, horizontal, or none. */
export function setTableBorders(borders: TableBorders | null): Command {
  return (state) => {
    const context = cellContextAt(state.doc, state.selection.from)
    if (!context) return null
    const next = borders === null ? null : tableBorders(borders)
    if (borders !== null && !next) return null
    const tr = state.tr
    if (context.table.attrs.borders !== next) {
      tr.step(new SetNodeAttrsStep(context.tablePath, { ...context.table.attrs, borders: next }))
    }
    // A style for the whole table also brings back every line erased from it,
    // as Word's All Borders does; otherwise "all borders" would not be all.
    context.table.content.children.forEach((row, rowIndex) => {
      row.content.children.forEach((cell, cellIndex) => {
        if (cell.attrs.hiddenBorders === null || cell.attrs.hiddenBorders === undefined) return
        const path = cellPath(context.tablePath, rowIndex, cellIndex)
        tr.step(new SetNodeAttrsStep(path, { ...cell.attrs, hiddenBorders: null }))
      })
    })
    if (!tr.docChanged) return null
    tr.setSelection(new TextSelection(state.selection.from, state.selection.to))
    return tr
  }
}

/** Colour the table's rules; `null` restores the theme's border colour. */
export function setTableBorderColor(color: string | null): Command {
  return (state) => {
    const context = cellContextAt(state.doc, state.selection.from)
    if (!context) return null
    const borderColor = color === null ? null : safeColor(color)
    if (color !== null && !borderColor) return null
    if (context.table.attrs.borderColor === borderColor) return null
    const tr = state.tr
    tr.step(new SetNodeAttrsStep(context.tablePath, { ...context.table.attrs, borderColor }))
    tr.setSelection(new TextSelection(state.selection.from, state.selection.to))
    return tr
  }
}

// ---------------------------------------------------------------------- sorting

export interface SortTableOptions {
  /** Grid column to sort by; the caret's column when omitted. */
  readonly column?: number
  readonly direction?: 'asc' | 'desc'
  /**
   * Whether the first row is a header that stays put. `'auto'` (the default)
   * treats a first row made entirely of header cells as one.
   */
  readonly header?: boolean | 'auto'
}

const NUMERIC = /^[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?$/

/** The text of the cell covering a grid column, or '' when the row is short. */
function cellTextAtColumn(row: EditorNode, column: number): string {
  let start = 0
  for (const cell of row.content.children) {
    const end = start + colspanOf(cell)
    if (column >= start && column < end) return cell.textContent.trim()
    start = end
  }
  return ''
}

/**
 * Compare two cell texts the way a spreadsheet would: numbers (with thousands
 * separators or a trailing %) numerically, everything else with a
 * locale-aware, case-insensitive collation; blanks sort last either way.
 */
export function compareCellText(a: string, b: string, collator: Intl.Collator): number {
  if (a === b) return 0
  if (a === '') return 1
  if (b === '') return -1
  if (NUMERIC.test(a) && NUMERIC.test(b)) {
    return Number.parseFloat(a.replaceAll(',', '')) - Number.parseFloat(b.replaceAll(',', ''))
  }
  return collator.compare(a, b)
}

/**
 * Sort the table's body rows by one column. The sort is stable, so rows that
 * tie keep their order, and the caret follows the row it was in.
 */
export function sortTable(options: SortTableOptions = {}): Command {
  return (state) => {
    const context = cellContextAt(state.doc, state.selection.from)
    if (!context) return null
    const rows = context.table.content.children
    const header =
      options.header === undefined || options.header === 'auto'
        ? (rows[0]?.content.children.every((cell) => cell.attrs.header === true) ?? false)
        : options.header
    const start = header ? 1 : 0
    const body = rows.slice(start)
    if (body.length < 2) return null
    const column = options.column ?? columnStart(context.row, context.cellIndex)
    const direction = options.direction ?? 'asc'
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
    const keyed = body.map((row, index) => ({ row, index, key: cellTextAtColumn(row, column) }))
    keyed.sort((a, b) => {
      // Blank cells sink to the bottom whichever way the rest is sorted.
      if ((a.key === '') !== (b.key === '')) return a.key === '' ? 1 : -1
      const order = compareCellText(a.key, b.key, collator)
      if (order !== 0) return direction === 'asc' ? order : -order
      return a.index - b.index
    })
    if (keyed.every((entry, index) => entry.index === index)) return null
    const tr = state.tr
    tr.step(
      new ReplaceNodesStep(
        context.tablePath,
        start,
        rows.length,
        Fragment.from(keyed.map((entry) => entry.row)),
      ),
    )
    const moved = keyed.findIndex((entry) => entry.row === context.row)
    const rowIndex = moved === -1 ? context.rowIndex : start + moved
    tr.setSelection(
      new TextSelection(pos([...context.tablePath, rowIndex, context.cellIndex, 0], 0)),
    )
    return tr
  }
}

// ------------------------------------------------------------ text <-> table

export type TextSeparator = 'auto' | 'tab' | 'comma' | 'semicolon' | 'pipe' | 'spaces'

export interface TextToTableOptions {
  /** How lines split into cells; `'auto'` picks the delimiter every line shares. */
  readonly separator?: TextSeparator
  /** Make the first row a header row. Defaults to true. */
  readonly headerRow?: boolean
}

const SEPARATORS: Readonly<Record<Exclude<TextSeparator, 'auto'>, RegExp>> = {
  tab: /\t/,
  pipe: /\s*\|\s*/,
  semicolon: /\s*;\s*/,
  comma: /\s*,\s*/,
  spaces: / {2,}/,
}

/** A markdown table's `|---|:--:|` rule, which carries no data. */
const MARKDOWN_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

/**
 * Pick the delimiter that appears on every line. Tabs win (a paste from a
 * spreadsheet), then pipes (markdown), semicolons, commas, and finally runs
 * of two or more spaces; when nothing fits, each line is one cell.
 */
export function detectTextSeparator(
  lines: readonly string[],
): Exclude<TextSeparator, 'auto'> | null {
  const candidates: Exclude<TextSeparator, 'auto'>[] = [
    'tab',
    'pipe',
    'semicolon',
    'comma',
    'spaces',
  ]
  const data = lines.filter((line) => line.trim().length > 0 && !MARKDOWN_RULE.test(line))
  if (data.length === 0) return null
  for (const name of candidates) {
    if (data.every((line) => SEPARATORS[name].test(line))) return name
  }
  return null
}

function splitLine(line: string, separator: Exclude<TextSeparator, 'auto'> | null): string[] {
  if (!separator) return [line.trim()]
  let text = line
  if (separator === 'pipe') text = text.trim().replace(/^\|/, '').replace(/\|$/, '')
  return text.split(SEPARATORS[separator]).map((cell) => cell.trim())
}

/** Build a table node from a grid of cell texts; short rows are padded. */
export function buildTable(
  schema: Schema,
  rows: readonly (readonly string[])[],
  headerRow: boolean,
): EditorNode {
  const cellType = schema.nodeType('tableCell')
  const rowType = schema.nodeType('tableRow')
  const paragraph = schema.firstTextblockType()
  const width = Math.max(1, ...rows.map((row) => row.length))
  const rowNodes = rows.map((row, rowIndex) => {
    const cells: EditorNode[] = []
    for (let column = 0; column < width; column++) {
      const text = row[column] ?? ''
      const lines = text.split(/\r?\n/)
      const blocks = lines.map((line) =>
        paragraph.create(undefined, line ? Fragment.of(schema.text(line)) : Fragment.empty),
      )
      cells.push(
        cellType.create(
          { header: headerRow && rowIndex === 0, colspan: 1, align: null },
          Fragment.from(blocks),
        ),
      )
    }
    return rowType.create(undefined, Fragment.from(cells))
  })
  return schema.nodeType('table').create(undefined, Fragment.from(rowNodes))
}

/**
 * Turn the selected paragraphs into a table, one row per paragraph, split by
 * the detected (or given) delimiter. Declines inside a table, or when the
 * selection is not a run of sibling textblocks.
 */
export function convertTextToTable(options: TextToTableOptions = {}): Command {
  return (state) => {
    if (cellContextAt(state.doc, state.selection.from)) return null
    const blocks = blocksInRange(state.doc, state.selection.from, state.selection.to).filter(
      (block) => block.node.isTextblock,
    )
    if (blocks.length === 0) return null
    const parentPath = blocks[0]?.path.slice(0, -1) ?? []
    const first = blocks[0]?.path[blocks[0].path.length - 1]
    if (first === undefined) return null
    const contiguous = blocks.every(
      (block, index) =>
        block.path.length === parentPath.length + 1 &&
        block.path.slice(0, -1).join('/') === parentPath.join('/') &&
        block.path[block.path.length - 1] === first + index,
    )
    if (!contiguous) return null
    const lines = blocks.map((block) => block.node.textContent)
    const separator =
      (options.separator ?? 'auto') === 'auto'
        ? detectTextSeparator(lines)
        : (options.separator as Exclude<TextSeparator, 'auto'>)
    const rows = lines
      .filter((line) => !(separator === 'pipe' && MARKDOWN_RULE.test(line)))
      .map((line) => splitLine(line, separator))
    if (rows.length === 0) return null
    const table = buildTable(state.schema, rows, options.headerRow !== false)
    const tr = state.tr
    tr.step(new ReplaceNodesStep(parentPath, first, first + blocks.length, Fragment.of(table)))
    tr.setSelection(new TextSelection(pos([...parentPath, first, 0, 0, 0], 0)))
    return tr
  }
}

export interface TableToTextOptions {
  /** Put between cells on a line; a tab by default, so a spreadsheet reads it back. */
  readonly separator?: string
}

/** Flatten the table at the selection into one paragraph per row. */
export function convertTableToText(options: TableToTextOptions = {}): Command {
  return (state) => {
    const context = cellContextAt(state.doc, state.selection.from)
    if (!context) return null
    const separator = options.separator ?? '\t'
    const paragraph = state.schema.firstTextblockType()
    const blocks = context.table.content.children.map((row) => {
      const text = row.content.children
        // A cell's blocks are separate lines; run together they would weld the
        // last word of one to the first of the next.
        .map((cell) => cell.content.children.map((block) => block.textContent).join('\n'))
        .map((cell) => cell.replace(/\s*\n\s*/g, ' ').trim())
        .join(separator)
      return paragraph.create(
        undefined,
        text ? Fragment.of(state.schema.text(text)) : Fragment.empty,
      )
    })
    const parentPath = context.tablePath.slice(0, -1)
    const index = context.tablePath[context.tablePath.length - 1] as number
    const tr = state.tr
    tr.step(new ReplaceNodesStep(parentPath, index, index + 1, Fragment.from(blocks)))
    tr.setSelection(new TextSelection(pos([...parentPath, index], 0)))
    return tr
  }
}

// -------------------------------------------------------------------------- CSV

export type CSVDelimiter = ',' | ';' | '\t' | '|'

/**
 * Guess a CSV file's delimiter from its first line, counting separators that
 * sit outside quotes. Commas win ties, as the format's name suggests.
 */
export function detectDelimiter(text: string): CSVDelimiter {
  const counts: Record<CSVDelimiter, number> = { ',': 0, ';': 0, '\t': 0, '|': 0 }
  let quoted = false
  // The first *record*, not the first line: a quoted field may hold line
  // breaks, and stopping at the first one would count the separators of half
  // a record, or, for a leading quoted field, none at all.
  for (let index = 0; index < text.length; index++) {
    const char = text[index] as string
    if (quoted) {
      if (char !== '"') continue
      if (text[index + 1] === '"') index += 1
      else quoted = false
      continue
    }
    if (char === '"') quoted = true
    else if (char === '\n' || char === '\r') break
    else if (char in counts) counts[char as CSVDelimiter] += 1
  }
  let best: CSVDelimiter = ','
  for (const delimiter of ['\t', ';', '|'] as const) {
    if (counts[delimiter] > counts[best]) best = delimiter
  }
  return best
}

/**
 * Parse RFC 4180 CSV: quoted fields may hold the delimiter, doubled quotes
 * and line breaks; lines end in `\n` or `\r\n`; a trailing newline adds no
 * row. Malformed input never throws. An unclosed quote runs to the end.
 */
export function parseCSV(input: string, delimiter: CSVDelimiter | 'auto' = 'auto'): string[][] {
  // A spreadsheet writes UTF-8 with a byte-order mark; left in place it would
  // become part of the first heading.
  const text = input.startsWith('\uFEFF') ? input.slice(1) : input
  const separator = delimiter === 'auto' ? detectDelimiter(text) : delimiter
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let index = 0
  while (index < text.length) {
    const char = text[index] as string
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }
        quoted = false
      } else {
        field += char
      }
      index += 1
      continue
    }
    if (char === '"' && field.length === 0) {
      quoted = true
    } else if (char === separator) {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
    index += 1
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  // A blank line is not a record, but a line of empty fields (`,,`) is one,
  // dropping it would shift every row below it up.
  return rows.filter((entry) => entry.length > 1 || entry.some((cell) => cell.length > 0))
}

/** Quote a field when the delimiter, a quote, a line break or edge spaces demand it. */
function csvField(value: string, delimiter: string): string {
  const needsQuotes =
    value.includes(delimiter) ||
    value.includes('"') ||
    /[\r\n]/.test(value) ||
    value !== value.trim()
  return needsQuotes ? `"${value.replaceAll('"', '""')}"` : value
}

export function rowsToCSV(
  rows: readonly (readonly string[])[],
  delimiter: CSVDelimiter = ',',
): string {
  return rows
    .map((row) => row.map((cell) => csvField(cell, delimiter)).join(delimiter))
    .join('\r\n')
}

/**
 * The table as a grid of texts. A merged cell contributes its text once and
 * empty strings for the columns it spans, so every row keeps its width.
 */
export function tableToRows(table: EditorNode): string[][] {
  return table.content.children.map((row) => {
    const cells: string[] = []
    for (const cell of row.content.children) {
      cells.push(cellText(cell))
      for (let extra = 1; extra < colspanOf(cell); extra++) cells.push('')
    }
    return cells
  })
}

/** A cell's text with its blocks joined by line breaks, as CSV expects. */
function cellText(cell: EditorNode): string {
  return cell.content.children.map((block) => block.textContent).join('\n')
}

export function tableToCSV(table: EditorNode, delimiter: CSVDelimiter = ','): string {
  return rowsToCSV(tableToRows(table), delimiter)
}

/** CSV for the table at the selection, or null outside a table. */
export function csvAtSelection(state: EditorState, delimiter: CSVDelimiter = ','): string | null {
  const context = cellContextAt(state.doc, state.selection.from)
  return context ? tableToCSV(context.table, delimiter) : null
}

export interface InsertCSVOptions {
  readonly delimiter?: CSVDelimiter | 'auto'
  /** Make the first row a header row. Defaults to true. */
  readonly headerRow?: boolean
}

/**
 * Insert a table built from CSV text, replacing an empty paragraph at the
 * caret, otherwise after the current block. Declines for CSV with no data.
 */
export function insertTableFromCSV(csv: string, options: InsertCSVOptions = {}): Command {
  return (state) => {
    const rows = parseCSV(csv, options.delimiter ?? 'auto')
    if (rows.length === 0) return null
    const table = buildTable(state.schema, rows, options.headerRow !== false)
    const blockPath = state.selection.to.path
    if (blockPath.length === 0) return null
    const parentPath = blockPath.slice(0, -1)
    const index = blockPath[blockPath.length - 1] as number
    const block = state.doc.content.maybeChild(blockPath[0] as number)
    const replaceEmpty =
      blockPath.length === 1 && block?.isTextblock === true && block.textContent.length === 0
    const tr = state.tr
    const at = replaceEmpty ? index : index + 1
    tr.step(new ReplaceNodesStep(parentPath, at, replaceEmpty ? index + 1 : at, Fragment.of(table)))
    tr.setSelection(new TextSelection(pos([...parentPath, at, 0, 0, 0], 0)))
    return tr
  }
}
