import {
  type Command,
  type Editor,
  type EditorNode,
  type EditorState,
  NodeSelection,
  type NodeSpec,
  type Path,
  SetNodeAttrsStep,
  type Step,
  TableMap,
  type TableMapCell,
  TextSelection,
  type Transaction,
  insertInlineNode,
  nodeAtPath,
} from '@trevixal/core'
import { cellContextAt, gridCellOf } from './commands'

/** The functions a formula can call, Word's table set. */
export const FORMULA_FUNCTIONS = ['SUM', 'AVERAGE', 'COUNT', 'MIN', 'MAX', 'PRODUCT'] as const

/** Word's words for the cells in a line from the formula's own cell. */
const DIRECTIONS = ['ABOVE', 'BELOW', 'LEFT', 'RIGHT'] as const

/** What Word shows for a formula it cannot work out. */
export const FORMULA_ERROR = '!Syntax Error'
/** What Word shows for a division by zero. */
export const FORMULA_ZERO_DIVIDE = '!Zero Divide'

const FORMULA_NODE = 'tableFormula'

/**
 * The inline node a table formula is, as Word's `{ = SUM(ABOVE) }` field:
 * its expression, an optional number format, and the result it last came
 * to. The result is what shows and what every export writes; the updater
 * keeps it current as the table changes.
 */
export function formulaNodes(): Record<string, NodeSpec> {
  return {
    [FORMULA_NODE]: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: {
        expression: { default: 'SUM(ABOVE)' },
        format: { default: null },
        result: { default: '' },
      },
      toHTML: (node) => {
        const attrs: Record<string, string> = {
          class: 'trevixal-formula',
          'data-formula': String(node.attrs.expression ?? ''),
        }
        if (typeof node.attrs.format === 'string' && node.attrs.format) {
          attrs['data-format'] = node.attrs.format
        }
        return { tag: 'span', attrs, text: String(node.attrs.result ?? '') }
      },
      parseHTML: [
        {
          tag: 'span',
          attribute: 'data-formula',
          getAttrs: (element) => ({
            expression: element.getAttribute('data-formula') ?? '',
            format: element.getAttribute('data-format'),
            result: element.textContent ?? '',
          }),
        },
      ],
    },
  }
}

// --------------------------------------------------------------- the values

/** Currency signs a spreadsheet writes before a number. */
const CURRENCY = /[$£€¥₹]/g

/**
 * The number a cell's text reads as, the way a spreadsheet reads one:
 * thousands separators, a currency sign, a trailing percent (a share of
 * one), and accounting brackets for a negative. Null for anything else.
 */
export function parseCellNumber(text: string): number | null {
  let value = text.trim().replace(CURRENCY, '').replaceAll(',', '').replace(/\s+/g, '')
  if (value === '') return null
  let negative = false
  if (/^\(.*\)$/.test(value)) {
    negative = true
    value = value.slice(1, -1)
  }
  const percent = value.endsWith('%')
  if (percent) value = value.slice(0, -1)
  if (!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(value)) return null
  const number = Number.parseFloat(value) / (percent ? 100 : 1)
  return negative ? -number : number
}

/** A cell's text as it shows, formula results included. */
export function cellShownText(cell: EditorNode): string {
  let text = ''
  const visit = (node: EditorNode): void => {
    if (node.isText) text += node.textContent
    else if (node.type.name === FORMULA_NODE) text += String(node.attrs.result ?? '')
    else {
      for (const child of node.content.children) visit(child)
      if (node.isTextblock) text += ' '
    }
  }
  visit(cell)
  return text.trim()
}

// ------------------------------------------------------------------- parsing

type Token =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'word'; readonly value: string }
  | { readonly kind: 'cell'; readonly row: number; readonly column: number }
  | { readonly kind: 'symbol'; readonly value: string }

class FormulaError extends Error {
  constructor(readonly display: string) {
    super(display)
  }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  const pattern =
    /\s*(?:(\d+(?:\.\d*)?|\.\d+)|([A-Z]{1,3})(\d{1,5})(?![A-Z0-9])|([A-Z][A-Z]*)|([-+*/(),:]))/iy
  let index = 0
  while (index < source.length) {
    pattern.lastIndex = index
    const match = pattern.exec(source)
    if (!match) {
      if (/^\s*$/.test(source.slice(index))) break
      throw new FormulaError(FORMULA_ERROR)
    }
    index = pattern.lastIndex
    const [, number, letters, digits, word, symbol] = match
    if (number !== undefined) tokens.push({ kind: 'number', value: Number.parseFloat(number) })
    else if (letters !== undefined && digits !== undefined) {
      tokens.push({ kind: 'cell', row: Number(digits) - 1, column: columnIndex(letters) })
    } else if (word !== undefined) tokens.push({ kind: 'word', value: word.toUpperCase() })
    else if (symbol !== undefined) tokens.push({ kind: 'symbol', value: symbol })
  }
  return tokens
}

/** `A` is column 0, `Z` 25, `AA` 26: a spreadsheet's column letters. */
function columnIndex(letters: string): number {
  let index = 0
  for (const letter of letters.toUpperCase()) index = index * 26 + (letter.charCodeAt(0) - 64)
  return index - 1
}

/** The cells a formula can see: its own table's, read through the grid. */
export interface FormulaScope {
  readonly map: TableMap
  /** The formula's own cell. */
  readonly cell: TableMapCell
  /** The number a cell stands for, or null for text or an empty cell. */
  readonly valueOf: (cell: TableMapCell) => number | null
}

/**
 * Work out a formula, Word's way: `SUM(ABOVE)`, `AVERAGE(LEFT)`,
 * `COUNT(B2:B5)`, `MAX(A1,C1)`, or arithmetic such as `A1*2+B1`. A leading
 * `=` is allowed. Throws a {@link FormulaError} carrying Word's message when
 * it cannot.
 */
export function evaluateFormula(expression: string, scope: FormulaScope): number {
  const tokens = tokenize(expression.replace(/^\s*=/, ''))
  let position = 0
  const peek = (): Token | undefined => tokens[position]
  const take = (): Token | undefined => tokens[position++]
  const expectSymbol = (value: string): void => {
    const token = take()
    if (token?.kind !== 'symbol' || token.value !== value) throw new FormulaError(FORMULA_ERROR)
  }

  const cellValue = (row: number, column: number): number => {
    const cell = scope.map.at(row, column)
    return cell ? (scope.valueOf(cell) ?? 0) : 0
  }

  const argument = (): number[] => {
    const token = peek()
    if (token?.kind === 'word' && (DIRECTIONS as readonly string[]).includes(token.value)) {
      take()
      return lineOfCells(scope, token.value as (typeof DIRECTIONS)[number])
    }
    if (token?.kind === 'cell') {
      const next = tokens[position + 1]
      if (next?.kind === 'symbol' && next.value === ':') {
        take()
        take()
        const end = take()
        if (end?.kind !== 'cell') throw new FormulaError(FORMULA_ERROR)
        return rangeValues(scope, token, end)
      }
    }
    return [sum()]
  }

  const call = (name: string): number => {
    expectSymbol('(')
    const values: number[] = []
    if (!(peek()?.kind === 'symbol' && (peek() as { value: string }).value === ')')) {
      values.push(...argument())
      while (peek()?.kind === 'symbol' && (peek() as { value: string }).value === ',') {
        take()
        values.push(...argument())
      }
    }
    expectSymbol(')')
    switch (name) {
      case 'SUM':
        return values.reduce((total, value) => total + value, 0)
      case 'AVERAGE':
        if (values.length === 0) throw new FormulaError(FORMULA_ZERO_DIVIDE)
        return values.reduce((total, value) => total + value, 0) / values.length
      case 'COUNT':
        return values.length
      case 'MIN':
        return values.length === 0 ? 0 : Math.min(...values)
      case 'MAX':
        return values.length === 0 ? 0 : Math.max(...values)
      case 'PRODUCT':
        return values.reduce((total, value) => total * value, 1)
      default:
        throw new FormulaError(FORMULA_ERROR)
    }
  }

  const factor = (): number => {
    const token = take()
    if (!token) throw new FormulaError(FORMULA_ERROR)
    if (token.kind === 'number') return token.value
    if (token.kind === 'cell') return cellValue(token.row, token.column)
    if (token.kind === 'word') {
      if (!(FORMULA_FUNCTIONS as readonly string[]).includes(token.value)) {
        throw new FormulaError(FORMULA_ERROR)
      }
      return call(token.value)
    }
    if (token.value === '(') {
      const value = sum()
      expectSymbol(')')
      return value
    }
    if (token.value === '-') return -factor()
    if (token.value === '+') return factor()
    throw new FormulaError(FORMULA_ERROR)
  }

  const product = (): number => {
    let value = factor()
    while (peek()?.kind === 'symbol') {
      const symbol = (peek() as { value: string }).value
      if (symbol !== '*' && symbol !== '/') break
      take()
      const right = factor()
      if (symbol === '/' && right === 0) throw new FormulaError(FORMULA_ZERO_DIVIDE)
      value = symbol === '*' ? value * right : value / right
    }
    return value
  }

  const sum = (): number => {
    let value = product()
    while (peek()?.kind === 'symbol') {
      const symbol = (peek() as { value: string }).value
      if (symbol !== '+' && symbol !== '-') break
      take()
      value = symbol === '+' ? value + product() : value - product()
    }
    return value
  }

  if (tokens.length === 0) throw new FormulaError(FORMULA_ERROR)
  const value = sum()
  if (position !== tokens.length) throw new FormulaError(FORMULA_ERROR)
  return value
}

/**
 * The numbers in a line of cells from the formula's own, as Word's ABOVE,
 * BELOW, LEFT and RIGHT: blanks are passed over, and a cell of text, a
 * header's, ends the line.
 */
function lineOfCells(scope: FormulaScope, direction: (typeof DIRECTIONS)[number]): number[] {
  const { map, cell } = scope
  const values: number[] = []
  const seen = new Set<TableMapCell>([cell])
  const [rowStep, columnStep] =
    direction === 'ABOVE'
      ? [-1, 0]
      : direction === 'BELOW'
        ? [1, 0]
        : direction === 'LEFT'
          ? [0, -1]
          : [0, 1]
  let row = rowStep === 1 ? cell.top + cell.height : rowStep === -1 ? cell.top - 1 : cell.top
  let column =
    columnStep === 1 ? cell.left + cell.width : columnStep === -1 ? cell.left - 1 : cell.left
  while (row >= 0 && row < map.height && column >= 0 && column < map.width) {
    const found = map.at(row, column)
    row += rowStep
    column += columnStep
    if (!found || seen.has(found)) continue
    seen.add(found)
    const value = scope.valueOf(found)
    if (value !== null) values.push(value)
    else if (cellShownText(found.node) !== '') break
  }
  return values
}

/** The numbers in a rectangle of cells, `B2:C4`, each cell once. */
function rangeValues(
  scope: FormulaScope,
  from: { row: number; column: number },
  to: { row: number; column: number },
): number[] {
  const rect = {
    top: Math.min(from.row, to.row),
    bottom: Math.max(from.row, to.row) + 1,
    left: Math.min(from.column, to.column),
    right: Math.max(from.column, to.column) + 1,
  }
  const values: number[] = []
  for (const found of scope.map.cellsIn(rect)) {
    if (found === scope.cell) continue
    const value = scope.valueOf(found)
    if (value !== null) values.push(value)
  }
  return values
}

// ---------------------------------------------------------------- formatting

/**
 * A result written in a number format, Word's picture notation: `0`,
 * `0.00`, `#,##0.00`, `0%`, `$#,##0.00`, `£#,##0`. The digits after the
 * point set the decimals, a comma turns on thousands separators, a trailing
 * percent shows the value as a percentage, and any text before the first
 * digit sign is kept as a prefix. Without a format, a whole number shows as
 * it is and anything else to two decimals at most.
 */
export function formatFormulaResult(value: number, format: string | null): string {
  if (!Number.isFinite(value)) return FORMULA_ERROR
  if (!format) {
    const rounded = Math.round(value * 100) / 100
    return String(rounded)
  }
  const match = /^([^#0]*)([#0,]*)(?:\.(0+))?(%?)(.*)$/.exec(format)
  if (!match) return String(value)
  const [, prefix = '', digits = '', decimals = '', percent = '', suffix = ''] = match
  const shown = percent ? value * 100 : value
  const text = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals.length,
    maximumFractionDigits: decimals.length,
    useGrouping: digits.includes(','),
  }).format(Math.abs(shown))
  return `${shown < 0 ? '-' : ''}${prefix}${text}${percent}${suffix}`
}

// -------------------------------------------------------------- the updater

interface FoundFormula {
  readonly path: Path
  readonly node: EditorNode
  /** The cell the formula sits in, on its table's grid. */
  readonly cell: TableMapCell
}

/** Every formula in `table`'s own cells (not in tables nested in them), with its cell. */
function formulasIn(table: EditorNode, tablePath: Path): FoundFormula[] {
  const map = TableMap.of(table)
  const found: FoundFormula[] = []
  for (const cell of map.cells) {
    const visit = (node: EditorNode, path: Path): void => {
      if (node.type.name === FORMULA_NODE) {
        found.push({ path, node, cell })
        return
      }
      if (node.type.name === 'table') return
      node.content.children.forEach((child, index) => visit(child, [...path, index]))
    }
    visit(cell.node, [...tablePath, cell.row, cell.index])
  }
  return found
}

/** Every table in the document, with its path. */
function tablesOf(doc: EditorNode): { table: EditorNode; path: Path }[] {
  const tables: { table: EditorNode; path: Path }[] = []
  const visit = (node: EditorNode, path: Path): void => {
    if (node.type.name === 'table') tables.push({ table: node, path })
    if (node.isTextblock) return
    node.content.children.forEach((child, index) => visit(child, [...path, index]))
  }
  visit(doc, [])
  return tables
}

/**
 * The steps that bring every formula's result up to date; none when all are.
 * A formula can use another's result, so the results are worked out again
 * until they settle, a few rounds at most: a formula that uses its own
 * result, directly or round a loop, stops changing there.
 */
export function formulaSteps(doc: EditorNode): Step[] {
  const steps: Step[] = []
  for (const { table, path } of tablesOf(doc)) {
    const formulas = formulasIn(table, path)
    if (formulas.length === 0) continue
    const map = TableMap.of(table)
    const results = new Map<FoundFormula, string>(
      formulas.map((formula) => [formula, String(formula.node.attrs.result ?? '')]),
    )
    const shownText = (cell: TableMapCell): string => {
      let text = ''
      const visit = (node: EditorNode): void => {
        if (node.isText) text += node.textContent
        else if (node.type.name === FORMULA_NODE) {
          const own = formulas.find((formula) => formula.node === node)
          text += own ? (results.get(own) ?? '') : String(node.attrs.result ?? '')
        } else {
          for (const child of node.content.children) visit(child)
          if (node.isTextblock) text += ' '
        }
      }
      visit(cell.node)
      return text.trim()
    }
    const numberIn = (cell: TableMapCell): number | null => parseCellNumber(shownText(cell))
    for (let round = 0; round < 5; round++) {
      let changed = false
      for (const formula of formulas) {
        let result: string
        try {
          const value = evaluateFormula(String(formula.node.attrs.expression ?? ''), {
            map,
            cell: formula.cell,
            valueOf: numberIn,
          })
          const format =
            typeof formula.node.attrs.format === 'string' ? formula.node.attrs.format : null
          result = formatFormulaResult(value, format)
        } catch (error) {
          result = error instanceof FormulaError ? error.display : FORMULA_ERROR
        }
        if (results.get(formula) !== result) {
          results.set(formula, result)
          changed = true
        }
      }
      if (!changed) break
    }
    for (const formula of formulas) {
      const result = results.get(formula) ?? ''
      if (formula.node.attrs.result !== result) {
        steps.push(new SetNodeAttrsStep(formula.path, { ...formula.node.attrs, result }))
      }
    }
  }
  return steps
}

/** A dispatch transform keeping every formula's result current inside the edit that changed it. */
export function updateFormulasTransform(tr: Transaction): Transaction | null {
  if (!tr.docChanged) return null
  const steps = formulaSteps(tr.doc)
  if (steps.length === 0) return null
  for (const step of steps) tr.step(step)
  return tr
}

/** Keep `editor`'s table formulas current from now on. Returns the uninstaller. */
export function installFormulaUpdater(editor: Editor): () => void {
  const remove = editor.addDispatchTransform(updateFormulasTransform)
  const steps = formulaSteps(editor.state.doc)
  if (steps.length > 0) {
    const tr = editor.state.tr
    for (const step of steps) tr.step(step)
    editor.dispatch(tr)
  }
  return remove
}

// ----------------------------------------------------------------- commands

/**
 * The formula at the selection, for a dialog to change: the one selected, or
 * the one touching the caret on either side. Null when there is none.
 */
export function formulaNear(state: EditorState): { path: Path; node: EditorNode } | null {
  const selection = state.selection
  if (selection instanceof NodeSelection) {
    const node = nodeAtPath(state.doc, selection.path)
    return node?.type.name === FORMULA_NODE ? { path: selection.path, node } : null
  }
  if (!(selection instanceof TextSelection) || !selection.empty) return null
  const { path, offset } = selection.from
  const block = nodeAtPath(state.doc, path)
  if (!block?.isTextblock) return null
  let start = 0
  for (const [index, child] of block.content.children.entries()) {
    const size = child.isText ? child.textContent.length : 1
    const touches = start === offset || start + size === offset
    if (child.type.name === FORMULA_NODE && touches) return { path: [...path, index], node: child }
    start += size
    if (start > offset) break
  }
  return null
}

/** The formula a dialog should start from at the selection: its expression and format, or null. */
export function formulaAt(
  state: EditorState,
): { expression: string; format: string | null } | null {
  const found = formulaNear(state)
  if (!found) return null
  const format = typeof found.node.attrs.format === 'string' ? found.node.attrs.format : null
  return { expression: String(found.node.attrs.expression ?? ''), format }
}

/**
 * The formula Word suggests for the caret's cell: the numbers above it
 * added up when there are any, else the ones to its left.
 */
export function suggestedFormula(state: EditorState): string {
  const context = cellContextAt(state.doc, state.selection.from)
  if (!context) return 'SUM(ABOVE)'
  const map = TableMap.of(context.table)
  const scope: FormulaScope = {
    map,
    cell: gridCellOf(context),
    valueOf: (cell) => parseCellNumber(cellShownText(cell.node)),
  }
  return lineOfCells(scope, 'ABOVE').length > 0 ? 'SUM(ABOVE)' : 'SUM(LEFT)'
}

/**
 * Put a formula in the caret's cell, or change the one at the caret. Declines
 * outside a table. The result is filled in by the updater, in this same
 * edit when it is installed.
 */
export function insertFormula(expression: string, format: string | null = null): Command {
  return (state) => {
    const text = expression.trim().replace(/^=/, '').trim()
    if (!text) return null
    if (!state.schema.nodes[FORMULA_NODE]) return null
    const found = formulaNear(state)
    if (found) {
      return state.tr.step(
        new SetNodeAttrsStep(found.path, { ...found.node.attrs, expression: text, format }),
      )
    }
    if (!cellContextAt(state.doc, state.selection.from)) return null
    return insertInlineNode(FORMULA_NODE, { expression: text, format, result: '' })(state)
  }
}
