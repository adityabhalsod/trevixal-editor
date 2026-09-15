---
title: Playground
---

# Playground

The real editor, running on this page from the same CDN build a `<script>` tag
would load. Type in it.

<ClientOnly>
  <Playground />
</ClientOnly>

## What you are looking at

This is `<trevixal-editor>`. The whole integration is two lines:

```html
<link rel="stylesheet" href="https://unpkg.com/@trevixal/ui/styles.css" />
<script src="https://unpkg.com/@trevixal/web-component"></script>
```

The **document** panel is `editor.getJSON()`, updating on every change. That
is the shape you store: schema-validated, stable, and convertible to HTML,
Markdown, Word or a PDF without a browser.

Try a few things that are easy to miss:

- Type `# ` at the start of a line, or `- `, or `> `, or ` ``` `
- Paste some formatted text from another page, watch what survives
- Press `Ctrl+Z`; notice that the input rules undo as one step, not two
- Type `--` and watch it become an em dash

The full chrome (menubar, toolbar, dialogs, tables, images, diagrams) is a
separate package on top of this. See [Getting started](./guide/getting-started).
