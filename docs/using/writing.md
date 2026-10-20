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
- **Inclusive language**: wording that leaves people out, with the everyday
  alternative ("chairman" to "chair", "whitelist" to "allowlist", "sanity
  check" to "quick check")
- **Tone**: empty intensifiers ("very", "really"), hedges ("I think", "sort
  of") and words that talk down ("obviously", "simply"). Off until you turn
  it on, since tone is a matter of voice.
- **Clichés and jargon**: "at the end of the day", "low-hanging fruit", and
  jargon with its plain word ("utilize" to "use", "in order to" to "to").
  Off until you turn it on too.

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

## Writing assistant

*Tools > Writing assistant* works on the selection: **Rewrite**, **Summarise**
and **Translate**, and **Continue writing** from the caret. What comes back
opens in a dialog you can edit before choosing **Replace** or **Insert**, or
**Discard** to leave the document as it was. **Cancel** stops a request that
is taking too long.

The editor bundles no model and sends nothing anywhere. The app you use
decides what answers: a language model behind its own server, or rules. Out
of the box the assembled editor rewrites and summarises by rule, in the page.
A rewrite gets plain words for jargon, loses empty intensifiers and gains
inclusive wording, and a summary takes the first sentence of each paragraph.
Translating and continuing need a model, so their entries appear only when
the app supplies one.

## Dictation and read-aloud

*Tools > Read aloud* reads the document from the caret, a block at a time,
and the caret follows the voice word by word. Choose it again to stop. With
nothing after the caret, it reads from the top.

*Tools > Dictate* types what the microphone hears at the caret, with a space
before it when the text needs one, until you choose it again. It keeps
listening through pauses.

Both use the browser's own speech engine, so there is nothing to install and
no service of the editor's involved. Where the browser has no speech
recognition (Firefox, for one), *Dictate* is not offered.

## Reading heat map

*Tools > Check writing > Reading heat map* tints every sentence by how hard it
reads, from green to red. The grade comes from the sentence's length and its
words' syllables (Flesch-Kincaid). A sentence over 25 words is at least
orange whatever its words. Each tinted sentence names its grade in
`data-reading-grade`. Turn it off from the same entry.

## Synonyms

Right-click a word for synonyms, and click one to put it in the word's
place, in the same case. The context-menu key does the same for the word at
the caret. A word the thesaurus has nothing for keeps the browser's own menu.
The assembled editor ships a small list of common English words. Pass your
own list, or a thesaurus service, as the `thesaurus` option.

## Accessibility check

*Tools > Accessibility check...* lists what would trip up a reader using a
screen reader, or one with low vision:

- an image with no alt text that is not marked decorative
- a heading that skips a level, or has no text
- a link whose text says nothing about where it goes ("click here") or is a
  bare address
- coloured text with a contrast under 4.5:1 against its background
- a table with no header row

**Go to** beside each finding selects it in the document.

## Duplicate text

*Tools > Find duplicate text...* lists the sentences of the open document
that another document in the workspace also has. Sentences of eight words or
more are compared by their words alone, so case, spacing and punctuation do
not hide a match.

## Citation styles

*Insert > Import sources...* reads a BibTeX (`.bib`) or CSL-JSON (`.json`)
file. Every reference manager exports one of these. Each source becomes an
entry in the reference list, and importing the same file twice adds nothing
the second time. *Insert > Citation...* then offers the sources to cite, or
takes a new reference in words.

*Insert > Citation style* sets the list in **APA**, **MLA**, **Chicago**
(author-date) or **IEEE**. APA, MLA and Chicago cite by author and year, as
in (Smith & Doe, 2020), and put the list in author order. IEEE numbers its
citations in the order the text cites them. Every entry with imported
details is written out again in the new style. An entry you typed yourself
keeps its words.

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
