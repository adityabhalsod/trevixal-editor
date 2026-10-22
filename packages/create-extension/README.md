# @trevixal/create-extension

[![CI](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@trevixal/create-extension.svg)](https://www.npmjs.com/package/@trevixal/create-extension)
[![types](https://img.shields.io/npm/types/@trevixal/create-extension.svg)](https://www.npmjs.com/package/@trevixal/create-extension)
[![license](https://img.shields.io/npm/l/@trevixal/create-extension.svg)](https://github.com/adityabhalsod/trevixal-editor/blob/main/LICENSE)
[![docs](https://img.shields.io/badge/docs-GitHub%20Pages-blue)](https://adityabhalsod.github.io/trevixal-editor/)

[Documentation](https://trevixal-editor.vercel.app/extending/adding#a-whole-extension) · [Live editor](https://trevixal-editor.vercel.app/full-editor) · [Changelog](https://github.com/adityabhalsod/trevixal-editor/releases) · [Issues](https://github.com/adityabhalsod/trevixal-editor/issues)

[![The Trevixal editor](https://trevixal-editor.vercel.app/media/editor.png)](https://trevixal-editor.vercel.app/full-editor)

## Features

- A new extension package in one command: a node type, its commands, a menu entry and tests
- Laid out as the shipped extensions are: ESM and CommonJS builds with types, `@trevixal/core` and `@trevixal/ui` as peers
- Its tests pass and it typechecks as it is made
- **4.2 kB** minified and gzipped, with TypeScript types in the package

Scaffold an extension for the Trevixal editor, then change the node from there.

```sh
npm create @trevixal/extension trevixal-extension-sticky-note
cd trevixal-extension-sticky-note
npm install
npm test
```

## Usage

```sh
npm create @trevixal/extension <package-name> [directory]
```

The name must be one npm takes. The node, its command and its menu entry are
named after it without its scope and a `trevixal-extension-` prefix:
`trevixal-extension-sticky-note` makes `stickyNote`, `insertStickyNote`
and Insert ▸ Sticky note. The directory defaults to the name without its scope.

| File | What it holds |
| --- | --- |
| `src/schema.ts` | The node type: a box holding blocks, with a label attribute read back through a sanitiser |
| `src/commands.ts` | `insertStickyNote(label)`, which puts the selected blocks in one |
| `src/menu.ts` | `withStickyNoteMenu(menus)`: the entry at the end of Insert, to pass as `createEditorUI`'s `menus` |
| `test/` | The round trip, hostile markup, Enter leaving the box, and the menu entry running |
| `package.json`, `tsup.config.ts`, `tsconfig.json`, `vitest.config.ts` | Builds ESM and CommonJS with types |

## From a tool of your own

What the command writes is exported too, as a map from path to text. The
second argument is the Trevixal version the new package's peer ranges start
from.

```ts
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { extensionFiles } from '@trevixal/create-extension'

for (const [path, text] of extensionFiles('trevixal-extension-sticky-note', '1.0.5')) {
  const file = join('trevixal-extension-sticky-note', path)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, text)
}
```

A name npm would refuse, or one that leaves no name for the node, throws an
`ExtensionNameError`. `extensionNames(name)` returns every form of the name
the files use, without writing anything.

## License

Apache-2.0
