import type { Command, EditorState } from '@trevixal/core'
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
  clearTableSizing,
  distributeColumnsEvenly,
  setColumnWidth,
  setRowHeight,
  setTableWidth,
} from './resize'
import type { CellAlign, TableBorders } from './schema'

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

export function tableUICommands(): TableUICommands {
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
    distributeColumns: distributeColumnsEvenly(),
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
