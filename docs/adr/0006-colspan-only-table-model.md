# ADR-0006: Colspan-only table cell merging

**Status:** Accepted, 2026-08-30

## Context

`@trevixal/extension-table` needs cell merge/split. Full rectangular merging
(colspan + rowspan) requires a grid map that reconciles overlapping spans for
every structural edit and every navigation step, the single largest source
of complexity (and bugs) in existing table implementations.

## Decision

v0.x supports horizontal merging only: cells carry a `colspan` attribute,
`mergeCells` joins adjacent cells within one row, `splitCell` restores unit
cells. Structural commands (`addColumn`, `deleteColumn`) widen or narrow
spanning cells instead of splitting them. `rowspan` is not modeled.

The HTML parser still imports tables with rowspans, the spanning cell simply
becomes a normal cell and later rows keep their own cells, so no content is
lost, only geometry.

## Consequences

- Every structural command stays a small composition of `ReplaceNodesStep` /
  `SetNodeAttrsStep`, individually invertible and easy to test (18 unit tests
  cover the command matrix).
- Vertical merging is a roadmap item; adding it later means introducing a
  `TableMap` grid model without changing the document schema (a `rowspan`
  attribute slots in beside `colspan`).
