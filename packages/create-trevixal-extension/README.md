# create-trevixal-extension

Scaffold an extension for the Trevixal editor: a package with a node type,
its commands, a menu entry and tests, laid out as the shipped extensions are.

```sh
npm create trevixal-extension @acme/trevixal-extension-sticky-note
cd trevixal-extension-sticky-note
npm install
npm test
```

A second argument names the directory to make it in. The name must be one npm
takes; the node, its command and its menu entry are named after it without
its scope and a `trevixal-extension-` prefix: `stickyNote`, `insertStickyNote`,
Insert ▸ Sticky note.

The documentation is at <https://trevixal-editor.vercel.app/extending/adding#a-whole-extension>.
