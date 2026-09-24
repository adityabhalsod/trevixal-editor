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
| Structure | `insertTable`, `addRow`, `addColumn`, `deleteRow`, `deleteColumn`, `deleteTable`, `mergeCells`, `splitCell`, `splitCellInto`, `toggleHeaderRow`, `goToNextCell` |
| Appearance | `setCellAlign`, `setCellBackground`, `setTableBorders` (`all`, `outer`, `horizontal`, `none`), `setTableBorderColor`, `setTableBorderStyle`, `setTableBorderWidth`, `hideCellBorder`, `showCellBorder` |
| Design | `setTableStyle`, `toggleTableStyleOption`, `tableDesignAt`, `TABLE_STYLE_GALLERY` |
| Layout | `toggleFreezeHeaderRow`, `toggleFreezeFirstColumn`, `setCellPadding`, `setCellVerticalAlign`, `tableLayoutAt` |
| Data | `sortTable`, `convertTextToTable`, `convertTableToText`, `parseCSV`, `insertTableFromCSV`, `tableToCSV`, `csvAtSelection`, `detectDelimiter` |
| Sizing | `createTableResizeHandles` for drag handles, plus `setColumnWidth`, `setRowHeight`, `setTableWidth`, `autoFitContents`, `autoFitWindow`, `fixColumnWidths`, `distributeRowsEvenly`, `distributeColumnsEvenly`, `clearTableSizing` |
| Drawing | `createTableTools` for Draw table, the Eraser and the Border Painter, plus `drawColumnLine`, `drawRowLine`, `insertDrawnTable` |
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

## Splitting cells

`splitCellInto(columns)` is Word's Split Cells: every cell in the selection
becomes that many cells, side by side. A merged cell shares out the columns it
already spans. One that needs more adds them to the grid, and in every other
row the cell standing there widens across them, so the rest of the table looks
as it did. Each new cell keeps the split cell's formatting; the content stays
in the first. *Table ▸ Split cells…* and the cell toolbar ask for the count.

```ts
editor.exec(splitCellInto(3))

// A table with no widths set is laid out by the browser, so keeping its look
// means reading it off the page. `tableUICommands({ editor })` does this for you.
editor.exec(splitCellInto(2, { measure: measureCellShare(editor) }))
```

`splitCell` is still there, and still splits a merged cell straight back into
the cells it came from, without asking how many.

Word's dialog also asks for a number of rows. This one does not: splitting one
cell into rows needs the cells beside it to span both, and the table model is
columns only (below).

## AutoFit and distributing

Word's AutoFit menu, and its Distribute Rows and Columns:

| Command | What it does |
| --- | --- |
| `autoFitContents` | Every column as wide as its text needs, the table only as wide as they add up to |
| `autoFitWindow` | The table as wide as the page. Columns sized as a share keep it; ones in fixed units give it up |
| `fixColumnWidths({ measure })` | The columns stay as wide as they are now, rather than following their text |
| `distributeRowsEvenly({ measure })` | The selected rows, or every row, as tall as the tallest of them |
| `distributeColumnsEvenly({ measure })` | The selected columns share their width equally, or every column shares the table's |

```ts
const measure = measureTableGeometry(editor)
editor.exec(autoFitContents)
editor.exec(fixColumnWidths({ measure }))
editor.exec(distributeRowsEvenly({ measure }))
```

Three of them size a table by how it looks, and a table the browser lays out
has no sizes stored until they are read off the page: that is what `measure`
does. Rows come out as tall as the tallest because a row never shrinks below
its text, so that is the one height they can all have. Without `measure`,
`distributeColumnsEvenly()` shares out the whole table whatever is selected.
`tableUICommands({ editor })` wires all of this up for you.

## Table design

Word's Table Design tab. In the editor kit it is the **Table design** button
beside the table button, a dropdown enabled while the caret is in a table,
and every choice in it is also under the Table menu.

| Part | What it does | Command |
| --- | --- | --- |
| Table style options | Header row, first column, last column, total row, banded rows, banded columns | `toggleTableStyleOption(option)` |
| Table styles | The plain Table grid, then two looks, **grid** (lines in the colour, the header row ruled off) and **header** (the header row filled), each in the text colour and six accents | `setTableStyle(style, accentColor)` |
| Shading | A cell's fill | `setCellBackground(color)` |
| Borders | All, outside only, rows only, none | `setTableBorders(borders)` |
| Pen | Line style (solid, dashed, dotted, double), weight (½, 1½, 2¼, 3 pt) and colour, for every line of the table | `setTableBorderStyle`, `setTableBorderWidth`, `setTableBorderColor` |
| Border painter | Click a line the Eraser took out to draw it again | `createTableTools`, tool `'paint'` |

```ts
editor.exec(setTableStyle('header', '#156082'))
editor.exec(toggleTableStyleOption('bandedRows'))
editor.exec(setTableBorderStyle('dashed'))
tableDesignAt(editor.state) // what the table has now, for a UI to show
```

A style, its colour, the five options and the pen are table attributes, written
to HTML as `data-table-style`, `data-accent-color`, `data-banded-rows` and the
like. The stylesheet draws the look from them, with tints mixed against
`transparent` so a style reads on a dark page too. The header row is the one
option that is not an attribute: it is the first row's cells being header
cells, as it always was. A new table starts with only that ticked, so tables
look as they did until you choose otherwise.

Word and RTF exports get the look spelt out cell by cell (fills, bold, the
header's ink, the style's rules and the pen), since their own table style
stays the plain grid. A cell's own shading wins over its style's, as a direct
format does in Word.

## Layout: frozen rows and columns, padding, alignment

| Command | What it does | Attribute (HTML) |
| --- | --- | --- |
| `toggleFreezeHeaderRow` | Holds the header row at the top of the window while a long table scrolls by; a table without a header row gets one | table `freezeHeader` (`data-freeze-header`) |
| `toggleFreezeFirstColumn` | Holds the first column in view while a wide table scrolls sideways | table `freezeColumn` (`data-freeze-column`) |
| `setCellPadding(length)` | Word's cell margins for the whole table: `0`, or px, em or rem; null for the stylesheet's own | table `cellPadding` (`--tvx-cell-padding`) |
| `setCellVerticalAlign(align)` | Top, middle or bottom for every selected cell; top is stored as none | cell `verticalAlign` (`vertical-align`) |

`tableLayoutAt(editor.state)` reads all four at the selection, for a menu to
tick. Freezing is for the screen alone: a print heads every page with the
table's header row whether it is frozen or not, as Word does with its
*Repeat as header row*, which the `.docx` export writes for every header row.

A cell holds any block, so a table can sit inside a cell. `insertTable` with
the caret in a cell puts one there, and every command acts on the innermost
table around the selection. The stylesheet's rules reach a table's own rows
only (`> tr`, `> tbody > tr`), so an inner table keeps its own look whatever
the outer one wears.

## Drawing and erasing

`createTableTools(editor, { container })` adds Word's Draw table, Eraser and
Border Painter, tools the pointer holds rather than commands that run once:

```ts
const tools = createTableTools(editor, { container })
tools.toggle('draw') // or 'erase' or 'paint'; the same again puts it down
tools.tool // 'draw', 'erase', 'paint' or null, for a menu's tick
```

| Held | Gesture | What happens |
| --- | --- | --- |
| Draw table | Drag a box where there is no table | A table of one cell, as wide and as tall as the box |
| Draw table | Drag down through a table | The cells the line crosses split into two columns where it was drawn |
| Draw table | Drag across a table | The row it crosses splits in two where it was drawn |
| Draw table | Drag along an existing line | A merged cell splits back along it, and an erased line comes back |
| Eraser | Click one side of a cell | That line (left, right, top or bottom) is no longer drawn |
| Border painter | Click a line the Eraser took out | The line is drawn again, with the table's pen |

While a tool is held, a press on the page belongs to it: the caret stays put,
and neither the resize handles nor the cell selection react. `Escape` puts
the tool down. Each stroke is one command, so one undo takes it back.

An erased side is the cell attribute `hiddenBorders` (`'top left'`), written
to HTML as `data-hidden-borders`. The stylesheet draws those sides
`border-style: hidden`, which wins over the neighbour's line in the collapsed
border model, so a line two cells share goes whichever of them it was erased
from. The Word and RTF exports leave it off both cells. Choosing a style under
*Table ▸ Borders* brings every erased line back, as Word's All Borders does.

A line drawn across splits the whole row rather than only the cells under it,
because a cell cannot span rows here (below).

## Wiring the chrome

`tableUICommands()` returns the set `createEditorUI` expects, which turns on
the Table menu, the grid picker, the Table design dropdown and the floating
cell toolbar. Given the editor, it also measures the page for splitting,
Fixed column width and distributing, and the tools join the Table menu with a
tick while held:

```ts
const tools = createTableTools(editor, { container })
createEditorUI(editor, {
  container,
  tableCommands: {
    ...tableUICommands({ editor }),
    toggleTableTool: (tool) => tools.toggle(tool),
    activeTableTool: () => tools.tool,
  },
})
```

## Two decisions worth knowing

**Cells merge and split across columns only.** `rowspan` is not in the model, which
keeps every row a flat list of cells and every structural edit simple
arithmetic ([ADR-0006](../adr/0006-colspan-only-table-model)). A column move
that would cut through a merged cell declines rather than silently rewriting
the merge.

**A drag stores proportions, not pixels.** A width measured in a fullscreen
window is meaningless in a narrow one, and `table-layout: fixed` will widen a
table past any `max-width` to fit its columns. Columns are stored as a share
of the table, the table as a share of the space it sits in, so a table sized
in a wide window still fits a narrow one.
