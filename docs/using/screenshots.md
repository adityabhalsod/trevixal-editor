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
</script>
