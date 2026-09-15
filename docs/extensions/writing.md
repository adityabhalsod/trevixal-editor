# Writing assistance

`@trevixal/extension-writing`: readability, passive voice, repeated words,
long sentences, grammar hints and keyword density, as marks in the margin and
as a report.

```sh
npm install @trevixal/extension-writing
```

## Setting up

```ts
import { createWritingAssistant, createWritingInlineUI, analyzeText } from '@trevixal/extension-writing'

const assistant = createWritingAssistant(editor, {
  passive: true,
  repeated: true,
  grammar: true,
  longSentences: true,
  debounceMs: 400,
  onReport: (report) => renderIssues(report.issues), // each issue: kind, range, message, suggestion?
})
createWritingInlineUI(editor, assistant) // the card and menu at the word itself

assistant.applySuggestion(issue) // apply the fix, keeping the marks around it
assistant.goTo(issue)
assistant.setEnabled('passive', false)
```

Issues render through a decoration layer, so nothing is written into the
document and a check you turn off leaves no trace behind.

## At the word itself

A wavy underline tells the reader that something is wrong and not what. The
inline UI puts the finding where the finding is: point at a flagged word and
a small card names the check that fired and what it found; click it and the
same finding opens as a menu, with the replacement where there is one and
**Ignore this wording** where the reader disagrees. `Ctrl+.` opens that menu
for whatever is under the caret.

Ignoring is by kind, rule and exact text rather than by position. "Their"
waved through in one sentence is waved through in all of them. Dismissing a
single occurrence would put the warning straight back the moment anything
before it in the block was edited, because the range has moved.

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
`sentenceSpans`, `wordSpans`, `countSyllables`, `ENGLISH_STOPWORDS`, and
`goalProgress` for a word-count goal.

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
node for an identical fresh one. Only text; replacing whole blocks also works
but reloads embed iframes, which would restart a playing video on what should
be a display-only toggle.
