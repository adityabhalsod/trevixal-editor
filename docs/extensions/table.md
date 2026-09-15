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
