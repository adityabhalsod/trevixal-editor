# ADR-0003: Primitive step set instead of a monolithic ReplaceStep

**Status:** Accepted, 2026-08-30

## Context

The brief lists a `ReplaceRange` step covering text and node changes. A single
slice-based replace step (ProseMirror's model) is extremely general but hard
to implement and verify, especially open-depth slices.

## Decision

Ship small, orthogonal, individually invertible steps:

- `ReplaceInlineStep`: inline (character-offset) replacement in one textblock
- `ReplaceNodesStep`: child replacement in one element node
- `AddMarkStep` / `RemoveMarkStep`
- `SetNodeAttrsStep`
- `SplitNodeStep` / `JoinNodesStep`
- `WrapNodesStep` / `LiftNodesStep`

Compound edits (cross-block deletion, Enter, block-type changes) are composed
from these primitives at the command layer (`deleteRange`, `splitBlock`, …).
Commands that remove marks emit `RemoveMarkStep` only over ranges where the
mark instance is actually present, keeping inversion exact.

`MoveNode` and step-rebasing (`step.map(mapper)`) are deferred until a real
consumer exists; nothing in the product needs either today.

## Consequences

- Each step's `apply`/`invert`/`mapPosition` is small enough to property-test.
- History and position mapping fall out of composition.
- Some multi-step edits are not atomic at the step level; grouping happens in
  the transaction/history layer, which is where the brief puts it anyway.
