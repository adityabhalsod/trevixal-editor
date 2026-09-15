# @trevixal/extension-blocks

The structural blocks a document needs beyond paragraphs and lists: callouts,
toggles, columns, cards, timelines, tabs, accordions, footnotes and citations.

```sh
npm install @trevixal/extension-blocks
```

## Usage

Merge the nodes into your schema:

```ts
new Schema({ nodes: { ...defaultNodes(), ...blockNodes() }, marks: defaultMarks() })
```

```ts
import { blockKeymap, blockBindings, insertCallout, insertColumns } from '@trevixal/extension-blocks'

const editor = createEditor({ schema, element, keymap: blockKeymap() })
blockBindings(editor) // click handling for toggles, tabs and accordions

editor.exec(insertCallout('warning'))
editor.exec(insertColumns(3))
```

## The blocks

| Block | Commands |
| --- | --- |
| Callout, five tones | `insertCallout(variant)`, `setCalloutVariant` |
| Toggle | `insertToggleBlock`, `toggleToggleOpen` |
| Columns, 2-4 | `insertColumns(count)`, `setColumnCount` |
| Card, timeline | `insertCard`, `insertTimeline`, `insertTimelineItem` |
| Tabs | `insertTabs(count)`, `addTab`, `removeTab`, `moveTab`, `activateTab` |
| Accordion | `insertAccordion`, `addAccordionItem`, `setAccordionItemOpen`, `toggleAccordionExclusive` |
| Badge, button, anchor | `insertBadge`, `insertButton`, `insertAnchor` |
| Footnotes, citations | `insertFootnote`, `insertCitation`, `insertReferenceList`, `renumberCitations` |
| Page break | `insertPageBreak` |

## Getting out of a container

`blockKeymap()` supplies the two gestures every nested block needs. `Enter` on
an empty trailing paragraph inside a container leaves it, without that, a
callout at the end of the document traps the cursor, because every `Enter`
makes another paragraph inside it. `Enter` on a toggle summary, tab title or
accordion title moves into the body rather than splitting the title.

## Tabs and accordions in an export

An accordion is a native `<details>`, so it keeps working in a saved file
because the browser owns it. A tab strip is laid out from a `data-active`
attribute that only the editor moves, so `@trevixal/ui` inlines a small script
into exports to make the titles work there too. Before adding an interactive
block, decide what it does in an export, and add the print rule, or the PDF
quietly loses whatever is not on top.

## License

Apache-2.0
