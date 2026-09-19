# @trevixal/extension-format-code

<!-- generated: header -->

[![CI](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@trevixal/extension-format-code.svg)](https://www.npmjs.com/package/@trevixal/extension-format-code)
[![types](https://img.shields.io/npm/types/@trevixal/extension-format-code.svg)](https://www.npmjs.com/package/@trevixal/extension-format-code)
[![license](https://img.shields.io/npm/l/@trevixal/extension-format-code.svg)](https://github.com/adityabhalsod/trevixal-editor/blob/main/LICENSE)

[Documentation](https://trevixal-editor.vercel.app) · [Live editor](https://trevixal-editor.vercel.app/full-editor) · [Changelog](https://github.com/adityabhalsod/trevixal-editor/blob/main/packages/extension-format-code/CHANGELOG.md) · [Issues](https://github.com/adityabhalsod/trevixal-editor/issues)

[![The Trevixal editor](https://trevixal-editor.vercel.app/media/editor.png)](https://trevixal-editor.vercel.app/full-editor)

## Features

- JSON and XML pretty-printing and minification
- An in-place code-block reformat command
- **1.9 kB** minified and gzipped, with TypeScript types in the package

<!-- /generated: header -->

Pretty-print or minify the JSON or XML in the code block at the caret.

```sh
npm install @trevixal/extension-format-code
```

## Usage

```ts
import { formatCodeBlock, minifyCodeBlock, codeFormatUICommands } from '@trevixal/extension-format-code'

editor.exec(formatCodeBlock('json'))
editor.exec(minifyCodeBlock('xml'))

// Or hand the set to the chrome, which puts them under Tools.
createEditorUI(editor, { codeFormatCommands: codeFormatUICommands(), /* … */ })
```

The block is rewritten in place as a single undo step, and the command
declines when the caret is not in a code block or the content does not parse,
so a typo never destroys what you were formatting.

## Standalone formatters

`formatJSON`, `minifyJSON`, `formatXML`, `minifyXML` and `normalizeIndent` are
pure string functions, usable anywhere.

`formatJSON` parses for real, never `eval`, never a regex rewrite, so
nothing in the source can execute and a malformed document is reported rather
than half-formatted.

It measures the nesting depth first, with a flat scan, and declines past 500
levels. `JSON.parse` and `JSON.stringify` are both recursive in every engine,
so a pathologically nested document (`[[[[[…]]]]]`) overflows the stack, a
`RangeError` at best and an uncatchable crash at worst. Checking first turns
that into an ordinary error message.

## License

Apache-2.0
