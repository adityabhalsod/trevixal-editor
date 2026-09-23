# Structural blocks

`@trevixal/extension-blocks`: the blocks a document needs beyond paragraphs
and lists.

```sh
npm install @trevixal/extension-blocks
```

## Setting up

```ts
import { blockNodes, blockKeymap, blockBindings, insertCallout, insertColumns } from '@trevixal/extension-blocks'

const schema = new Schema({ nodes: { ...defaultNodes(), ...blockNodes() }, marks: defaultMarks() })
const editor = createEditor({ schema, element, keymap: blockKeymap() })
blockBindings(editor) // click handling for toggles, tabs and accordions

editor.exec(insertCallout('warning'))
editor.exec(insertColumns(3))
```

## The blocks

| Block | Commands |
| --- | --- |
| Callout, five tones (info, success, warning, danger, note) | `insertCallout(variant)`, `setCalloutVariant` |
| Toggle | `insertToggleBlock`, `toggleToggleOpen` |
| Columns, 2 to 4 | `insertColumns(count)`, `setColumnCount` |
| Card, timeline | `insertCard`, `insertTimeline`, `insertTimelineItem` |
| Tabs | `insertTabs(count)`, `addTab`, `removeTab`, `moveTab`, `activateTab` |
| Accordion | `insertAccordion`, `addAccordionItem`, `setAccordionItemOpen`, `toggleAccordionExclusive` |
| Badge, button, anchor | `insertBadge`, `insertButton`, `insertAnchor` |
| Footnotes, endnotes, citations | `insertFootnote`, `insertEndnote`, `insertCitation`, `insertReferenceList`, `renumberCitations` |
| Captions, cross-references | `insertCaption(kind, { label, text?, position? })`, `insertCrossReference(target, format)`, `referenceTargets(doc)` |
| Table of figures, index | `insertCaptionList(kind)`, `markIndexEntry({ entry?, sub? })`, `insertDocumentIndex` |
| Page break | `insertPageBreak` |

`blockUICommands()` hands the whole set to `createEditorUI`, which populates
*Insert* with them.

## Fields

Caption numbers, cross-references, tables of figures and the index are
fields, as in Word: each keeps its result in its own attributes, so every
serializer writes what the reader sees without computing anything.
`installFieldUpdater(editor)` keeps the results current. It adds a dispatch
transform that appends the updates to the edit that made them necessary, so
one undo takes back an inserted figure and the renumbering it caused. Install
it after any other transform (track changes) so it sees the final edit; the
kit does.

```ts
const stop = installFieldUpdater(editor)
editor.exec(insertCaption('figure', { label: 'Figure', text: 'A cat' }))
const target = referenceTargets(editor.state.doc).find((entry) => entry.kind === 'figure')
if (target) editor.exec(insertCrossReference(target, 'label')) // "Figure 1", and it follows
```

| Node | Holds | HTML |
| --- | --- | --- |
| `captionNumber` (inline) | `kind` (figure, table, equation), `id`, `number` | `<span class="trevixal-caption-number" data-caption="figure" id="fig-1">1</span>` |
| `crossReference` (inline) | `target`, `format` (label, number, text, full), `text` | `<span class="trevixal-xref" data-xref="fig-1" data-href="#fig-1">Figure 1</span>` |
| `captionList` | `kind`, `entries` (JSON) | `<nav data-caption-list="figure">` |
| `documentIndex` | `entries` (JSON) | `<div data-document-index>` |
| `indexTerm` (mark, from `referenceMarks()`) | `id`, `entry`, `sub` | `<span data-index-term="xe-1">` |
| `endnoteRef`, `endnoteList`, `endnoteItem` | as the footnote nodes | `data-endnote`, numbered i, ii, iii |

A caption is any paragraph (or figure caption) holding a `captionNumber`, with
the words before it ("Figure") as ordinary text. Results are recomputed rather
than trusted on import, and a caption pasted twice gets a fresh id for its
copy. `referenceMarks()` has to be added to the schema's marks for the index.

## Getting out of a container

`blockKeymap()` supplies the two gestures every nested block needs. `Enter` on
an empty trailing paragraph inside a container leaves it; without that, a
callout at the end of the document traps the cursor, because every `Enter`
makes another paragraph inside it. `Enter` on a toggle summary, tab title or
accordion title moves into the body rather than splitting the title.

## Tabs and accordions in an export

Tabs and accordions write their active state into the document
(`data-active`), which is what lets an exported page switch them. An
accordion is a native `<details>`, so it keeps working in a saved file because
the browser owns it. A tab strip is laid out from an attribute that only the
editor moves, so `@trevixal/ui` inlines a small script into exports to make
the titles work there too.

Before adding an interactive block of your own, decide what it does in an
export, and add the print rule, or the PDF quietly loses whatever is not on
top. The [callout tutorial](../extending/callout) walks through a new block
end to end.
