# ADR-0011: Rectangular cell merging with a table map

**Status:** Accepted, 2026-09-29. Supersedes [ADR-0006](./0006-colspan-only-table-model).

## Context

ADR-0006 kept tables to horizontal merges: cells carried `colspan`, and
every command could treat a row on its own. Word, Google Docs and every
HTML table merge down a column too. A document pasted or imported with
`rowspan` lost its geometry, a Word file's vertical merges came in as
separate cells, and *Split cells* could not offer rows.

ADR-0006 named the way in: a `rowspan` attribute beside `colspan`, and a
grid model under the table commands.

## Decision

- Table cells carry `rowspan` as well as `colspan`, with the meaning HTML
  gives them. A row holds only the cells that start in it.
- `TableMap` in `@trevixal/core` lays a table out on its grid, as HTML's
  table algorithm does. Everything that reasons about columns reads them
  from the map: the table commands, the selection, the Word and RTF writers
  and reader, the Markdown writer and the stylesheet's column marks. The map
  tolerates tables that are not well formed: a span past the last row stops
  there, a short row leaves a hole, and in an overlap the first cell keeps
  the spot.
- Structural commands work on the grid instead of on rows. They turn the
  table into placed cells (`placementsOf`), move and resize those, and build
  the rows back (`tableFrom`), which rewrites every span. They replace the
  table in one step and set the selection themselves.
- A row that no cell starts in is dropped, and each cell spanning it loses
  that row. Row content stays `tableCell+`, so a row always has a cell of its
  own. Merging two whole rows gives one row, as in Word.
- Rows and columns that a merged cell ties together move and sort as one
  block. No command cuts a merged cell apart.
- Word and RTF have no `rowspan`. Their files repeat a merged cell in every
  row it spans: as `w:vMerge` restart and continue cells in Word, and as
  `\clvmgf` and `\clvmrg` cells in RTF. The writers produce these from the
  map, and the Word reader folds them back into one cell.

## Consequences

- *Merge cells* takes any rectangle, grown to take in whole cells. *Split
  cells* makes rows as well as columns. Drawing a line across a table splits
  only the cells under the line, and the cells beside it span both halves.
- A structural command is one step. It is coarser than the fine-grained
  steps ADR-0006 allowed, but it is still one undo, and it keeps the
  selection by carrying it through the rebuild.
- `columnStart(row, index)` and `cellAtColumn(row, column)` still count only
  a row's own cells. The map is the right tool once a table has vertical
  merges, and the commands use it.
- CSS cannot see grid columns. On tables with a vertical merge the editor
  marks each rendered cell with its grid column, and the table styles read
  those marks. Saved HTML has no marks, so it styles first and last columns
  by the row's first and last cells, as before.
