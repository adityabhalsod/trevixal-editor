---
title: Full editor
layout: page
# The site sidebar would otherwise still render beside a page layout.
sidebar: false
pageClass: full-editor-page
---

<div class="vp-doc full-editor-copy">

# The full editor, live

`@trevixal/editor-kit`, running on this page from the same one-file build a
`<script>` tag would load. Menubar, toolbar, panels, panes, every extension.
Type in it, open the menus, drag a toolbar group, switch a theme.

</div>

<ClientOnly>
  <FullEditor />
</ClientOnly>

<div class="vp-doc full-editor-copy">

## What you are looking at

The whole integration is one call, the same one every example in the
repository makes from its own framework:

```ts
import { mountFullEditor } from '@trevixal/editor-kit'
import '@trevixal/ui/styles.css'
import '@trevixal/editor-kit/styles.css'

mountFullEditor({ element: document.querySelector('#app') })
```

A few things about this copy of it:

- **It saves.** Autosave, the theme you pick and the document workspace are
  kept in this browser's `localStorage` under the `trevixal-docs` prefix.
  Reload and your draft is still there; File ▸ New starts clean.
- **It follows the site's theme, and the site follows it.** The switch in the
  top bar and View ▸ Theme in the editor set the same thing.
- **Uploads stay local.** There is no upload endpoint behind this page, so a
  dropped image becomes a data URL inside the document instead of a request.
- **It is the code in this checkout**, not a release: the docs build copies
  the kit's bundle and stylesheet out of `packages/editor-kit/dist`.

[The whole editor](./guide/full-editor) explains the package, where to call
it from each framework, and what it lets you configure. The
[user guide](./using/) walks through every menu and key.

</div>
