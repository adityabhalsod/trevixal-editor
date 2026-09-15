# Decorations

Some things belong on screen but not in the document: a search highlight, a
syntax colour, a spelling squiggle, the preview under a diagram.

If you write them into the document you have to take them out again before
saving, before exporting, before counting words, before comparing two
versions, and every one of those is a place to forget. So they are not in the
document at all.

```ts
editor.view.setDecorationLayer('code-highlight', (node) => {
  if (node.type.name !== 'codeBlock') return null
  return highlighter.highlight(node.textContent, node.attrs.language)
  // → [{ from, to, className }]
})
```

A layer is a function from a node to inline decorations. The renderer applies
them while drawing and forgets them; `getJSON()`, `getHTML()` and the word
count never see them.

## Layers compose

Each extension owns a **key**. Syntax highlighting, the writing checks and
find-and-replace all run at once, and none can clobber another, but two
extensions sharing a key will, so pick one nobody else would.

```ts
view.setDecorationLayer('my-extension', source)
view.setDecorationLayer('my-extension', null)  // remove
```

## A decoration can name itself

Beyond `from`, `to` and `className`, a decoration may carry `style` and
`attrs`: arbitrary attributes on the span it paints:

```ts
{ from, to, className: 'my-flag', attrs: { 'data-issue': issue.id } }
```

That matters the moment a decoration has to be *interactive*. A span with only
a class can be seen but not identified: a hover card or a click menu over it
has no way to know which of a block's decorations the pointer is on. With an
id in the DOM the round trip closes, `event.target.closest('[data-issue]')`
leads back to the finding that painted it. The writing checks use exactly
this for their hover cards.

## Positions still map

Decorations are computed from the current document, so an edit anywhere does
not leave them stale. There is nothing to remap, because they are derived
rather than stored.

## What this costs you

A decoration cannot be exported by walking the document, because it is not in
it. That is the honest trade, and it is worth knowing before you are surprised
by it: when `@trevixal/ui` writes a `.docx`, it reads the *drawn* colours back
off the live editor through `view.renderer.modelOf` and hands them to the
writer separately. A serializer alone would produce plain black code, and did.

The same is true of anything the view appends rather than renders. A diagram
preview is an element beside the code block, not a node inside it.

It is also why a second pane on the same document does not come out looking
like the first. The split editor is its own editor and needs the same
extensions installed on it; the side-by-side preview is a page and needs the
drawn colours and diagrams read off the live editor and written into its
markup. Sharing the document shares none of this.

## Next

- [Extension points](./extension-points): the four hooks everything is built on
