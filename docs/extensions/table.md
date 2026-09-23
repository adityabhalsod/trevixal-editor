# Tables

`@trevixal/extension-table`: structure, merging, sorting, borders, CSV, and
the keyboard.

```sh
npm install @trevixal/extension-table
```

## Setting up

Merge the nodes into your schema and add the keymap:

```ts
import { Schema, defaultNodes, defaultMarks, createEditor } from '@trevixal/core'
import { tableNodes, tableKeymap, insertTable, addRow, toggleHeaderRow } from '@trevixal/extension-table'

const schema = new Schema({ nodes: { ...defaultNodes(), ...tableNodes() }, marks: defaultMarks() })
const editor = createEditor({ schema, element, keymap: tableKeymap() })

editor.exec(insertTable({ rows: 3, cols: 3 }))
editor.exec(addRow('after'))
editor.exec(toggleHeaderRow)
```

`tableKeymap()` makes `Tab` and `Shift+Tab` move between cells, then fall
through to code-block indentation and list nesting. Each binding chains
through every context the key means something in, because an override
replaces the base binding wholesale.

## Commands

| Area | Commands |
| --- | --- |
| Structure | `insertTable`, `addRow`, `addColumn`, `deleteRow`, `deleteColumn`, `deleteTable`, `mergeCells`, `splitCell`, `toggleHeaderRow`, `goToNextCell` |
| Appearance | `setCellAlign`, `setCellBackground`, `setTableBorders` (`all`, `outer`, `horizontal`, `none`), `setTableBorderColor` |
| Data | `sortTable`, `convertTextToTable`, `convertTableToText`, `parseCSV`, `insertTableFromCSV`, `tableToCSV`, `csvAtSelection`, `detectDelimiter` |
| Sizing | `createTableResizeHandles` for drag handles, plus `setColumnWidth`, `setRowHeight`, `setTableWidth`, `distributeColumnsEvenly`, `clearTableSizing` |
| Moving | `moveRow`, `moveColumn`, `swapCellContent` |

```ts
editor.exec(setCellBackground('#fff3cd'))
editor.exec(setTableBorders('outer'))
editor.exec(sortTable({ direction: 'asc' }))
editor.exec(insertTableFromCSV('a,b\n1,2'))
createTableResizeHandles(editor)
```

## Selecting cells

`enableCellSelection(editor)` installs the mouse gesture; the editor kit
mounts it for you. It returns a disposer.

| Gesture | What it selects |
| --- | --- |
| Click | A text cursor in the cell. A cell is prose, and editing it is the common case. |
| Double click | The whole cell |
| Double click, then drag | Every cell in the rectangle between the two |
| Click anywhere else | Drops it, because the selection moves with the click |

```ts
const dispose = enableCellSelection(editor)
highlightActiveCell(editor) // what makes the result visible
```

The result is an ordinary `TextSelection` spanning from the first cell's
first textblock to the last cell's last one, not a new selection class. That
is what `mergeCells`, `splitCell` and `setCellBackground` already read, so
the gesture drives them without a command knowing it exists, and a cell
selection survives undo, redo and position mapping like any other.

`cellsInSelection(state)` is the shared answer to *which cells are
selected*: the highlight marks exactly what the commands act on, so the two
cannot disagree.

## Wiring the chrome

`tableUICommands()` returns the set `createEditorUI` expects, which turns on
the Table menu, the grid picker and the floating cell toolbar:

```ts
createEditorUI(editor, { container, tableCommands: tableUICommands() })
```

## Two decisions worth knowing

**Cells merge across columns only.** `rowspan` is not in the model, which
keeps every row a flat list of cells and every structural edit simple
arithmetic ([ADR-0006](../adr/0006-colspan-only-table-model)). A column move
that would cut through a merged cell declines rather than silently rewriting
the merge.

**A drag stores proportions, not pixels.** A width measured in a fullscreen
window is meaningless in a narrow one, and `table-layout: fixed` will widen a
table past any `max-width` to fit its columns. Columns are stored as a share
of the table, the table as a share of the space it sits in, so a table sized
in a wide window still fits a narrow one.
