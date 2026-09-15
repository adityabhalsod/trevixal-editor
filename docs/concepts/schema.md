# Schema

A schema is the rulebook: which node and mark types exist, what may contain
what, and how each one becomes HTML and comes back.

```ts
const schema = new Schema({
  nodes: { ...defaultNodes(), ...tableNodes() },
  marks: defaultMarks(),
})
```

A document is validated against it. There is no way to build an invalid one
through the public API, and a document parsed from hostile HTML is normalized
into a valid shape rather than accepted as-is.

## A node type

```ts
const calloutSpec: NodeSpec = {
  group: 'block',
  content: 'block+',                 // a content expression
  attrs: { variant: { default: 'info' } },
  toHTML: (node) => ({
    tag: 'aside',
    attrs: { class: `trevixal-callout trevixal-callout--${node.attrs.variant}` },
  }),
  parseHTML: [
    {
      tag: 'aside',
      attribute: 'class',
      getAttrs: (element) =>
        element.classList.contains('trevixal-callout') ? { variant: variantOf(element) } : false,
    },
  ],
}
```

**Content expressions** say what may go inside: `'block+'` is one or more
blocks, `'inline*'` is any number of inline nodes, `'tabTitle tabContent'` is
exactly those two in that order. They are matched greedily and sequentially
([ADR-0002](../adr/0002-greedy-content-expressions)).

**`getAttrs` returning `false`** drops the element *and its subtree*. That is
the hook that makes parsing safe: a rule can refuse markup it does not like,
and nothing inside it is considered.

## Sanitizing is part of the schema

Every attribute that reaches a document goes through a checker:

```ts
safeHref, safeImageSrc, safeColor, safeLength, safeLineHeight,
safeCSSValue, safeElementId, safeFontFamily, safeLanguageName
```

Use them in your own `getAttrs`. A `href` that has not been through `safeHref`
is a `javascript:` URL waiting to happen, and the sanitizer is not somewhere
else. It is here, in the rules for what an attribute may be.

## Marks

```ts
const highlight: MarkSpec = {
  toHTML: () => ({ tag: 'mark' }),
  parseHTML: [{ tag: 'mark' }],
}
```

Marks can exclude one another: an insertion and a deletion cannot both apply
to the same text, and a node type can refuse marks entirely. `codeBlock` is
declared `marks: ''`, which is why syntax highlighting is a decoration rather
than something written into the document.

## Next

- [Transactions and steps](./transactions)
- [Write a callout extension](../extending/callout): this, end to end
