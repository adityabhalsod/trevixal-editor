# ADR-0001: Path + offset document addressing

**Status:** Accepted, 2026-08-30

## Context

Positions must survive arbitrary document changes (undo, decorations, search
highlights, track changes all remap positions). Two candidate models: flat
token positions
(ProseMirror-style) or structural path + offset.

## Decision

A `Position` is `{ path: number[], offset: number }`: `path` addresses the
containing node by child indices from the root; `offset` is a character offset
inside a textblock's inline content, or a child index inside an element node.
Comparison is lexicographic over the trail `[...path, offset]`.

Every `Step` implements `mapPosition(pos, bias)` using only data stored on the
step (e.g. `JoinNodesStep` carries `joinOffset`), so mapping never needs a
document and transactions compose step mappers directly.

## Consequences

- Mapping logic is per-step and local; no global token bookkeeping.
- Structural steps (wrap/lift/split/join) do path surgery, which is more code
  per step but keeps positions human-readable and debuggable.
- Positions inside content removed by a step degrade to the nearest parent
  index (bias decides the side), mirroring established editor behavior.
