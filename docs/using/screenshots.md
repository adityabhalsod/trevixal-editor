# Screenshot gallery

The full editor at work, feature by feature. Each screenshot was taken in
Chromium while walking through a feature with its real menus and dialogs.
Click one to see it full size. In the viewer, the arrow keys go to the next
and previous screenshot, and `Escape` closes it.

## Long documents

Heading numbers, captions, cross-references, tables of figures, the index,
notes, line numbers, the block menu and right-to-left text, as
[Long documents](./structure) describes them.

<ScreenshotGallery :shots="longDocuments" />

## Formatting tools

Named styles and the Styles pane, AutoFormat and AutoCorrect, drop caps, text
columns, hyphenation, borders and shading, and tab stops, as
[Formatting tools](./formatting) describes them.

<ScreenshotGallery :shots="formattingTools" />

## Lists and tables

Task dates and assignees, folding and sorting a list, a multilevel list of
your own, a frozen header row, cell padding and vertical alignment, a table
inside a table and the header row a print repeats, as
[Lists and tables](./lists-and-tables) describes them.

<ScreenshotGallery :shots="listsAndTables" />

## Tables as data

Formulas and totals, column types, filtered rows, a chart drawn from a table,
and cells merged down a column or split, as
[Lists and tables](./lists-and-tables) describes them.

<ScreenshotGallery :shots="tablesAsData" />

## Images and media

The alt text prompt, image galleries and the lightbox, a camera photo, markup
on a picture, the whiteboard, audio with its waveform, video chapters and
embeds, as [Images, media and drawings](./media) describes them.

<ScreenshotGallery :shots="media" />

## Links

A link to any block, the link check, a pasted address shown as its page’s
title, and wiki links and backlinks between documents, as
[Long documents](./structure) and
[Working with several documents](./workspace) describe them.

<ScreenshotGallery :shots="links" />

## Code and equations

A code block’s options, JavaScript run in a sandbox, diffs, Graphviz and
PlantUML, the equation palette, numbered equations and chemistry, Vim’s keys
and front matter, as [Code, diagrams and equations](./code) describes them.

<ScreenshotGallery :shots="code" />

## Review, versions and clipping

Suggestions accepted a reviewer at a time, named versions compared with now or
with a file, a web page’s article clipped in, and a workspace document
included in another, as [Reviewing with tracked changes](./review),
[Files](./files) and [Working with several documents](./workspace) describe
them.

<ScreenshotGallery :shots="workflow" />

## Keyboard and productivity

Go to, several carets at once, the next match, snippets, macros, paste special
and the palette’s recent documents, as
[Keyboard and typing shortcuts](./shortcuts) describes them.

<ScreenshotGallery :shots="productivity" />

## Files

Every format File ▸ Download as writes, and the File menu’s imports, folders
and versions, as [Files](./files) describes them.

<ScreenshotGallery :shots="files" />

## Notes, maps, polls and conditional blocks

A sticky note in the margin, a map, a poll and a block shown only while a
template variable says so, as [Long documents](./structure) describes them.

<ScreenshotGallery :shots="blocks" />

## Protection

Redacted words, a locked section, a password, the watermark a protected
document prints under, and the lock screen, as
[Protecting a document](./protection) describes them.

<ScreenshotGallery :shots="protection" />

## Appearance and language

The chrome in nine languages and mirrored for Arabic, toolbar presets,
document fonts, theme files and a dyslexia-friendly face, as
[Appearance](./appearance) describes them.

<ScreenshotGallery :shots="appearance" />

## Writing tools

Inclusive language, tone and clichés, the reading heat map, synonyms, the
writing assistant, the accessibility check, citation styles and duplicate
text, as [Writing help and readability](./writing) describes them.

<ScreenshotGallery :shots="writing" />

## Comments

Comment threads with replies, @mentions and resolving, as
[Reviewing with tracked changes](./review) describes them.

<ScreenshotGallery :shots="comments" />

## Forms and mail merge

Form fields in the text, filled in and signed, and a mail merge from a CSV
file, as [Files](./files) describes them.

<ScreenshotGallery :shots="forms" />

## Page layout

Page setup, the page view with its header, footer and watermark, a section
break to a landscape page, and the pages a print lays out, as [Files](./files)
describes them.

<ScreenshotGallery :shots="pageLayout" />

## Presenting

The document as slides, with the speaker’s notes, as [Files](./files)
describes it.

<ScreenshotGallery :shots="presenting" />

## Signatures and passkeys

A digital signature and the change after it, the audit log, and a passkey on
the lock screen, as [Protecting a document](./protection) describes them.

<ScreenshotGallery :shots="trust" />

## On a phone

The toolbar along the bottom of a phone, and the formatting bubble, as
[Appearance](./appearance) describes them.

<ScreenshotGallery :shots="phone" />

<script setup>
const longDocuments = [
  { file: '01-report-overview.png', caption: 'A quarterly report to work on' },
  { file: '02-format-menu-heading-numbering-direction-line-numbers.png', caption: 'Format menu: heading numbering, text direction and line numbers' },
  { file: '03-heading-numbers-outline-1.1.1.png', caption: 'Heading numbers as 1. 1.1. 1.1.1.' },
  { file: '04-heading-numbers-1.a.i.png', caption: 'Heading numbers as 1. a. i.' },
  { file: '05-heading-numbers-parenthesis-1)a)i).png', caption: 'Heading numbers as 1) a) i)' },
  { file: '06-heading-numbers-roman-I.A.1.png', caption: 'Heading numbers as I. A. 1.' },
  { file: '07-insert-menu.png', caption: 'Insert menu: captions, cross-references, tables of figures, index and endnotes' },
  { file: '08-caption-dialog.png', caption: 'The Caption dialog' },
  { file: '09-figure-captions.png', caption: 'Numbered figure captions' },
  { file: '10-table-and-equation-captions.png', caption: 'Table and equation captions' },
  { file: '11-cross-reference-dialog.png', caption: 'The Cross-reference dialog' },
  { file: '12-cross-references.png', caption: 'Cross-references in the text' },
  { file: '13-cross-reference-renumbered.png', caption: 'A figure captioned earlier renumbers the reference to Figure 3' },
  { file: '14-table-of-figures-and-tables.png', caption: 'A table of figures and a table of tables' },
  { file: '15-mark-index-entry-dialog.png', caption: 'The Mark index entry dialog' },
  { file: '16-index.png', caption: 'The index, built from marked words' },
  { file: '17-footnotes-and-endnotes.png', caption: 'Footnotes and endnotes' },
  { file: '18-line-numbers.png', caption: 'Line numbers in the margin' },
  { file: '19-print-preview-with-line-numbers.png', caption: 'Print preview, with line numbers' },
  { file: '20-block-menu.png', caption: 'The block menu, from the drag grip' },
  { file: '21-block-menu-turned-into-quote-and-duplicated.png', caption: 'A paragraph turned into a quote, and duplicated' },
  { file: '22-right-to-left-paragraph.png', caption: 'A right-to-left paragraph' },
  { file: '23-right-to-left-document.png', caption: 'A right-to-left document, with the chrome mirrored' },
]

const formattingTools = [
  { file: '24-newsletter-overview.png', caption: 'A newsletter to format' },
  { file: '25-format-menu-hyphenation-widows-and-text-columns.png', caption: 'Format menu: hyphenation, widow control and text columns' },
  { file: '26-format-menu-borders-drop-cap-and-tabs.png', caption: 'Format menu: borders and shading, drop cap and tabs' },
  { file: '27-styles-pane-title-and-subtitle.png', caption: 'The Styles pane, with Title and Subtitle applied' },
  { file: '28-modify-normal-style-dialog.png', caption: 'Modify Normal' },
  { file: '29-normal-style-restyles-every-paragraph.png', caption: 'Every body paragraph follows the changed Normal' },
  { file: '30-new-paragraph-style-dialog.png', caption: 'A new paragraph style' },
  { file: '31-custom-style-pull-quote.png', caption: 'The Pull quote style applied' },
  { file: '32-character-styles.png', caption: 'Character styles: Strong and Subtle emphasis' },
  { file: '33-drop-cap-options-dialog.png', caption: 'Drop cap options' },
  { file: '34-drop-cap.png', caption: 'A capital dropped over three lines' },
  { file: '35-tabs-dialog.png', caption: 'The Tabs dialog' },
  { file: '36-tab-stops-decimal-with-dot-leaders.png', caption: 'A decimal tab stop with a dot leader' },
  { file: '37-borders-and-shading-dialog.png', caption: 'The Borders and shading dialog' },
  { file: '38-bordered-and-shaded-notice.png', caption: 'A boxed and shaded paragraph' },
  { file: '39-smart-quotes-symbols-and-autocorrect-as-you-type.png', caption: 'Smart quotes, symbols and AutoCorrect as you type' },
  { file: '40-tools-menu-autoformat.png', caption: 'Tools menu: AutoFormat and AutoCorrect' },
  { file: '41-autocorrect-options-dialog.png', caption: 'AutoCorrect options, with an entry added' },
  { file: '42-autocorrect-own-entry.png', caption: 'The added entry, corrected as it is typed' },
  { file: '43-two-text-columns-with-line-and-hyphenation.png', caption: 'Two text columns with a line between, hyphenated' },
  { file: '44-print-preview-formatting.png', caption: 'Print preview of the formatting' },
]

const listsAndTables = [
  { file: '45-launch-plan-overview.png', caption: 'A launch plan: tasks, an agenda, suppliers and a budget' },
  { file: '46-format-menu-list-tools.png', caption: 'Format menu: define a multilevel list, sort, fold and task details' },
  { file: '47-task-due-date-and-assignee-dialog.png', caption: 'A task’s due date and assignee' },
  { file: '48-task-chips-overdue-and-done-count.png', caption: 'Each task’s chip, the overdue one in red, and the done count' },
  { file: '49-list-item-fold-chevron.png', caption: 'The chevron beside an item with something under it' },
  { file: '50-list-item-folded.png', caption: 'The item folded shut' },
  { file: '51-list-sorted-a-to-z.png', caption: 'The list sorted A to Z, the folded item with it' },
  { file: '52-define-new-multilevel-list-dialog.png', caption: 'Define new multilevel list: nine levels and a preview' },
  { file: '53-custom-multilevel-list.png', caption: 'The agenda numbered Part I –, then II.1' },
  { file: '54-multilevel-gallery-with-own-scheme.png', caption: 'The scheme in the gallery, under the built-in ones' },
  { file: '55-table-menu-caption-and-freeze.png', caption: 'Table menu: Insert caption, Freeze header row and first column' },
  { file: '56-table-menu-cell-alignment-and-padding.png', caption: 'Table menu: vertical alignment and cell padding' },
  { file: '57-frozen-header-row-while-scrolling.png', caption: 'The header row held at the top while the table scrolls' },
  { file: '58-cell-padding-and-vertical-alignment.png', caption: 'Wide padding, and a cost aligned to the middle' },
  { file: '59-table-inside-a-cell.png', caption: 'A table inside a cell' },
  { file: '60-print-preview-with-header-row.png', caption: 'Print preview of the budget' },
  { file: '61-printed-page-two-repeats-the-header-row.png', caption: 'Printed page 2 starts with the header row' },
]

const tablesAsData = [
  { file: '62-table-menu-data-tools.png', caption: 'Table menu: formulas, column types, filters, hidden columns and charts' },
  { file: '63-formula-dialog.png', caption: 'The Formula dialog: =SUM(ABOVE), set as money' },
  { file: '64-column-type-menu.png', caption: 'Table menu: a column’s type, from text to a checkbox' },
  { file: '65-formula-totals-currency-and-checkboxes.png', caption: 'Totals worked out by formula, the quarters as money and the target as ticks' },
  { file: '66-filter-rows-dialog.png', caption: 'Filter rows: Q2 greater than 1,000' },
  { file: '67-filtered-rows.png', caption: 'West hidden by the filter, not deleted: Show all rows brings it back' },
  { file: '68-table-chart.png', caption: 'Table ▸ Insert chart: the table drawn as a bar chart' },
  { file: '69-cells-merged-down-a-column.png', caption: 'Friday’s cell merged down a column, across its two sessions' },
  { file: '70-split-cells-rows-and-columns.png', caption: 'Split cells: into columns, rows, or both' },
]

const media = [
  { file: '71-alt-text-prompt.png', caption: 'A new picture asks what it shows, or to be marked decorative' },
  { file: '72-image-gallery.png', caption: 'Insert ▸ Image gallery: the photos in a grid' },
  { file: '73-lightbox.png', caption: 'A double click opens a picture full size' },
  { file: '74-camera-photo.png', caption: 'Insert ▸ Camera photo: a picture from the camera, straight in' },
  { file: '75-image-markup.png', caption: 'Mark up image: boxes, arrows, blur and words, drawn into the picture' },
  { file: '76-whiteboard.png', caption: 'Insert ▸ Drawing: a whiteboard for a pen, boxes, arrows and ellipses' },
  { file: '77-drawing-in-the-document.png', caption: 'The drawing in the document, as SVG' },
  { file: '78-recording-audio.png', caption: 'Insert ▸ Record audio, recording' },
  { file: '79-audio-with-waveform.png', caption: 'The recording in the document, with its waveform' },
  { file: '80-video-chapters-dialog.png', caption: 'Insert ▸ Video chapters: a time and a title a line' },
  { file: '81-video-chapters.png', caption: 'Each chapter a link that seeks the video to where it starts' },
  { file: '82-embed-a-link.png', caption: 'Insert ▸ Embed a link: X, gists, CodePen, CodeSandbox, Figma, maps, Spotify and more' },
]

const links = [
  { file: '83-link-to-any-block.png', caption: 'Insert ▸ Link: to any block, a paragraph as well as a heading' },
  { file: '84-check-links.png', caption: 'Tools ▸ Check links: the links that go nowhere, each a click from where it is' },
  { file: '85-pasted-link-title.png', caption: 'A pasted address shows as its page’s title' },
  { file: '86-wiki-link-suggestions.png', caption: 'Type [[ to link to another document in the workspace' },
  { file: '87-backlinks.png', caption: 'Backlinks: the handbook lists the document that links to it' },
]

const code = [
  { file: '88-code-block-options.png', caption: 'A code block’s options: line numbers, picked-out lines, wrap, fold and a title' },
  { file: '89-code-block-numbered-highlighted-titled.png', caption: 'Its lines numbered, two picked out, and a title over it' },
  { file: '90-run-javascript.png', caption: 'JavaScript run in a sandboxed frame, what it printed under it' },
  { file: '91-code-diff-dialog.png', caption: 'Insert ▸ Code ▸ Diff of two versions' },
  { file: '92-code-diff.png', caption: 'The diff: what went, and what came, coloured' },
  { file: '93-graphviz-and-plantuml.png', caption: 'Graphviz and PlantUML drawn under their code, as Mermaid is' },
  { file: '94-equation-palette.png', caption: 'The equation dialog: a palette of symbols and a live preview' },
  { file: '95-numbered-equations-and-chemistry.png', caption: 'Numbered display equations, chemistry among them' },
  { file: '96-key-bindings-menu.png', caption: 'Tools ▸ Key bindings: Standard, Emacs or Vim' },
  { file: '97-vim-normal-mode.png', caption: 'Vim’s keys on, its mode on the status line' },
  { file: '98-front-matter-dialog.png', caption: 'File ▸ Front matter: the YAML a Markdown or MDX file keeps' },
]

const workflow = [
  { file: '99-review-by-reviewer.png', caption: 'Suggestions by two reviewers: the review bar accepts or rejects one reviewer’s' },
  { file: '100-save-version.png', caption: 'File ▸ Save version: a named checkpoint' },
  { file: '101-versions-and-backups.png', caption: 'Versions and backups: named versions, and the rolling snapshots' },
  { file: '102-compare-a-version-with-now.png', caption: 'A version beside the document now, the words that changed marked' },
  { file: '103-compare-with-a-file.png', caption: 'Tools ▸ Compare with a file: side by side, what changed marked' },
  { file: '104-import-from-a-web-address.png', caption: 'File ▸ Import from a web address' },
  { file: '105-clipped-article.png', caption: 'The article clipped in, its menus, sidebar and footer left behind' },
  { file: '106-include-from-workspace.png', caption: 'Insert ▸ Include from workspace: another document, kept in step' },
]

const productivity = [
  { file: '107-go-to.png', caption: 'Ctrl+G: go to a heading, a bookmark or a line' },
  { file: '108-multiple-carets.png', caption: 'Alt+click adds a caret: one typing goes to each line' },
  { file: '109-select-next-match.png', caption: 'Ctrl+D selects the word and each next match, to change them all at once' },
  { file: '110-snippets.png', caption: 'Tools ▸ Snippets: text kept under an abbreviation' },
  { file: '111-snippet-expanded.png', caption: 'Typed ;sig and Tab: the signature written out' },
  { file: '112-macro-menu.png', caption: 'Tools ▸ Macro: record what you do, and F8 plays it' },
  { file: '113-paste-special.png', caption: 'Edit ▸ Paste special: as text in the style around it, as Markdown, or as code' },
  { file: '114-pasted-as-markdown.png', caption: 'The clipboard’s Markdown, pasted as formatting' },
  { file: '115-palette-recent-documents.png', caption: 'Ctrl+K: the documents opened lately at the top of the palette' },
]

const files = [
  { file: '116-download-as-formats.png', caption: 'File ▸ Download as: OpenDocument, EPUB, LaTeX, PowerPoint, a fillable PDF form and more' },
  { file: '117-file-menu-imports-and-folders.png', caption: 'File: import a file or a web page, download a workspace folder, versions and backups' },
]

const blocks = [
  { file: '118-map-dialog.png', caption: 'Insert ▸ Map: a place by its coordinates, and a label' },
  { file: '119-map.png', caption: 'The map in the document, its pin on the place; it zooms from its own buttons' },
  { file: '120-poll-dialog.png', caption: 'Insert ▸ Poll: a question and its choices' },
  { file: '121-show-only-when-dialog.png', caption: 'Insert ▸ Show only when: a template variable and a value' },
  { file: '122-template-variables.png', caption: 'Tools ▸ Template variables: the values the blocks read' },
  { file: '123-note-poll-and-conditional.png', caption: 'A note in the margin, a poll with a vote in, and a block shown to the organisers only' },
]

const protection = [
  { file: '124-tools-menu-redact-and-lock.png', caption: 'Tools: redact the selection, lock the selected blocks, and the locked sections' },
  { file: '125-redacted-words-and-a-locked-section.png', caption: 'Redacted words, and a locked section: deleting everything leaves it, and the status line says why' },
  { file: '126-locked-sections-dialog.png', caption: 'Tools ▸ Locked sections: each one, to unlock' },
  { file: '127-protect-with-password-dialog.png', caption: 'File ▸ Protect with password' },
  { file: '128-print-preview-watermark-and-stand-ins.png', caption: 'Print preview: a protected document prints under a watermark, the redacted words as a stand-in' },
  { file: '129-lock-screen.png', caption: 'File ▸ Lock now: the document hidden until its password is typed; ten idle minutes lock it too' },
]

const appearance = [
  { file: '130-view-menu-language.png', caption: 'View ▸ Language: nine languages, each named in itself' },
  { file: '131-chrome-in-german.png', caption: 'The menus and the toolbar in German' },
  { file: '132-chrome-in-arabic-mirrored.png', caption: 'Arabic mirrors the chrome; the document keeps its own direction' },
  { file: '133-view-menu-toolbar-presets.png', caption: 'View ▸ Toolbar: Minimal, Writing, Developer or Full' },
  { file: '134-toolbar-minimal.png', caption: 'The Minimal toolbar: text style, lists and undo' },
  { file: '135-toolbar-developer.png', caption: 'The Developer toolbar: code and tools' },
  { file: '136-document-fonts-dialog.png', caption: 'Format ▸ Document fonts: the body font and the heading font, saved in the document’s styles' },
  { file: '137-theme-menu-import-export-save.png', caption: 'View ▸ Theme: import a theme file, export the one in force, or save it with the document' },
  { file: '138-dyslexia-friendly-font.png', caption: 'View ▸ Dyslexia-friendly font: a readable face with wider letter, word and line spacing' },
]

const writing = [
  { file: '139-tools-menu-check-writing.png', caption: 'Tools ▸ Check writing: inclusive language, tone, clichés and a reading heat map among the checks' },
  { file: '140-inclusive-tone-and-cliche-suggestions.png', caption: 'An inclusive alternative for “chairman”; tone and a cliché underlined beside it' },
  { file: '141-reading-heat-map.png', caption: 'The reading heat map: each sentence tinted by how hard it reads' },
  { file: '142-synonyms-on-right-click.png', caption: 'Right-click a word for its synonyms' },
  { file: '143-writing-assistant-rewrite.png', caption: 'Tools ▸ Writing assistant ▸ Rewrite: the result to edit before it replaces the selection' },
  { file: '144-accessibility-check.png', caption: 'Tools ▸ Accessibility check: a skipped heading level, a vague link and faint text, each a click from where it is' },
  { file: '145-insert-citation-from-sources.png', caption: 'Insert ▸ Citation: pick from the imported sources' },
  { file: '146-citations-in-apa.png', caption: 'Sources imported from BibTeX, cited, and listed in APA style' },
  { file: '147-find-duplicate-text.png', caption: 'Tools ▸ Find duplicate text: a sentence another workspace document also has' },
]

const comments = [
  { file: '148-comment-dialog.png', caption: 'Insert ▸ Comment on the selected words (Ctrl+Alt+M)' },
  { file: '149-mention-suggestions.png', caption: 'Type @ in a reply for the people to mention' },
  { file: '150-comment-threads.png', caption: 'The comments panel: each thread by the words it is about, with its replies' },
  { file: '151-resolved-thread.png', caption: 'A resolved thread folds away, and its words lose their highlight' },
]

const forms = [
  { file: '152-insert-menu-form-fields.png', caption: 'Insert ▸ Form field: a text box, a tick box, a drop-down list, a date or a signature' },
  { file: '153-text-box-dialog.png', caption: 'A new text box: the name a mail merge fills it from, and the label it shows' },
  { file: '154-fill-in-a-field.png', caption: 'A click on a field asks for its value' },
  { file: '155-sign-a-signature-field.png', caption: 'A signature field: type your name to sign' },
  { file: '156-filled-in-form.png', caption: 'The letter filled in: a name, a choice, a date, a tick and a signature' },
  { file: '157-mail-merge-dialog.png', caption: 'Tools ▸ Mail merge: a letter for each row of a CSV file, downloaded together' },
]

const pageLayout = [
  { file: '158-page-setup-dialog.png', caption: 'File ▸ Page setup: paper, orientation, margins, and a header, footer and watermark on every page' },
  { file: '159-page-view-header-footer-watermark.png', caption: 'View ▸ Page view: the header, the numbered footer and the watermark on each sheet' },
  { file: '160-section-break-dialog.png', caption: 'Insert ▸ Section break: what follows on pages of its own, turned, in columns or with other margins' },
  { file: '161-print-preview-pages.png', caption: 'Print preview: the text laid out in pages, numbered Page 1 of 3' },
  { file: '162-printed-landscape-section.png', caption: 'The appendix prints on a landscape page of its own, so the wide table fits' },
]

const presenting = [
  { file: '163-slide.png', caption: 'View ▸ Present: each top-level heading starts a slide; arrow keys move between them' },
  { file: '164-speaker-notes.png', caption: 'N shows the speaker’s notes, taken from the note callouts' },
]

const trust = [
  { file: '165-sign-document-dialog.png', caption: 'File ▸ Sign document: a signature over the document as it stands, with a key kept in this browser' },
  { file: '166-signed.png', caption: 'The status line names the signer, the date and the key' },
  { file: '167-changed-since-signed.png', caption: 'A change after the signature, and the status line says so' },
  { file: '168-audit-log.png', caption: 'Tools ▸ Audit log: who changed what and when, to download as CSV' },
  { file: '169-lock-screen-with-passkey.png', caption: 'File ▸ Add a passkey: the lock screen then offers it beside the password' },
]

const phone = [
  { file: '170-toolbar-along-the-bottom.png', caption: 'On a phone the toolbar runs along the bottom, one row that scrolls, with buttons sized for a thumb' },
  { file: '171-formatting-bubble-on-a-phone.png', caption: 'Selected words still get their formatting bubble' },
]
</script>
