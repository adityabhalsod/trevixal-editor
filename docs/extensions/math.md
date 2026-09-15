# Equations

`@trevixal/extension-math`: LaTeX equations rendered to MathML, inline and
display, with no runtime dependency and nothing to download.

```sh
npm install @trevixal/extension-math
```

## Setting up

```ts
import { defaultInputRules } from '@trevixal/core'
import { mathNodes, mathInputRules, insertMath, insertMathBlock, latexToMathML } from '@trevixal/extension-math'

const schema = new Schema({ nodes: { ...defaultNodes(), ...mathNodes() }, marks: defaultMarks() })
const editor = createEditor({
  schema,
  element,
  inputRules: [...defaultInputRules(), ...mathInputRules()], // enables `$...$`
})

editor.exec(insertMath('E = mc^2'))
editor.exec(insertMathBlock('\\int_0^1 x^2\\,dx = \\frac{1}{3}'))
latexToMathML('\\sqrt{a^2 + b^2}') // '<math>...</math>'
```

`mathUICommands()` gives `createEditorUI` the *Insert > Equation* entries.

## What the converter covers

Fractions and roots, sub- and superscripts, matrices and environments, large
operators with limits, accents, stretchy delimiters, spacing commands, Greek
in both cases, blackboard bold and script, and a symbol table of several
hundred names.

It is written here rather than pulled in, so an equation costs no network
request and renders the moment the document does, which also means it renders
in an export, where a script would not run.

## The `$...$` rule

Typing the closing `$` converts the run. The rule ignores `$$`, so display
math typed by hand is left for the block command, and an escaped `\$` never
counts as a delimiter. It does not fire inside a code block, where `$x$` is
text somebody meant to keep.

## A different renderer

`mathNodes({ render })` takes any `(latex, display) => string`, so KaTeX or
MathJax can be dropped in where the output must match a house style. The
default is `defaultMathRenderer`.

The result is inserted as trusted markup, so a renderer is responsible for
escaping every part of the source it echoes back.
