---
title: Drop-in page
---

# One HTML file

Save this as `index.html` and open it. Nothing to install, nothing to build:
three URLs and one call.

<<< @/.vitepress/theme/drop-in.html

## The same file, running

The frame below is that file: the code above is read from the document the
frame loads, so the two cannot drift apart.

<DropIn />

A few things about it:

- **It is the release on npm**, whatever is current. The [full editor](./full-editor)
  and the [playground](./playground) run the code in this checkout instead.
  Those URLs follow the latest version; a page you ship should pin one, as in
  `https://unpkg.com/@trevixal/editor-kit@1.0.1`.
- **It is a page of its own.** It saves into this browser under the kit's
  default `trevixal` prefix, and follows your system's light or dark setting,
  not the switch in this site's top bar.
- **Uploads stay local.** A dropped image is POSTed to `/api/uploads`, the
  kit's default, and nothing answers there, so it becomes a data URL in the
  document instead. `uploadEndpoint` names your own; `null` skips the request.

[The whole editor](./guide/full-editor) covers what the one call accepts and
where to make it from each framework.
