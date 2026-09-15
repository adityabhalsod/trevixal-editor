# @trevixal/extension-code-highlight

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
