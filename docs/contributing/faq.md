# FAQ

### Is this a fork or wrapper of ProseMirror, Lexical, Slate or Quill?

No. Every subsystem (schema, transactions, undo, DOM reconciler, sanitizer,
position mapping, ZIP, XML, OOXML, RTF, MathML) is implemented in this
repository, with no runtime dependencies at all.

### Can I install it today?

From npm once the first release (`1.0.0`) has been published; check
`npm view @trevixal/core`. Before that, clone the repository,
`pnpm install && pnpm build`, and build against the workspace as every app in
`examples/` does. See [Development](./development).

### Can I use it without React, Vue or Svelte?

Yes: `@trevixal/core` is plain TypeScript, and the [web
component](../guide/web-component) runs from a single `<script>` with no build
tools.

### Does it work server-side (SSR, Next.js)?

Yes. Creating an editor touches no DOM until a view is attached, the React,
Vue and web-component adapters have SSR import tests, and the headless editor
can parse, serialize and transform documents in Node. See [Server
rendering](../guide/ssr).

### What do I store in my database?

`editor.getJSON()`: a stable, schema-validated JSON document. HTML is an
*export format* (`getHTML()`), not the storage format.

### Is pasted content safe?

Imported HTML is parsed in an inert template (scripts cannot run during
parsing) through an allowlist, URL attributes pass a protocol allowlist with
control-character rejection, and an XSS corpus locks the behaviour in.

### Which browsers are supported?

Chromium, Firefox and WebKit, all three driven by the browser suite.

### Will my exports look like the editor?

Yes: theme, code colours and diagrams are carried into HTML, PDF, DOCX and
RTF, and verified by rendering the real files. See [What an export
carries](../reference/exports).

### How do I add my own block type?

Define a `NodeSpec` (content expression, `toHTML`, `parseHTML`) and merge it
into your `Schema`. [The callout tutorial](../extending/callout) does exactly
that in about eighty lines.

### Why is a menu entry missing?

Because nothing wired it. `createEditorUI` drops entries with no action rather
than showing a dead switch; supply the action in `fileActions`,
`viewActions`, or the relevant `*Commands` option. See [The UI
kit](../reference/ui-kit).

### Where did collaboration go?

Removed on 2026-09-12, deliberately and completely, along with comments,
mentions and sharing. Trevixal is a single-user editor; the decision is
recorded in [ADR-0009](../adr/0009-collab-binding), now superseded. Tracked
changes, slash commands, emoji and the security package stayed: they are
editing features, not collaboration.

### What does it deliberately not do?

Real-time collaboration, comments, mentions and sharing; a bundled
spell-check dictionary (the browser's is better, in more languages); a
bundled PDF writer (the browser's print dialog already produces it); native
mobile SDKs; table cells spanning rows ([ADR-0006](../adr/0006-colspan-only-table-model)).
