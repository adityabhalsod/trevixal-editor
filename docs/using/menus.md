# Every menu command

The stock menu tree of `@trevixal/ui`, with the key the assembled editor
prints beside each entry: its shortcut manager's, which is what fires, and
they follow a rebind. A Mac prints ⌘ and ⌥ where these say Ctrl and Alt, and
takes ⌘⌥0 to 6 for the paragraph styles. Without a shortcut manager a menu
prints only the keys the engine answers itself: Undo, Redo, Cut, Copy, Paste,
Select all, Bold, Italic, Underline, Line break, and the palette's `Ctrl+K`.
Entries the host has not wired do not appear at all; see
[Why is a menu entry missing?](../contributing/faq#why-is-a-menu-entry-missing).

## File

New document `Ctrl+Alt+N` · Open... `Ctrl+O` · Save `Ctrl+S` · **Download as
>** Web page (.html) / Markdown (.md) / Plain text (.txt) / Trevixal JSON
(.json) / Word document (.docx) / Rich text (.rtf) / PDF (via print) /
Encrypted document (.tvx) · Download selection... · Import a file... · Local
backups... · Protect with password... `Ctrl+Alt+P` · Restrictions... · Print preview... ·
Print... `Ctrl+P`

## Edit

Undo `Ctrl+Z` · Redo `Ctrl+Shift+Z`, `Ctrl+Y` · Cut `Ctrl+X` · Copy `Ctrl+C` · Paste `Ctrl+V`
· Paste without formatting · **Change case >** UPPERCASE / lowercase / Title
Case · Find and replace... `Ctrl+F` · Select all `Ctrl+A`

## Insert

Image... · Link... `Ctrl+Shift+K` · Remove link · Horizontal rule · Line break
`Shift+Enter` · Special character... · Tab character · Emoji... `Ctrl+Shift+Space` · Video... · Audio... · Embed
a link... · Link preview card... · File attachment... · Equation... · Display
equation... · Diagram · **Callout >** Info / Success / Warning / Danger / Note
· Toggle block · **Columns >** 2 / 3 / 4 columns · Card · Timeline · **Tabs >**
2 / 3 tabs · Accordion · Badge... · Button... · Anchor... · Footnote ·
Endnote · Citation... · References list · Renumber citations · Caption... ·
Cross-reference... · **Table of figures >** Figures / Tables / Equations ·
Mark index entry... · Index · Page break

## Format

Bold `Ctrl+B` · Italic `Ctrl+I` · Underline `Ctrl+U` · Strikethrough
`Ctrl+Shift+X` · **Formats >** Superscript / Subscript / Code `Ctrl+E` / Small
caps / Highlight · Styles pane · **Paragraph styles >** Paragraph `Ctrl+Shift+0`,
`Ctrl+Alt+0` / Title / Subtitle / Heading 1 to 6 `Ctrl+Shift+1` to `6`, `Ctrl+Alt+1` to `6` /
Quote / Code block · **Heading numbering >** None / 1. 1.1. 1.1.1. / 1. a.
i. / 1) a) i) / I. A. 1. · **Align >** Left / Center / Right / Justify
`Ctrl+Shift+L` / `E` / `R` / `J` · **Indentation >** Increase `Ctrl+]` /
Decrease `Ctrl+[` · **Text direction >** Left to right / Right to left /
Whole document right to left · Line numbers · Hyphenation · Widow and orphan
control · **Text columns >** One / Two / Three / Line between · Borders and
shading... · **Drop cap >** None / Dropped / In margin / Drop cap options... ·
Tabs... · **Line height >** Default /
Single / 1.15 / 1.5 / Double ·
**Paragraph spacing >** before and after none / small / medium / large, then
space before none / medium / large, then space after none / medium / large ·
**Letter spacing >** Normal / Tight / Wide / Wider · **Lists >** Bullet
`Ctrl+Shift+8` / Numbered `Ctrl+Shift+7` / Task `Ctrl+Shift+9`, eight list
styles, Restart numbering, Continue numbering, five multilevel lists ·
Format painter · Clear text formatting · Clear all formatting `Ctrl+\`

## Tools

Find and replace... `Ctrl+F` · Command palette... `Ctrl+K` · Table of
contents · Document outline · Source code... · Markdown source... · Edit as
Markdown · Edit as HTML · Format JSON · Format XML · Minify · Copy code block ·
Document statistics... · Writing goal... · **Check writing >** All checks /
Grammar / Passive voice / Repeated words / Long sentences · Spell check · Smart
quotes and symbols · AutoCorrect as you type · AutoCorrect options... · Word
count

## Table

Insert table · Draw table · Eraser · Border painter · Row above · Row below ·
Delete row · Column left · Column right · Delete column · Merge cells · Split
cells... · **Table style >** Table grid / Grid / Blue grid ... Lime grid /
Header / Blue header ... Lime header · **Style options >** Header row / Total
row / Banded rows / First column / Last column / Banded columns · Cell
background... · **Cell alignment >** Left / Center / Right / Default ·
**Borders >** All / Outside only / Rows only / No borders / Border colour... ·
**Line style >** Solid / Dashed / Dotted / Double · **Line weight >** ½ pt /
1½ pt / 2¼ pt / 3 pt · **Sort by this column >** Ascending / Descending ·
Convert text to table · Convert table to text · Import CSV... · Copy as CSV ·
**AutoFit >** AutoFit contents / AutoFit window / Fixed column width ·
Distribute rows evenly · Distribute columns evenly · Reset column sizes ·
Delete table

Draw table, Eraser and Border painter are tools rather than commands: picking
one hands it to the pointer, and the entry shows a tick until you pick it
again or press `Escape`. The table style, style options, line style and line
weight entries tick what the table at the caret has.

## View

**Theme >** Light / Dark / Match the system / Sepia / Nord / Solarized / High
contrast / Midnight / Custom theme... / Custom CSS... · Add a font... · Focus
mode `Ctrl+Shift+F` · Typewriter scrolling · Fullscreen `Ctrl+Shift+Enter` ·
Page view · Table of contents · Document outline · History · Documents ·
Side-by-side preview · Split editor `Ctrl+Alt+S` · Narrow / Normal / Wide /
Full width · Read-only mode · Suggesting mode

Every entry in this menu that switches something on shows a tick while it is
on; the theme and the width each behave as one radio group.

## Help

Keyboard shortcuts... · Customize toolbar... · About
