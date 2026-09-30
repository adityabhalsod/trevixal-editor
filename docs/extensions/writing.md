# Writing assistance

`@trevixal/extension-writing`: readability, passive voice, repeated words,
long sentences, grammar hints, inclusive language, tone, clichés and jargon,
and keyword density, as marks in the margin and as a report. Beside them: a
reading heat map, synonyms on right-click, an accessibility audit and a
duplicate-text finder.

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
  inclusive: true,      // on by default
  tone: false,          // hedges, empty intensifiers, condescension; off by default
  cliches: false,       // clichés, and jargon with its plain word; off by default
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

## Word lists

`INCLUSIVE_TERMS`, `TONE_PHRASES` and `CLICHES` are the lists behind the
three word-list checks. Each entry is a phrase, a message and, when one word
simply stands in for another, its replacement. `findPhrases(text, entries)`
runs any list, your own included, and returns ranges with the replacement in
the original's case. A removal takes the space after it along, so the
sentence closes up. It is not offered for the first word of a sentence,
which would leave the sentence starting in lower case.

## Reading heat map

```ts
import { createReadingHeatmap, readingLevel } from '@trevixal/extension-writing'

const heatmap = createReadingHeatmap(editor)
heatmap.toggle()
readingLevel('The cat sat on the mat.') // { level: 'easy', grade: 0 }
```

Each sentence gets `trevixal-heat trevixal-heat--easy` (or `--fair`,
`--hard`, `--very-hard`) and `data-reading-grade`, on a decoration layer of
its own.

## Synonyms

```ts
import { COMMON_SYNONYMS, enableThesaurus, wordListThesaurus } from '@trevixal/extension-writing'

const stop = enableThesaurus(editor, { lookup: wordListThesaurus(COMMON_SYNONYMS) })
enableThesaurus(editor, { lookup: (word) => myService.synonyms(word) }) // or a promise
```

A lookup that answers at once leaves the browser's menu alone for a word it
does not know. One that answers with a promise cannot hand the event back, so
its menu opens and says when nothing was found. A restriction on the context
menu stops the event first, so no menu opens at all.

## Accessibility audit

```ts
import { ACCESSIBILITY_KIND_LABELS, auditAccessibility, openFindingsReport } from '@trevixal/extension-writing'

const issues = auditAccessibility(editor.state.doc, { background: '#ffffff' })
// each: kind ('alt-text' | 'heading-order' | 'empty-heading' | 'link-text' | 'contrast' | 'table-header'), path, from?, to?, message
```

`contrastRatio(foreground, background)` is the WCAG ratio. `MINIMUM_CONTRAST`
is 4.5, the level AA figure for body text.

## Duplicate text

```ts
import { findDuplicatePassages } from '@trevixal/extension-writing'

const passages = findDuplicatePassages(editor.state.doc, others, { minWords: 8 })
// others: { id, title, doc }[]; each passage: path, from, to, text, foundIn
```

`openFindingsReport(document, { title, empty, findings })` shows any list of
findings in the kit's dialog look, each with a Go to button.

## A pluggable writing assistant

```ts
import { type WritingProvider, createRulesProvider } from '@trevixal/extension-writing'

const provider: WritingProvider = {
  actions: ['rewrite', 'summarise', 'translate', 'continue'],
  async assist({ action, text, language }, { signal }) {
    const response = await fetch('/api/assist', {
      method: 'POST',
      body: JSON.stringify({ action, text, language }),
      signal,
    })
    return (await response.json()).text
  },
}
```

The editor makes no request of its own: the provider is the host's, and so
is where it sends the text. `signal` aborts when the reader cancels.
`createRulesProvider()` rewrites (`rewriteByRules`) and summarises
(`summariseByRules`) in the page with the word lists above, and throws
`AssistError` for what it cannot do. The assembled editor takes a provider
as `writingProvider`, uses the rules one by default, and hides the menu for
`null`.

