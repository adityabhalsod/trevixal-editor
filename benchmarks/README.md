# Benchmarks

Performance measurements for the editing engine. They read `packages/core/dist`,
so build first:

```sh
pnpm build
pnpm bench
```

## What is measured

**Keystroke to new state**, on a 10,000-block document. One sample is the
work the view does for a typed character: build the transaction, apply it, get
a new `EditorState` back. Rendering is not included. That is measured in a
real browser by the Playwright suite, and mixing the two would hide which of
them regressed.

The p95 is a **gate**: the script exits non-zero above 5 ms, the budget the
build brief set. A slow keystroke is the one performance problem a user feels
on every single interaction, so it is the one worth failing a run over.

**Serialization**, on a document of roughly 1 MB of HTML. The block count is
derived from a measured sample rather than guessed, so the figure stays near
1 MB as the schema changes. Three directions: document to HTML, document to
Markdown, and HTML back to a document. These are reported, not gated, they
vary with the machine far more than the keystroke path does, and none of them
sits between a key press and the screen.

The parse direction needs a `Document`, which Node has none of, so the script
supplies one from happy-dom. That makes the number a measurement of the
parser *plus* happy-dom; treat it as a trend line, not an absolute.

## Reading the output

```
Keystroke to new state: 10,000 blocks
  p95                                0.033 ms
  budget (p95)                       5.000 ms
```

`max` is worth a glance as well as the percentiles: it catches the occasional
garbage-collection pause that the percentiles smooth away.

## Related

`pnpm size` (see [`scripts/size-budget.mjs`](../scripts/size-budget.mjs))
gates bundle size the same way, measured, with a ceiling, failing loudly.
