# Writing help and readability

Grammar hints, style checks, statistics and goals, all under *Tools*.

## Checks as you type

*Tools > Check writing* marks issues in the margin as you type, each with a
one-click fix where one exists:

- **Grammar**: a/an agreement, sentence case, doubled spaces, space before
  punctuation, missing space after punctuation, common errors and
  misspellings
- **Passive voice**
- **Repeated words**
- **Long sentences** (more than 25 words)

Each check can be switched on and off on its own from the same submenu.

Point at any underlined word for a small card naming the check that fired and
what it found; click it for the same finding as a menu: the replacement where
there is one, and **Ignore this wording** where there is not. `Ctrl+.` opens
that menu for whatever is under the caret, so none of it needs a mouse.

Ignoring is by wording rather than by position, so a word waved through in
one sentence stays waved through instead of coming back the moment the line
above it is edited.

Passive voice and over-long sentences are judgements rather than typos: there
is no one replacement to offer, and the menu says so instead of showing an
empty list.

## Statistics

*Tools > Document statistics...* reports words, characters, sentences and
paragraphs, reading time (at 238 words a minute) and speaking time (at 150),
Flesch reading ease with a plain-language label, Flesch-Kincaid grade, and
keyword density.

*Tools > Word count* shows the live counts that also sit in the status bar.

## Goals

*Tools > Writing goal...* sets a word-count target with a live progress
readout.

## Spell check

*Tools > Spell check* toggles the browser's own checker. A bundled dictionary
is deliberately out of scope: browsers ship better ones, in more languages,
than a shipped word list could match.

## In your own app

The [writing extension](../extensions/writing) page has the API:
`createWritingAssistant`, the inline UI, `analyzeText` and the individual
measures.
