# @trevixal/extension-writing

<!-- generated: header -->

[![CI](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@trevixal/extension-writing.svg)](https://www.npmjs.com/package/@trevixal/extension-writing)
[![types](https://img.shields.io/npm/types/@trevixal/extension-writing.svg)](https://www.npmjs.com/package/@trevixal/extension-writing)
[![license](https://img.shields.io/npm/l/@trevixal/extension-writing.svg)](https://github.com/adityabhalsod/trevixal-editor/blob/main/LICENSE)

[Documentation](https://trevixal-editor.vercel.app) · [Live editor](https://trevixal-editor.vercel.app/full-editor) · [Changelog](https://github.com/adityabhalsod/trevixal-editor/blob/main/packages/extension-writing/CHANGELOG.md) · [Issues](https://github.com/adityabhalsod/trevixal-editor/issues)

[![The Trevixal editor](https://trevixal-editor.vercel.app/media/editor.png)](https://trevixal-editor.vercel.app/full-editor)

## Features

- Readability, passive voice, repeated words and grammar hints
- Keyword density, as decorations and as a report
- **8.8 kB** minified and gzipped, with TypeScript types in the package

<!-- /generated: header -->

Readability, passive voice, repeated words, long sentences, grammar hints and
keyword density, as marks in the margin and as a report.

```sh
npm install @trevixal/extension-writing
```

## Usage

```ts
import { createWritingAssistant, analyzeText } from '@trevixal/extension-writing'

const assistant = createWritingAssistant(editor, {
  passive: true,
  repeated: true,
  grammar: true,
  longSentences: true,
  debounceMs: 400,
  onReport: (report) => renderIssues(report.issues),
})

assistant.applySuggestion(issue) // apply the fix, keeping the marks around it
assistant.goTo(issue)
assistant.setEnabled('passive', false)
```

Issues render through a decoration layer, so nothing is written into the
document and a check you turn off leaves no trace behind.

## At the word itself

A wavy underline tells the reader that something is wrong and not what. The
inline UI puts the finding where the finding is:

```ts
import { createWritingAssistant, createWritingInlineUI } from '@trevixal/extension-writing'

const assistant = createWritingAssistant(editor)
createWritingInlineUI(editor, assistant)
```

Point at a flagged word and a small card names the check that fired and what
it found. Click it and the same finding opens as a menu: the replacement where
there is one, and **Ignore this wording** where the reader disagrees.
`Ctrl+.` opens that menu for whatever is under the caret, so none of it needs
a mouse.

Ignoring is by kind, rule and exact text rather than by position. "Their"
waved through in one sentence is waved through in all of them. Dismissing a
single occurrence would put the warning straight back the moment anything
before it in the block was edited, because the range has moved.

Passive voice and over-long sentences are judgements rather than typos: there
is no one replacement to offer, and the menu says so instead of showing an
empty list.

Each painted span carries `data-trevixal-issue`, so a host building its own
popovers can find its way from a DOM node back to `assistant.issue(id)`.

## The report

`analyzeText(text)` is pure and needs no editor:

```ts
const stats = analyzeText(editor.getText())
// words, sentences, syllables, Flesch reading ease and its label,
// Flesch-Kincaid grade, reading time (238 wpm), speaking time (150 wpm),
// passive matches, repeated words, long sentences, keyword density
```

Also exported piecemeal: `fleschReadingEase`, `fleschKincaidGrade`,
`readabilityLabel`, `readingTime`, `speakingTime`, `keywordDensity`,
`findPassiveSentences`, `findRepeatedWords`, `findLongSentences`,
`sentenceSpans`, `wordSpans`, `countSyllables`, `ENGLISH_STOPWORDS`.

## Grammar

Eight rules, deliberately: a/an agreement, sentence case, doubled spaces,
space before punctuation, missing space after punctuation, repeated words,
common errors and misspellings. Each returns a range and a suggestion, so the
fix is one click.

They are conservative on purpose. A grammar checker that is wrong a fifth of
the time is one people switch off, and then the other four fifths never get
seen either.

## Spell check

`setSpellcheck(editor, enabled)` and `isSpellcheckEnabled(editor)` drive the
browser's own checker. A bundled dictionary is out of scope, since browsers
ship better ones in more languages than a word list here could match.

Turning it back **on** does more than flip the attribute: a browser only
checks text it has not seen before, so the helper swaps every rendered text
node for an identical fresh one. Only text, replacing whole blocks also works
but reloads embed iframes, which would restart a playing video on what should
be a display-only toggle.

## License

Apache-2.0
