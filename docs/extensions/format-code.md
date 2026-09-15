# Code formatting

`@trevixal/extension-format-code`: pretty-print or minify the JSON or XML in
the code block at the caret.

```sh
npm install @trevixal/extension-format-code
```

## Usage

```ts
import { formatCodeBlock, minifyCodeBlock, codeFormatUICommands } from '@trevixal/extension-format-code'

editor.exec(formatCodeBlock('json'))
editor.exec(minifyCodeBlock('xml'))

// Or hand the set to the chrome, which puts them under Tools.
createEditorUI(editor, { codeFormatCommands: codeFormatUICommands() })
```

The block is rewritten in place as a single undo step, and the command
declines (returns `null`) when the caret is not in a code block, when the
block is not that language, when the source does not parse, or when the
result is identical, so a typo never destroys what you were formatting and a
chained command can take over.

## Standalone formatters

`formatJSON`, `minifyJSON`, `formatXML`, `minifyXML` and `normalizeIndent` are
pure string functions, usable anywhere.

`formatJSON` parses for real, never `eval`, never a regex rewrite, so nothing
in the source can execute and a malformed document is reported rather than
half-formatted.

It measures the nesting depth first, with a flat scan, and declines past 500
levels. `JSON.parse` and `JSON.stringify` are both recursive in every engine,
so a pathologically nested document overflows the stack: a `RangeError` at
best and an uncatchable crash at worst. Checking first turns that into an
ordinary error message.
