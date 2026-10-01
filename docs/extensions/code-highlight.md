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

JavaScript, TypeScript, Python, HTML, CSS, JSON, SQL, shell, Go, Rust, Java,
Markdown, a terminal session (`console`) and a diff, with the usual aliases
(`js`, `ts`, `py`, `sh`, `rs`, `md`, `golang`, `jsx`, `tsx`, `scss`, `xml`,
`vue`, `terminal`, `patch`). Resolution is case-insensitive.

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
| `tvx-tok-inserted` | A diff's added lines |
| `tvx-tok-deleted` | A diff's removed lines |

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

## Lines, titles and folding

A code block's attributes say how its code is shown: `lineNumbers`,
`highlightLines` (`"1,3-5"`), `wrap`, `title` and `collapsed`. They go out
in HTML as `data-` attributes and in Markdown as the fence's meta, the way
documentation sites write it:

````md
```ts title="app.ts" {1,3-5} showLineNumbers
````

`codeBlockLines(editor)` draws them. It puts a zero-width marker at the
start of each line, out of the document, which the stylesheet turns into a
number in the gutter and a band across a picked-out line. A diff's added and
removed lines are banded too. A folded block shows eight lines and a
*Show all* bar that unfolds it.

## Terminal sessions and diffs

`insertTerminal()` puts in a `console` block. `copyableCode(code, language)`
is what its copy button copies: the commands after each `$` or `❯` prompt,
without the prompt and without their output. A command that ends in `\`
goes on into the next line. A `#` is never taken for a prompt, since a
comment copied as a command would run.

`lineDiff(before, after)` compares two versions line by line, and
`insertCodeDiff(before, after, title?)` puts the result in a `diff` block.

## Running code

`enableCodeRunner(editor)` runs a JavaScript or HTML block in a frame with
`sandbox="allow-scripts"` and no `allow-same-origin`, so it has no origin of
its own and cannot reach the page, its storage or its cookies. A content
security policy lets nothing be fetched. What JavaScript prints to the
console is listed under the block; HTML is drawn there. The output belongs
to the code that ran, so editing the code clears it.
