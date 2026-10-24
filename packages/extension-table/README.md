# @trevixal/extension-table

[![CI](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@trevixal/extension-table.svg)](https://www.npmjs.com/package/@trevixal/extension-table)
[![types](https://img.shields.io/npm/types/@trevixal/extension-table.svg)](https://www.npmjs.com/package/@trevixal/extension-table)
[![license](https://img.shields.io/npm/l/@trevixal/extension-table.svg)](https://github.com/adityabhalsod/trevixal-editor/blob/main/LICENSE)
[![docs](https://img.shields.io/badge/docs-GitHub%20Pages-blue)](https://adityabhalsod.github.io/trevixal-editor/)
[![dev.to](https://img.shields.io/badge/dev.to-blog-0A0A0A?logo=devdotto&logoColor=white)](https://dev.to/aditya_bhalsod/i-built-a-rich-text-editor-from-scratch-no-prosemirror-no-dependencies-52b6)
[![stars](https://img.shields.io/github/stars/adityabhalsod/trevixal-editor?style=social)](https://github.com/adityabhalsod/trevixal-editor/stargazers)

[Documentation](https://trevixal-editor.vercel.app) · [Live editor](https://trevixal-editor.vercel.app/full-editor) · [Changelog](https://github.com/adityabhalsod/trevixal-editor/blob/main/packages/extension-table/CHANGELOG.md) · [Issues](https://github.com/adityabhalsod/trevixal-editor/issues)

[![Watch the Trevixal demo on YouTube](https://img.youtube.com/vi/PF8VchgEAeU/maxresdefault.jpg)](https://youtu.be/PF8VchgEAeU)

▶ [Watch the 1-minute demo on YouTube](https://youtu.be/PF8VchgEAeU)

[![The Trevixal editor](https://trevixal-editor.vercel.app/media/editor.png)](https://trevixal-editor.vercel.app/full-editor)

## Features

- Insert, merge, split, sort; row and column editing
- Column resize, header rows, alignment and borders
- Keyboard navigation and CSV import/export
- **10.2 kB** minified and gzipped, with TypeScript types in the package

Tables: structure, merging, sorting, borders, CSV, and the keyboard.

```sh
npm install @trevixal/extension-table
```

## Usage

Merge the nodes into your schema:

```ts
new Schema({ nodes: { ...defaultNodes(), ...tableNodes() }, marks: defaultMarks() })
```

```ts
import { tableKeymap, insertTable, addRow, toggleHeaderRow } from '@trevixal/extension-table'

const editor = createEditor({ schema, element, keymap: tableKeymap() })

editor.exec(insertTable({ rows: 3, cols: 3 }))
editor.exec(addRow('after'))
editor.exec(toggleHeaderRow)
```

`tableKeymap()` makes `Tab` and `Shift+Tab` move between cells, then fall
through to code-block indentation and list nesting. Each binding chains
through every context the key means something in, because an override replaces
the base binding wholesale.

## What it can do

**Structure**: `insertTable`, `addRow`, `addColumn`, `deleteRow`,
`deleteColumn`, `deleteTable`, `mergeCells`, `splitCell`, `toggleHeaderRow`,
`goToNextCell`.

**Appearance**: `setCellAlign`, `setCellBackground`, `setTableBorders`
(`all`, `outer`, `horizontal`, `none`), `setTableBorderColor`.

**Data**: `sortTable`, `convertTextToTable`, `convertTableToText`,
`parseCSV`, `insertTableFromCSV`, `tableToCSV`, `csvAtSelection`,
`detectDelimiter`.

**Sizing**: `createTableResizeHandles` for drag handles, plus
`setColumnWidth`, `setRowHeight`, `setTableWidth`, `distributeColumnsEvenly`,
`clearTableSizing`.

**Moving**: `moveRow`, `moveColumn`, `swapCellContent`.

## Two decisions worth knowing

**Cells merge across columns only.** `rowspan` is not in the model, which
keeps every row a flat list of cells and every structural edit simple
arithmetic ([ADR-0006](https://github.com/adityabhalsod/trevixal-editor/blob/main/docs/adr/0006-colspan-only-table-model.md)). A
column move that would cut through a merged cell declines rather than
silently rewriting the merge.

**A drag stores proportions, not pixels.** A width measured in a fullscreen
window is meaningless in a narrow one, and `table-layout: fixed` will widen a
table past any `max-width` to fit its columns. Columns are stored as a share
of the table, the table as a share of the space it sits in.

## License

Apache-2.0
