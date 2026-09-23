export { ACTIVE_CELL_CLASS, highlightActiveCell, RANGE_CELL_CLASS } from './active-cell'
export { enableCellSelection } from './cell-selection'
export {
  type CellAlign,
  CELL_SIDES,
  type CellSide,
  hiddenBordersValue,
  hiddenSides,
  safeTableLength,
  TABLE_BORDER_STYLES,
  TABLE_BORDER_WIDTHS,
  TABLE_BORDERS,
  TABLE_STYLE_OPTIONS,
  TABLE_STYLES,
  type TableBorderStyle,
  type TableBorderWidth,
  type TableBorders,
  type TableStyle,
  type TableStyleOption,
  tableBorderStyle,
  tableBorderWidth,
  tableBorders,
  tableNodes,
  tableStyle,
} from './schema'
export {
  setTableBorderStyle,
  setTableBorderWidth,
  setTableStyle,
  TABLE_DESIGN_OPTIONS,
  TABLE_STYLE_GALLERY,
  type TableDesign,
  type TableDesignOption,
  tableDesignAt,
  type TableStyleChoice,
  toggleTableStyleOption,
} from './table-design'
export { hideCellBorder } from './cell-borders'
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
export { measureCellShare } from './cell-measure'
export { MAX_SPLIT_COLUMNS, type SplitCellsOptions, splitCellInto } from './split-cells'
export {
  cellSideHidden,
  type ColumnLine,
  type DrawnTable,
  drawColumnLine,
  drawRowLine,
  insertDrawnTable,
  type RowLine,
  SNAP_DISTANCE,
  showCellBorder,
} from './draw-table'
export {
  createTableTools,
  type TableTool,
  type TableTools,
  type TableToolsOptions,
} from './table-tools'
export { type MeasureTable, measureTableGeometry, type TableGeometry } from './table-geometry'
export { moveColumn, type MoveDirection, moveRow, swapCellContent } from './move'
export {
  createTableResizeHandles,
  type ResizeHandles,
  type ResizeHandlesOptions,
} from './resize-handles'
export {
  autoFitContents,
  autoFitWindow,
  clearTableSizing,
  distributeColumnsEvenly,
  distributeRowsEvenly,
  fixColumnWidths,
  type MeasuredSizingOptions,
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
export { tableUICommands, type TableUICommands, type TableUICommandsOptions } from './ui'
