# Every menu command

The stock menu tree of `@trevixal/ui`, with the default shortcut label where
one is printed. A host that supplies a shortcut manager decides the labels
instead (the assembled editor prints `Ctrl+Shift+K` for *Insert > Link*,
since `Ctrl+K` belongs to the palette there). Entries the host has not wired
do not appear at all; see [Why is a menu entry missing?](../contributing/faq#why-is-a-menu-entry-missing).

## File

New document `Ctrl+Alt+N` · Open... `Ctrl+O` · Save `Ctrl+S` · **Download as
>** Web page (.html) / Markdown (.md) / Plain text (.txt) / Trevixal JSON
(.json) / Word document (.docx) / Rich text (.rtf) / PDF (via print) /
Encrypted document (.tvx) · Download selection... · Import a file... · Local
backups... · Protect with password... · Restrictions... · Print preview... ·
Print... `Ctrl+P`

## Edit

Undo `Ctrl+Z` · Redo `Ctrl+Y` · Cut `Ctrl+X` · Copy `Ctrl+C` · Paste `Ctrl+V`
· Paste without formatting · **Change case >** UPPERCASE / lowercase / Title
Case · Find and replace... `Ctrl+F` · Select all `Ctrl+A`

## Insert

Image... · Link... `Ctrl+K` · Remove link · Horizontal rule · Line break
`Shift+Enter` · Special character... · Emoji... · Video... · Audio... · Embed
a link... · Link preview card... · File attachment... · Equation... · Display
equation... · Diagram · **Callout >** Info / Success / Warning / Danger / Note
· Toggle block · **Columns >** 2 / 3 / 4 columns · Card · Timeline · **Tabs >**
2 / 3 tabs · Accordion · Badge... · Button... · Anchor... · Footnote ·
Citation... · References list · Renumber citations · Page break

## Format

Bold `Ctrl+B` · Italic `Ctrl+I` · Underline `Ctrl+U` · Strikethrough ·
**Formats >** Superscript / Subscript / Code / Small caps / Highlight ·
**Paragraph styles >** Paragraph / Heading 1 to 6 / Quote / Code block ·
**Align >** Left / Center / Right / Justify · **Indentation >** Increase /
Decrease · **Line height >** Default / Single / 1.15 / 1.5 / Double ·
**Paragraph spacing >** before and after none / small / medium / large, then
space before none / medium / large, then space after none / medium / large ·
**Letter spacing >** Normal / Tight / Wide / Wider · **Lists >** Bullet /
Numbered / Task, eight list styles, Restart numbering, Continue numbering,
five multilevel lists ·
Format painter · Clear text formatting · Clear all formatting

## Tools

Find and replace... `Ctrl+F` · Command palette... `Ctrl+K` · Table of
contents · Document outline · Source code... · Markdown source... · Edit as
Markdown · Edit as HTML · Format JSON · Format XML · Minify · Copy code block ·
Document statistics... · Writing goal... · **Check writing >** All checks /
Grammar / Passive voice / Repeated words / Long sentences · Spell check · Word
count

## Table

Insert table · Row above · Row below · Delete row · Column left · Column right
· Delete column · Merge cells · Split cells... · Header row · Cell background... ·
**Cell alignment >** Left / Center / Right / Default · **Borders >** All /
Outside only / Rows only / No borders / Border colour... · **Sort by this
column >** Ascending / Descending · Convert text to table · Convert table to
text · Import CSV... · Copy as CSV · Distribute columns evenly · Reset column
sizes · Delete table

## View

**Theme >** Light / Dark / Match the system / Sepia / Nord / Solarized / High
contrast / Midnight / Custom theme... / Custom CSS... · Add a font... · Focus
mode · Typewriter scrolling · Fullscreen · Page view · Table of contents ·
Document outline · History · Documents · Side-by-side preview · Split editor
· Narrow / Normal / Wide / Full width · Read-only mode · Suggesting mode

Every entry in this menu that switches something on shows a tick while it is
on; the theme and the width each behave as one radio group.

## Help

Keyboard shortcuts... · Customize toolbar... · About
