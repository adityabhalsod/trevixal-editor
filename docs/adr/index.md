# Architecture decision records

The choices that would be expensive to reverse, with the reasoning that was
current when they were made. An ADR is a record, not a manual: where one has
been superseded it says so rather than being rewritten.

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](./0001-path-offset-positions) | Path + offset document addressing | Accepted |
| [0002](./0002-greedy-content-expressions) | Greedy sequential content expressions | Accepted |
| [0003](./0003-primitive-steps-over-monolithic-replace) | Primitive step set instead of a monolithic ReplaceStep | Accepted |
| [0004](./0004-scss-tokens-in-ui-only) | SCSS design tokens live in @trevixal/ui only | Accepted |
| [0005](./0005-beforeinput-first-input-pipeline) | beforeinput-first input pipeline with diff-based DOM repair | Accepted |
| [0006](./0006-colspan-only-table-model) | Colspan-only table cell merging | Accepted |
| [0007](./0007-adapter-contract) | Adapter contract, the editor DOM lives outside framework reconciliation | Accepted |
| [0008](./0008-extension-points) | Extension points, transforms, transaction events, decoration layers, triggers | Accepted |
| [0009](./0009-collab-binding) | Collab binding, character-level text CRDT, block-granular structure | Superseded |
| [0010](./0010-editor-chrome-and-storage) | Editor chrome composition and pluggable image storage | Accepted |
