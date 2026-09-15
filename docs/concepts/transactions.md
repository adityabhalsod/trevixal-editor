# Transactions and steps

Every change to a document is a **transaction**: an ordered list of small,
invertible **steps**.

```ts
const tr = editor.state.tr
tr.step(new ReplaceInlineStep(path, 0, 5, Fragment.of(schema.text('Hello'))))
editor.dispatch(tr)
```

## Why steps are small

There are ten of them (replace inline content, replace nodes, add or remove a
mark, set attributes, split, join, wrap, lift, move a node) and each does one
thing. Three properties follow:

**They invert.** `step.invert(docBefore)` returns the step that undoes it.
Undo is therefore just applying inverted steps in reverse; there is no second
system recording what happened, and so no way for the two to disagree.

**They map positions.** `step.mapPosition(pos)` says where a position ends up
after the change. A selection, a decoration, a comment anchor or an upload
placeholder all survive edits made around them, including edits made by
someone else while an upload was in flight.

**They compose.** A command returns a transaction; a dispatch transform can
rewrite it before it applies. That is all suggestion mode is: it turns a
deletion into a strike-through, and every other command in the editor keeps
working without knowing.

A small step set was a deliberate choice over one monolithic replace
([ADR-0003](../adr/0003-primitive-steps-over-monolithic-replace)). A property
test applies two hundred random steps, inverts them, and checks the document
comes back exactly.

## Commands

A command is a pure function:

```ts
type Command = (state: EditorState) => Transaction | null
```

`null` means "not applicable here", which is what lets commands be chained,
and what makes a disabled toolbar button possible without a second predicate:

```ts
editor.exec(toggleHeaderRow)      // false when the caret is not in a table
editor.exec(chainCommands(a, b))  // tries a, then b
```

`editor.commands` is a facade over the common ones. `editor.chain()` builds a
transaction fluently.

## Moving a node

The move step is worth singling out, because it shows what the small set buys.
A move composed from a remove and an insert produces the same document, but
every position *inside* the moved node is mapped through a replacement that no
longer contains it, and collapses. A caret in a dragged table row would have
to be put back by hand.

`MoveNodeStep` keeps the node's identity, so everything anchored inside it
travels along.

## History

Undo groups adjacent transactions by time and adjacency. Transactions carry
metadata to override that:

```ts
tr.setMeta(ADD_TO_HISTORY, false)   // keep this out of undo entirely
tr.setMeta(NEW_HISTORY_GROUP, true) // start a new undo step here
tr.setMeta(HISTORY_LABEL, 'Insert table')
```

## Next

- [Decorations](./decorations): showing things you do not store
- [Extension points](./extension-points)
