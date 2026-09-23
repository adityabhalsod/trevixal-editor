import type { Command, Editor, EditorState } from '@trevixal/core'
import { measureCellShare } from './cell-measure'
import {
  addColumn,
  addRow,
  deleteColumn,
  deleteRow,
  deleteTable,
  insertTable,
  mergeCells,
  setCellAlign,
  splitCell,
  toggleHeaderRow,
} from './commands'
import {
  convertTableToText,
  convertTextToTable,
  csvAtSelection,
  insertTableFromCSV,
  setCellBackground,
  setTableBorderColor,
  setTableBorders,
  sortTable,
} from './features'
import { moveColumn, moveRow, swapCellContent } from './move'
import {
  autoFitContents,
  autoFitWindow,
  clearTableSizing,
  distributeColumnsEvenly,
  distributeRowsEvenly,
  fixColumnWidths,
  setColumnWidth,
  setRowHeight,
  setTableWidth,
} from './resize'
import type { CellAlign, TableBorders } from './schema'
import { splitCellInto } from './split-cells'
import { measureTableGeometry } from './table-geometry'

/**
 * The command bundle `@trevixal/ui`'s `createEditorUI` expects, so the UI
 * package can drive tables without importing this one:
 *
 * ```ts
 * createEditorUI(editor, { container, tableCommands: tableUICommands() })
 * ```
 */
export interface TableUICommands {
  readonly insertTable: (rows: number, cols: number) => Command
  readonly addRowBefore: Command
  readonly addRowAfter: Command
  readonly deleteRow: Command
  readonly addColumnBefore: Command
  readonly addColumnAfter: Command
  readonly deleteColumn: Command
  readonly mergeCells: Command
  readonly splitCell: Command
  /** Word's Split Cells: each selected cell into this many columns. */
  readonly splitCellInto: (columns: number) => Command
  readonly toggleHeaderRow: Command
  readonly deleteTable: Command
  readonly moveRowUp: Command
  readonly moveRowDown: Command
  readonly moveColumnLeft: Command
  readonly moveColumnRight: Command
  readonly swapCellLeft: Command
  readonly swapCellRight: Command
  readonly swapCellUp: Command
  readonly swapCellDown: Command
  readonly setColumnWidth: (width: string | null) => Command
  readonly setRowHeight: (height: string | null) => Command
  readonly setTableWidth: (width: string | null) => Command
  readonly distributeColumns: Command
  /** Word's AutoFit Contents and AutoFit Window. */
  readonly autoFitContents: Command
  readonly autoFitWindow: Command
  /**
   * Word's Fixed Column Width and Distribute Rows. Both size the table by how
   * it looks, so they are here only when `editor` is given to read it from.
   */
  readonly fixColumnWidths?: Command
  readonly distributeRows?: Command
  readonly clearSizing: Command
  readonly setCellAlign: (align: CellAlign | null) => Command
  readonly setCellBackground: (color: string | null) => Command
  readonly setTableBorders: (borders: TableBorders | null) => Command
  readonly setTableBorderColor: (color: string | null) => Command
  /** Sort the body rows by the caret's column. */
  readonly sortAscending: Command
  readonly sortDescending: Command
  readonly convertTextToTable: Command
  readonly convertTableToText: Command
  readonly insertTableFromCSV: (csv: string) => Command
  /** CSV for the table at the selection, or null outside one, not a command, a reader. */
  readonly csvAtSelection: (state: EditorState) => string | null
}

export interface TableUICommandsOptions {
  /**
   * The editor the commands run in. With it, Split and Distribute read the
   * table from the page, so a table without set widths keeps its look, and
   * Fixed column width and Distribute rows are offered at all; leave it out
   * for commands that never touch a view.
   */
  readonly editor?: Editor
}

export function tableUICommands(options: TableUICommandsOptions = {}): TableUICommands {
  const measure = options.editor ? measureCellShare(options.editor) : undefined
  const geometry = options.editor ? measureTableGeometry(options.editor) : undefined
  const measured = geometry
    ? {
        fixColumnWidths: fixColumnWidths({ measure: geometry }),
        distributeRows: distributeRowsEvenly({ measure: geometry }),
      }
    : {}
  return {
    insertTable: (rows, cols) => insertTable({ rows, cols }),
    addRowBefore: addRow('before'),
    addRowAfter: addRow('after'),
    deleteRow,
    addColumnBefore: addColumn('before'),
    addColumnAfter: addColumn('after'),
    deleteColumn,
    mergeCells,
    splitCell,
    splitCellInto: (columns) => splitCellInto(columns, { measure }),
    toggleHeaderRow,
    deleteTable,
    moveRowUp: moveRow('up'),
    moveRowDown: moveRow('down'),
    moveColumnLeft: moveColumn('left'),
    moveColumnRight: moveColumn('right'),
    swapCellLeft: swapCellContent('left'),
    swapCellRight: swapCellContent('right'),
    swapCellUp: swapCellContent('up'),
    swapCellDown: swapCellContent('down'),
    setColumnWidth,
    setRowHeight,
    setTableWidth,
    distributeColumns: distributeColumnsEvenly({ measure: geometry }),
    autoFitContents,
    autoFitWindow,
    ...measured,
    clearSizing: clearTableSizing,
    setCellAlign,
    setCellBackground,
    setTableBorders,
    setTableBorderColor,
    sortAscending: sortTable({ direction: 'asc' }),
    sortDescending: sortTable({ direction: 'desc' }),
    convertTextToTable: convertTextToTable(),
    convertTableToText: convertTableToText(),
    insertTableFromCSV: (csv) => insertTableFromCSV(csv),
    csvAtSelection: (state) => csvAtSelection(state),
  }
}
