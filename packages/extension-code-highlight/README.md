# @trevixal/extension-code-highlight

[![CI](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@trevixal/extension-code-highlight.svg)](https://www.npmjs.com/package/@trevixal/extension-code-highlight)
[![types](https://img.shields.io/npm/types/@trevixal/extension-code-highlight.svg)](https://www.npmjs.com/package/@trevixal/extension-code-highlight)
[![license](https://img.shields.io/npm/l/@trevixal/extension-code-highlight.svg)](https://github.com/adityabhalsod/trevixal-editor/blob/main/LICENSE)
[![docs](https://img.shields.io/badge/docs-GitHub%20Pages-blue)](https://adityabhalsod.github.io/trevixal-editor/)
[![dev.to](https://img.shields.io/badge/dev.to-blog-0A0A0A?logo=devdotto&logoColor=white)](https://dev.to/aditya_bhalsod/i-built-a-rich-text-editor-from-scratch-no-prosemirror-no-dependencies-52b6)
[![stars](https://img.shields.io/github/stars/adityabhalsod/trevixal-editor?style=social)](https://github.com/adityabhalsod/trevixal-editor/stargazers)

[Documentation](https://trevixal-editor.vercel.app) · [Live editor](https://trevixal-editor.vercel.app/full-editor) · [Changelog](https://github.com/adityabhalsod/trevixal-editor/blob/main/packages/extension-code-highlight/CHANGELOG.md) · [Issues](https://github.com/adityabhalsod/trevixal-editor/issues)

[![Watch the Trevixal demo on YouTube](https://img.youtube.com/vi/PF8VchgEAeU/maxresdefault.jpg)](https://youtu.be/PF8VchgEAeU)

▶ [Watch the 1-minute demo on YouTube](https://youtu.be/PF8VchgEAeU)

[![The Trevixal editor](https://trevixal-editor.vercel.app/media/editor.png)](https://trevixal-editor.vercel.app/full-editor)

## Features

- Syntax highlighting behind an injectable `Highlighter` interface
- **6.1 kB** minified and gzipped, with TypeScript types in the package

Syntax highlighting for code blocks, rendered as **decorations**. The
document itself stays plain text, so copy, paste and export are all
unaffected by how the code happens to be coloured.

```sh
npm install @trevixal/extension-code-highlight
```

## Usage

```ts
import { codeHighlight, createHighlighter } from '@trevixal/extension-code-highlight'

const dispose = codeHighlight(editor, createHighlighter())
```

Each code block reads its language from its own `language` attribute:

```ts
editor.commands.setBlockAttrs({ language: 'python' })
```

A block with no language renders unhighlighted. Pass a `fallback` if your
documents never set one:

```ts
createHighlighter({ fallback: 'javascript' })
```

## Bundled languages

JavaScript, TypeScript, Python, HTML, CSS, JSON, SQL, shell, Go, Rust, Java
and Markdown, with the usual aliases (`js`, `ts`, `py`, `sh`, `rs`, `md`,
`golang`, `jsx`, `tsx`, `scss`, `xml`, `vue`…). Resolution is
case-insensitive.

These are rule sets rather than grammars: enough to colour code correctly in
an editor, with no parser in the bundle.

## Token classes

Every language emits the same class names, so a theme is a dozen colours:

| Class | Covers |
| --- | --- |
| `tvx-tok-keyword` | Language keywords |
| `tvx-tok-builtin` | Built-in types, constants and globals |
| `tvx-tok-string` | String and template literals |
| `tvx-tok-number` | Numeric and colour literals |
| `tvx-tok-comment` | Line and block comments |
| `tvx-tok-function` | Call targets, decorators, macros |
| `tvx-tok-operator` | Operators and punctuation |
| `tvx-tok-variable` | Shell variables, lifetimes |
| `tvx-tok-tag` | HTML/XML tags |
| `tvx-tok-attribute` | Attributes, object keys, CSS properties |
| `tvx-tok-selector` | CSS selectors and at-rules |

## Your own languages

```ts
createHighlighter({
  languages: [
    {
      name: 'toml',
      rules: [
        { pattern: /#[^\n]*/y, className: 'tvx-tok-comment' },
        { pattern: /\[[^\]\n]+\]/y, className: 'tvx-tok-selector' },
        { pattern: /[A-Za-z_][\w-]*(?=\s*=)/y, className: 'tvx-tok-attribute' },
      ],
    },
  ],
})
```

Rules are tried in order at each position, so specific ones (comments,
strings) must come before general ones (identifiers). Every pattern must be
sticky (`y`).

## A different engine

`createHighlighter` is one implementation of the `Highlighter` interface,
which is all `codeHighlight` requires:

```ts
interface Highlighter {
  highlight(code: string, language: string | null): readonly HighlightToken[]
}
```

Wrap Shiki, Prism or highlight.js behind it, offsets in, offsets out, and
nothing else in the editor changes.
