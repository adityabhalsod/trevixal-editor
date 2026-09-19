# @trevixal/extension-math

<!-- generated: header -->

[![CI](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@trevixal/extension-math.svg)](https://www.npmjs.com/package/@trevixal/extension-math)
[![types](https://img.shields.io/npm/types/@trevixal/extension-math.svg)](https://www.npmjs.com/package/@trevixal/extension-math)
[![license](https://img.shields.io/npm/l/@trevixal/extension-math.svg)](https://github.com/adityabhalsod/trevixal-editor/blob/main/LICENSE)

[Documentation](https://trevixal-editor.vercel.app) · [Live editor](https://trevixal-editor.vercel.app/full-editor) · [Changelog](https://github.com/adityabhalsod/trevixal-editor/blob/main/packages/extension-math/CHANGELOG.md) · [Issues](https://github.com/adityabhalsod/trevixal-editor/issues)

[![The Trevixal editor](https://trevixal-editor.vercel.app/media/editor.png)](https://trevixal-editor.vercel.app/full-editor)

## Features

- Inline and display LaTeX, rendered to MathML
- An input rule and a pluggable renderer
- **7.7 kB** minified and gzipped, with TypeScript types in the package

<!-- /generated: header -->

LaTeX equations rendered to MathML, inline and display, with no runtime
dependency and nothing to download.

```sh
npm install @trevixal/extension-math
```

## Usage

Merge the nodes into your schema:

```ts
new Schema({ nodes: { ...defaultNodes(), ...mathNodes() }, marks: defaultMarks() })
```

```ts
import { mathInputRules, insertMath, insertMathBlock, latexToMathML } from '@trevixal/extension-math'
import { defaultInputRules } from '@trevixal/core'

const editor = createEditor({
  schema,
  element,
  inputRules: [...defaultInputRules(), ...mathInputRules()], // enables `$…$`
})

editor.exec(insertMath('E = mc^2'))
editor.exec(insertMathBlock('\\int_0^1 x^2\\,dx = \\frac{1}{3}'))
latexToMathML('\\sqrt{a^2 + b^2}') // '<math>…</math>'
```

## What the converter covers

Fractions and roots, sub- and superscripts, matrices and environments, large
operators with limits, accents, stretchy delimiters, spacing commands, Greek
in both cases, blackboard bold and script, and a symbol table of several
hundred names.

It is written here rather than pulled in, so an equation costs no network
request and renders the moment the document does, which also means it renders
in an export, where a script would not run.

## The `$…$` rule

Typing the closing `$` converts the run. The rule ignores `$$`, so display
math typed by hand is left for the block command, and an escaped `\\$` never
counts as a delimiter. It does not fire inside a code block, where `$x$` is
text somebody meant to keep.

## A different renderer

`mathNodes({ render })` takes any `(latex, display) => string`, so KaTeX or
MathJax can be dropped in where the output must match a house style. The
default is `defaultMathRenderer`.

The result is inserted as trusted markup, so a renderer is responsible for
escaping every part of the source it echoes back.

## License

Apache-2.0
