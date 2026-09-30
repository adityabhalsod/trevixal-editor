import {
  type Command,
  type Editor,
  type EditorNode,
  type EditorState,
  Fragment,
  type Path,
  ReplaceNodesStep,
  SetNodeAttrsStep,
  TableMap,
  type TableMapCell,
  TextSelection,
  type Transaction,
  inlineLength,
  nodeAtPath,
  pathOfElement,
  pos,
} from '@trevixal/core'
import { cellContextAt, gridCellOf } from './commands'
import { rowGroups } from './features'
import { cellShownText, parseCellNumber } from './formula'

// ---------------------------------------------------------------- column types

/** What a column holds, beyond text: it sets how the column's cells align and show. */
export type ColumnType = 'text' | 'number' | 'currency' | 'percentage' | 'date' | 'checkbox'

export const COLUMN_TYPES: readonly ColumnType[] = [
  'text',
  'number',
  'currency',
  'percentage',
  'date',
  'checkbox',
]

/** A cell's `valueType` as stored: a known type bar text, which is stored as null. */
export function cellValueType(value: unknown): Exclude<ColumnType, 'text'> | null {
  return value !== 'text' && COLUMN_TYPES.includes(value as ColumnType)
    ? (value as Exclude<ColumnType, 'text'>)
    : null
}

const CURRENCY_SIGN = /[$£€¥₹]/

/** The whole numbers of `value` with thousands separators, and its decimals up to `places`. */
function grouped(value: number, minimum: number, maximum: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: minimum,
    maximumFractionDigits: maximum,
  }).format(value)
}

/** A date written the way no reader can mistake: `2026-10-01`. Null when `text` is not a date. */
export function isoDate(text: string): string | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed)
  const date = iso
    ? new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])))
    : /[a-z]/i.test(trimmed) || /^\d{1,2}[/.]\d{1,2}[/.]\d{2,4}$/.test(trimmed)
      ? new Date(`${trimmed} UTC`)
      : null
  if (!date || Number.isNaN(date.getTime())) return null
  const day = (value: number): string => String(value).padStart(2, '0')
  return `${date.getUTCFullYear()}-${day(date.getUTCMonth() + 1)}-${day(date.getUTCDate())}`
}

/**
 * A cell's text written the way its column's type shows values: numbers with
 * thousands separators, money to two places after its sign, a percentage
 * with its sign (a value up to one read as a share of one), a date as
 * `yyyy-mm-dd`. Text that does not read as the type is left as it is.
 */
export function formatForType(text: string, type: ColumnType, sign = '$'): string {
  const number = parseCellNumber(text)
  switch (type) {
    case 'number':
      return number === null ? text : grouped(number, 0, 2)
    case 'currency': {
      if (number === null) return text
      const own = CURRENCY_SIGN.exec(text)?.[0] ?? sign
      return `${number < 0 ? '-' : ''}${own}${grouped(Math.abs(number), 2, 2)}`
    }
    case 'percentage': {
      if (number === null) return text
      // `25%` reads as a quarter; so does `0.25`, a share of one. `25` is 25%.
      const shareOfOne = text.trim().endsWith('%') || Math.abs(number) < 1
      return `${grouped(shareOfOne ? number * 100 : number, 0, 2)}%`
    }
    case 'date':
      return isoDate(text) ?? text
    default:
      return text
  }
}

/** Words a checkbox column reads as ticked. */
const TICKED = /^(?:x|yes|y|true|done|on|1|✓|✔|☑)$/i
/** Words it reads as not ticked, and clears. */
const UNTICKED = /^(?:no|n|false|off|0|☐)$/i

/** The cells a column command acts on: the columns the selection covers, bar header cells. */
function columnCells(state: EditorState): { tablePath: Path; cells: TableMapCell[] } | null {
  const from = cellContextAt(state.doc, state.selection.from)
  const to = cellContextAt(state.doc, state.selection.to)
  if (!from) return null
  const map = TableMap.of(from.table)
  const first = gridCellOf(from)
  const last = to && to.tablePath.join('/') === from.tablePath.join('/') ? gridCellOf(to) : first
  const left = Math.min(first.left, last.left)
  const right = Math.max(first.left + first.width, last.left + last.width)
  const cells = map
    .cellsIn({ top: 0, bottom: map.height, left, right })
    .filter((cell) => cell.node.attrs.header !== true)
  return { tablePath: from.tablePath, cells }
}

/**
 * Give the selection's columns a type: numbers, money, percentages and dates
 * align right and are rewritten to show as their type, and a checkbox column
 * draws a box in each cell, ticked where the text said so. Text takes the
 * type off again, leaving the values as they now read. Header cells keep
 * their text. Declines outside a table.
 */
export function setColumnType(type: ColumnType): Command {
  return (state) => {
    const found = columnCells(state)
    if (!found) return null
    const valueType = cellValueType(type)
    const texts = found.cells.map((cell) => cellShownText(cell.node))
    const sign = texts.map((text) => CURRENCY_SIGN.exec(text)?.[0]).find(Boolean) ?? '$'
    const tr = state.tr
    const schema = state.schema
    found.cells.forEach((cell, index) => {
      const path = [...found.tablePath, cell.row, cell.index]
      const text = texts[index] ?? ''
      let checked = cell.node.attrs.checked === true
      let replacement: string | null = null
      if (type === 'checkbox') {
        if (TICKED.test(text)) {
          checked = true
          replacement = ''
        } else if (UNTICKED.test(text)) {
          checked = false
          replacement = ''
        }
      } else {
        const formatted = formatForType(text, type, sign)
        if (formatted !== text && onlyText(cell.node)) replacement = formatted
      }
      const attrs = {
        ...cell.node.attrs,
        valueType,
        checked: type === 'checkbox' ? checked : false,
      }
      if (replacement !== null) {
        const paragraph = schema.firstTextblockType()
        const content = replacement ? Fragment.of(schema.text(replacement)) : Fragment.empty
        const node = cell.node.type.create(attrs, Fragment.of(paragraph.create(undefined, content)))
        tr.step(
          new ReplaceNodesStep(path.slice(0, -1), cell.index, cell.index + 1, Fragment.of(node)),
        )
      } else if (
        cell.node.attrs.valueType !== valueType ||
        cell.node.attrs.checked !== attrs.checked
      ) {
        tr.step(new SetNodeAttrsStep(path, attrs))
      }
    })
    if (!tr.docChanged) return null
    const selection = state.selection
    return tr.setSelection(
      selection instanceof TextSelection ? keepCaret(tr.doc, selection) : selection,
    )
  }
}

/** The selection kept, or brought to the start of its cell when a rewrite took its place away. */
function keepCaret(doc: EditorNode, selection: TextSelection): TextSelection {
  const valid = (path: Path, offset: number): boolean => {
    const node = nodeAtPath(doc, path)
    return !!node?.isTextblock && offset <= inlineLength(node.content)
  }
  if (
    valid(selection.from.path, selection.from.offset) &&
    valid(selection.to.path, selection.to.offset)
  ) {
    return selection
  }
  return new TextSelection(pos(selection.from.path, 0))
}

/** Whether a cell holds one paragraph of plain text, the only kind a type rewrites. */
function onlyText(cell: EditorNode): boolean {
  if (cell.childCount !== 1) return false
  const block = cell.child(0)
  return block.isTextblock && block.content.children.every((child) => child.isText)
}

/** The type of the caret's column, as its cell says: text when it says nothing. */
export function columnTypeAt(state: EditorState): ColumnType | null {
  const context = cellContextAt(state.doc, state.selection.from)
  if (!context) return null
  return cellValueType(context.cell.attrs.valueType) ?? 'text'
}

/** Tick or untick a checkbox cell. Declines for a path that is not a checkbox cell. */
export function toggleCellChecked(cellPath: Path): Command {
  return (state) => {
    const cell = nodeAtPath(state.doc, cellPath)
    if (cell?.type.name !== 'tableCell' || cell.attrs.valueType !== 'checkbox') return null
    const tr = state.tr.step(
      new SetNodeAttrsStep(cellPath, { ...cell.attrs, checked: cell.attrs.checked !== true }),
    )
    return tr.setSelection(new TextSelection(state.selection.from, state.selection.to))
  }
}

/** How far into a checkbox cell its box reaches, in px, as the stylesheet draws it. */
const CHECKBOX_REACH = 28

/**
 * Tick a checkbox cell's box with a click on it. The box is drawn at the
 * start of the cell; a press there toggles it and moves no caret, as a task
 * item's box does. Returns a disposer.
 */
export function enableCellCheckboxes(editor: Editor): () => void {
  const view = editor.view
  if (!view) return () => {}
  const onMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0 || !editor.isEditable) return
    const target = event.target as Element | null
    const cell = target?.closest?.('td[data-value-type="checkbox"], th[data-value-type="checkbox"]')
    if (!(cell instanceof HTMLElement) || !view.dom.contains(cell)) return
    const box = cell.getBoundingClientRect()
    const rtl = getComputedStyle(cell).direction === 'rtl'
    const reach = rtl ? box.right - event.clientX : event.clientX - box.left
    if (reach > CHECKBOX_REACH) return
    const path = pathOfElement(view.dom, view.renderer, cell)
    if (!path) return
    event.preventDefault()
    editor.exec(toggleCellChecked(path))
  }
  view.dom.addEventListener('mousedown', onMouseDown)
  return () => view.dom.removeEventListener('mousedown', onMouseDown)
}

// ---------------------------------------------------------- filter and hide

/** How a row filter compares a cell with its value. */
export type FilterCondition =
  | 'contains'
  | 'notContains'
  | 'equals'
  | 'greater'
  | 'less'
  | 'empty'
  | 'notEmpty'

export const FILTER_CONDITIONS: readonly FilterCondition[] = [
  'contains',
  'notContains',
  'equals',
  'greater',
  'less',
  'empty',
  'notEmpty',
]

export interface RowFilter {
  /** The grid column the rows are filtered by. */
  readonly column: number
  readonly condition: FilterCondition
  readonly value?: string
}

/** Whether a cell's text passes a filter. Numbers compare as numbers when both sides are. */
export function passesFilter(text: string, filter: RowFilter): boolean {
  const value = (filter.value ?? '').trim()
  const own = text.trim()
  const folded = (input: string): string => input.toLocaleLowerCase()
  const number = parseCellNumber(own)
  const against = parseCellNumber(value)
  switch (filter.condition) {
    case 'contains':
      return folded(own).includes(folded(value))
    case 'notContains':
      return !folded(own).includes(folded(value))
    case 'equals':
      return number !== null && against !== null
        ? number === against
        : folded(own) === folded(value)
    case 'greater':
      return number !== null && against !== null ? number > against : folded(own) > folded(value)
    case 'less':
      return number !== null && against !== null ? number < against : folded(own) < folded(value)
    case 'empty':
      return own === ''
    case 'notEmpty':
      return own !== ''
  }
}

/** The header row's texts, or column letters where there is none, for a filter to be picked by. */
export function tableColumnLabels(state: EditorState): string[] {
  const context = cellContextAt(state.doc, state.selection.from)
  if (!context) return []
  const map = TableMap.of(context.table)
  const header = context.table.child(0).content.children.every((cell) => cell.attrs.header === true)
  return Array.from({ length: map.width }, (_, column) => {
    const letter = String.fromCharCode(65 + (column % 26))
    const cell = header ? map.at(0, column) : null
    const text = cell ? cellShownText(cell.node) : ''
    return text ? `${letter}: ${text}` : `Column ${letter}`
  })
}

/**
 * Hide the table's body rows that do not pass a filter, without deleting
 * them: they are only out of sight, on screen and in print, until Show all
 * rows. The header row always shows, and rows a merged cell ties together
 * are shown or hidden together, by the first of them. Declines outside a
 * table and for a column the table does not have.
 */
export function filterRows(filter: RowFilter): Command {
  return (state) => {
    const context = cellContextAt(state.doc, state.selection.from)
    if (!context) return null
    const { table, tablePath } = context
    const map = TableMap.of(table)
    if (!Number.isInteger(filter.column) || filter.column < 0 || filter.column >= map.width) {
      return null
    }
    const header = table.child(0).content.children.every((cell) => cell.attrs.header === true)
    const groups = rowGroups(table).slice(header ? 1 : 0)
    const hiddenRows = new Set<number>()
    for (const group of groups) {
      const cell = map.at(group.first, filter.column)
      const text = cell && cell.top === group.first ? cellShownText(cell.node) : ''
      if (passesFilter(text, filter)) continue
      for (let row = group.first; row <= group.last; row++) hiddenRows.add(row)
    }
    const tr = state.tr
    for (const group of groups) {
      for (let row = group.first; row <= group.last; row++) {
        setRowHidden(tr, table, tablePath, row, hiddenRows.has(row))
      }
    }
    if (!tr.docChanged) return null
    // The caret leaves a row it can no longer be seen in, for the first one still showing.
    if (!hiddenRows.has(context.rowIndex)) {
      return tr.setSelection(new TextSelection(state.selection.from, state.selection.to))
    }
    const shown = table.content.children.findIndex((_, row) => !hiddenRows.has(row))
    return tr.setSelection(cursorAtRow(tablePath, Math.max(0, shown)))
  }
}

function cursorAtRow(tablePath: Path, row: number): TextSelection {
  return new TextSelection(pos([...tablePath, row, 0, 0], 0))
}

function setRowHidden(
  tr: Transaction,
  table: EditorNode,
  tablePath: Path,
  row: number,
  hidden: boolean,
): void {
  const node = table.child(row)
  if ((node.attrs.hidden === true) === hidden) return
  tr.step(new SetNodeAttrsStep([...tablePath, row], { ...node.attrs, hidden }))
}

/** Bring back every row a filter hid. Declines when none is hidden. */
export const showAllRows: Command = (state) => {
  const context = cellContextAt(state.doc, state.selection.from)
  if (!context) return null
  const tr = state.tr
  context.table.content.children.forEach((_, row) =>
    setRowHidden(tr, context.table, context.tablePath, row, false),
  )
  if (!tr.docChanged) return null
  return tr.setSelection(new TextSelection(state.selection.from, state.selection.to))
}

/**
 * Hide the caret's column without deleting it. A cell spanning it and a
 * column still showing stays in sight, since part of a cell cannot be
 * hidden. The caret moves to the next column still showing. Declines when
 * it would leave nothing to see.
 */
export const hideColumn: Command = (state) => {
  const context = cellContextAt(state.doc, state.selection.from)
  if (!context) return null
  const { table, tablePath } = context
  const map = TableMap.of(table)
  const column = gridCellOf(context).left
  const hiddenColumns = new Set<number>([column])
  for (let other = 0; other < map.width; other++) {
    const cells = map.cellsIn({ top: 0, bottom: map.height, left: other, right: other + 1 })
    if (
      cells.length > 0 &&
      cells.every((cell) => cell.width === 1 && cell.node.attrs.hidden === true)
    ) {
      hiddenColumns.add(other)
    }
  }
  if (hiddenColumns.size >= map.width) return null
  const tr = state.tr
  for (const cell of map.cells) {
    if (cell.width !== 1 || cell.left !== column || cell.node.attrs.hidden === true) continue
    tr.step(
      new SetNodeAttrsStep([...tablePath, cell.row, cell.index], {
        ...cell.node.attrs,
        hidden: true,
      }),
    )
  }
  if (!tr.docChanged) return null
  let landing: TableMapCell | null = null
  for (let offset = 1; offset < map.width && !landing; offset++) {
    for (const candidate of [column + offset, column - offset]) {
      if (candidate < 0 || candidate >= map.width || hiddenColumns.has(candidate)) continue
      landing = map.at(context.rowIndex, candidate)
      if (landing) break
    }
  }
  return landing
    ? tr.setSelection(new TextSelection(pos([...tablePath, landing.row, landing.index, 0], 0)))
    : tr
}

/** Bring back every column Hide column hid. Declines when none is hidden. */
export const showAllColumns: Command = (state) => {
  const context = cellContextAt(state.doc, state.selection.from)
  if (!context) return null
  const tr = state.tr
  for (const cell of TableMap.of(context.table).cells) {
    if (cell.node.attrs.hidden !== true) continue
    tr.step(
      new SetNodeAttrsStep([...context.tablePath, cell.row, cell.index], {
        ...cell.node.attrs,
        hidden: false,
      }),
    )
  }
  if (!tr.docChanged) return null
  return tr.setSelection(new TextSelection(state.selection.from, state.selection.to))
}

/** What is hidden in the table at the selection, for the menu to offer bringing it back. */
export function hiddenAt(state: EditorState): { rows: boolean; columns: boolean } | null {
  const context = cellContextAt(state.doc, state.selection.from)
  if (!context) return null
  return {
    rows: context.table.content.children.some((row) => row.attrs.hidden === true),
    columns: TableMap.of(context.table).cells.some((cell) => cell.node.attrs.hidden === true),
  }
}

// ---------------------------------------------------------------------- charts

/** The charts a table can be drawn as. */
export type ChartKind = 'bar' | 'line' | 'pie'

/** A label or title as Mermaid will take it inside double quotes. */
function quoted(text: string): string {
  return `"${text.replace(/"/g, "'").replace(/\s+/g, ' ').trim()}"`
}

/** Whether a cell totals the rows above it: a formula over ABOVE, as a total row holds. */
function totalsAbove(node: EditorNode): boolean {
  if (node.type.name === 'tableFormula')
    return /\bABOVE\b/i.test(String(node.attrs.expression ?? ''))
  return node.content.children.some(totalsAbove)
}

/**
 * Mermaid source for a chart of the table's data: the first column's
 * texts label the points, and every other column holding a number is a
 * series, named by its header. A pie takes the first such column. Rows with
 * no number, and a total row (Word's option, or one whose formulas add up
 * the rows above), are left out. Null when the table has no numbers to draw.
 */
export function tableChartSource(table: EditorNode, kind: ChartKind): string | null {
  const map = TableMap.of(table)
  const header = table.child(0).content.children.every((cell) => cell.attrs.header === true)
  const text = (row: number, column: number): string => {
    const cell = map.at(row, column)
    return cell && cell.top === row ? cellShownText(cell.node) : ''
  }
  // The rows with a number to draw: not the header, not a total row under
  // Word's Total row option, and not a row with no numbers at all.
  const groups = rowGroups(table).slice(header ? 1 : 0)
  const counted = table.attrs.totalRow === true ? groups.slice(0, -1) : groups
  const totalled = (row: number): boolean =>
    Array.from({ length: map.width }, (_, column) => map.at(row, column)).some(
      (cell) => cell !== undefined && cell !== null && cell.top === row && totalsAbove(cell.node),
    )
  const body = counted.filter(
    (group) =>
      !totalled(group.first) &&
      Array.from({ length: map.width - 1 }, (_, offset) => text(group.first, offset + 1)).some(
        (value) => parseCellNumber(value) !== null,
      ),
  )
  if (body.length === 0 || map.width < 2) return null
  const labels = body.map((group) => text(group.first, 0) || `Row ${group.first + 1}`)
  const series: { name: string; values: number[] }[] = []
  for (let column = 1; column < map.width; column++) {
    const values = body.map((group) => parseCellNumber(text(group.first, column)))
    if (values.every((value) => value === null)) continue
    const name = header ? text(0, column) : `Column ${String.fromCharCode(65 + column)}`
    series.push({ name, values: values.map((value) => value ?? 0) })
  }
  const first = series[0]
  if (!first) return null
  if (kind === 'pie') {
    const lines = labels.map((label, index) => `    ${quoted(label)} : ${first.values[index] ?? 0}`)
    return [`pie title ${first.name || 'Chart'}`, ...lines].join('\n')
  }
  const lines = ['xychart-beta', `    x-axis [${labels.map(quoted).join(', ')}]`]
  if (series.length === 1 && first.name) lines.push(`    y-axis ${quoted(first.name)}`)
  for (const { values } of series) lines.push(`    ${kind} [${values.join(', ')}]`)
  return lines.join('\n')
}

/**
 * Word's chart from a table: a Mermaid diagram of the table's data, put in
 * after it as a code block the diagram preview draws. It is a snapshot,
 * made once: change the table and draw the chart again. Declines outside a
 * table, and for a table with no numbers.
 */
export function insertTableChart(kind: ChartKind): Command {
  return (state) => {
    const context = cellContextAt(state.doc, state.selection.from)
    const codeBlock = state.schema.nodes.codeBlock
    if (!context || !codeBlock) return null
    const source = tableChartSource(context.table, kind)
    if (!source) return null
    const block = codeBlock.create({ language: 'mermaid' }, Fragment.of(state.schema.text(source)))
    const parent = context.tablePath.slice(0, -1)
    const index = (context.tablePath[context.tablePath.length - 1] as number) + 1
    const tr = state.tr.step(new ReplaceNodesStep(parent, index, index, Fragment.of(block)))
    return tr.setSelection(new TextSelection(pos([...parent, index], 0)))
  }
}
