export { ACTIVE_CELL_CLASS, highlightActiveCell, RANGE_CELL_CLASS } from './active-cell'
export { enableCellSelection } from './cell-selection'
export {
  type CellAlign,
  safeTableLength,
  TABLE_BORDERS,
  type TableBorders,
  tableBorders,
  tableNodes,
} from './schema'
export {
  addColumn,
  addRow,
  type CellContext,
  cellContextAt,
  columnCount,
  columnStart,
  deleteColumn,
  deleteRow,
  deleteTable,
  escapeTableOnEnter,
  goToNextCell,
  type InsertTableOptions,
  insertTable,
  mergeCells,
  setCellAlign,
  splitCell,
  toggleHeaderRow,
} from './commands'
export { tableKeymap } from './keymap'
export { moveColumn, type MoveDirection, moveRow, swapCellContent } from './move'
export {
  createTableResizeHandles,
  type ResizeHandles,
  type ResizeHandlesOptions,
} from './resize-handles'
export {
  clearTableSizing,
  distributeColumnsEvenly,
  setColumnWidth,
  setRowHeight,
  setTableSizing,
  setTableWidth,
  type TableSizing,
  type TableSizingTarget,
} from './resize'
export {
  buildTable,
  type CSVDelimiter,
  compareCellText,
  convertTableToText,
  convertTextToTable,
  type CellRef,
  cellsInSelection,
  csvAtSelection,
  detectDelimiter,
  detectTextSeparator,
  type InsertCSVOptions,
  insertTableFromCSV,
  parseCSV,
  rowsToCSV,
  setCellBackground,
  setTableBorderColor,
  setTableBorders,
  type SortTableOptions,
  sortTable,
  type TableToTextOptions,
  tableToCSV,
  tableToRows,
  type TextSeparator,
  type TextToTableOptions,
} from './features'
export { tableUICommands, type TableUICommands } from './ui'
