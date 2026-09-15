# Extension points

Every extension package in this repository is built on four public hooks and
nothing else. If something needs more, the hook set is incomplete. That is a
bug in the core, not a reason to reach past it
([ADR-0008](../adr/0008-extension-points)).

## 1. Schema merging

Add node and mark types by merging specs into the schema. This is how tables,
images, equations, callouts and citations exist at all.

```ts
new Schema({ nodes: { ...defaultNodes(), ...myNodes() }, marks: defaultMarks() })
```

## 2. `onTransaction`

Watch every change. The document outline, the writing checks, autosave and the
diagram renderer all sit here.

```ts
const stop = editor.onTransaction(({ before, state, transaction }) => {
  if (before.doc !== state.doc) rebuildOutline(state.doc)
})
```

It returns an unsubscribe. Everything in the kit that registers something
returns the way to unregister it.

## 3. `addDispatchTransform`

Rewrite a transaction *before* it applies.

```ts
editor.addDispatchTransform((tr, state) => {
  return isSuggesting ? asSuggestion(tr, state) : tr
})
```

This is how suggestion mode works, and it is worth understanding why it is a
transform rather than a fork of every command: a deletion becomes a
strike-through here, once, and all forty-odd commands keep working unchanged
because none of them knows.

## 4. `setDecorationLayer`

Draw without storing. See [Decorations](./decorations).

## And two more for input

`keymap` and `inputRules` are options rather than hooks, but they are how an
extension reaches the keyboard:

```ts
createEditor({
  schema,
  element,
  keymap: tableKeymap(),                               // Tab moves between cells
  inputRules: [...defaultInputRules(), ...mathInputRules()],  // `$…$`
})
```

A keymap entry **replaces** the base binding wholesale, so a binding that
means several things must chain them itself:

```ts
Tab: (editor) =>
  editor.exec(goToNextCell(1)) ||
  editor.exec(indentInPreformatted) ||
  editor.commands.sinkListItem(),
```

Dropping a link from that chain silently removes the behaviour from every host
that installs the keymap.

## Node views

The fifth thing, for rendering your own component inside the document:

```ts
createEditor({ schema, element, nodeViews: { counter: myFactory } })
```

A factory returns `{ dom, contentDOM?, update?, destroy? }`. The adapters wrap
this so you can hand them a React, Vue, Svelte or Angular component instead.

## Next

- [Write a callout extension](../extending/callout): all of this, end to end
