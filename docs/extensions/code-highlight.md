# Syntax highlighting

`@trevixal/extension-code-highlight`: highlighting for code blocks, rendered
as **decorations**. The document itself stays plain text, so copy, paste and
export are all unaffected by how the code happens to be coloured.

```sh
npm install @trevixal/extension-code-highlight
```

## Setting up

```ts
import { codeHighlight, createHighlighter, createCopyCodeButtons, detectLanguage } from '@trevixal/extension-code-highlight'
import { createCodeLanguageSelect } from '@trevixal/ui'

const dispose = codeHighlight(editor, createHighlighter({ fallback: 'javascript' }))
createCopyCodeButtons(editor)          // a copy button on every code block
createCodeLanguageSelect(editor)       // a floating language picker above the block at the caret
detectLanguage('def foo(self):')       // { language, score, margin }, or null when unsure
```

Each code block reads its language from its own `language` attribute
(`editor.commands.setBlockAttrs({ language: 'python' })`). A block with no
language renders unhighlighted unless you pass a `fallback`; the language
picker in the chrome offers detection for blocks that name none.

Only blocks whose code changed are re-tokenized, and the tokenizer is held to
a time budget on hostile input by its tests.

## Bundled languages

JavaScript, TypeScript, Python, HTML, CSS, JSON, SQL, shell, Go, Rust, Java
and Markdown, with the usual aliases (`js`, `ts`, `py`, `sh`, `rs`, `md`,
`golang`, `jsx`, `tsx`, `scss`, `xml`, `vue`). Resolution is
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
| `tvx-tok-tag` | HTML and XML tags |
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
