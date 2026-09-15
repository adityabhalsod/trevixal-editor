# State and the document

The one rule everything else follows: **the DOM is never the source of truth.**

A `contenteditable` element is a render target and an input source. What the
document *is* lives in an immutable `EditorState`:

```ts
interface EditorState {
  readonly doc: EditorNode           // the document tree
  readonly selection: Selection      // where the caret or range is
  readonly storedMarks: Mark[] | null  // marks the next character will take
}
```

Nothing mutates it. An edit produces a *new* state, and the old one remains
valid, which is why undo, collaboration-shaped features and time-travel
debugging are possible at all, and why a bug can be reproduced from a
recorded sequence of steps.

## The tree

A document is nodes all the way down. A node has a type, attributes, and
either text or child nodes:

```ts
doc
├── heading  { level: 2 }   "Getting started"
├── paragraph               "Some " + bold("words")
└── bulletList
    └── listItem
        └── paragraph       "An item"
```

**Marks** are the other half: bold, italic, a link, a colour. They attach to
*text*, not to nodes, because a bold run and a paragraph are different kinds
of thing. One can start and end mid-sentence.

## Positions

A position is a path plus an offset:

```ts
pos([1], 5)        // in the second top-level block, five characters in
pos([2, 0, 1], 0)  // third block → first child → second child, at the start
```

The path is child indices from the root; the offset is a character offset
*within a textblock*. Text nodes contribute their length and inline atoms,
a hard break, an inline equation, count as one.

This is unusual: many editors use a single integer offset into a flattened
document. A path costs a little more to compare and makes every structural
edit describable without recomputing the whole document's arithmetic
([ADR-0001](../adr/0001-path-offset-positions)).

## Reading state

```ts
editor.state.doc                 // the tree
editor.state.selection.from      // a Position
editor.getSnapshot()             // what a toolbar needs, reference-stable
```

`getSnapshot()` is the one to bind a UI to. It returns the active marks, the
block type, `canUndo` and so on, and keeps its identity while nothing it
describes has changed, so a toolbar does not re-render on every keystroke.

## Next

- [Schema](./schema): what shapes are allowed
- [Transactions and steps](./transactions): how state changes
