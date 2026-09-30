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
>** Web page (.html) / Web page, one file (.html) / Markdown (.md) / MDX (.mdx) / Plain text (.txt) / Trevixal JSON
(.json) / Word document (.docx) / Rich text (.rtf) / OpenDocument text (.odt) /
EPUB book (.epub) / LaTeX (.tex) / PowerPoint (.pptx) / Fillable PDF form (.pdf) / PDF (via print) /
Encrypted document (.tvx) · Download selection... · Front matter... · Import a file... ·
Import from a web address... · Download a workspace folder... · Save version... · Local
backups... · Protect with password... `Ctrl+Alt+P` · Restrictions... · Lock now · Unlock with a passkey... · Sign document... · Page setup... · Print preview... ·
Print... `Ctrl+P`

## Edit

Undo `Ctrl+Z` · Redo `Ctrl+Shift+Z`, `Ctrl+Y` · Cut `Ctrl+X` · Copy `Ctrl+C` · Paste `Ctrl+V`
· Paste without formatting · Paste special... · **Change case >** UPPERCASE /
lowercase / Title Case · Find and replace... `Ctrl+F` · Go to... `Ctrl+G` · Add
caret at next match `Ctrl+D` · Select all `Ctrl+A`

## Insert

Image... · Image gallery... · Camera photo... · Screenshot... · Drawing... ·
Link... `Ctrl+Shift+K` · Remove link · Horizontal rule · Line break
`Shift+Enter` · Special character... · Snippet... · Tab character · Emoji... `Ctrl+Shift+Space` · Video... · Audio... · Record audio... ·
Video chapters... · Embed a link... · Link preview card... · File attachment... ·
Include from workspace... · Equation... · Display
equation... · Diagram · Graphviz diagram · PlantUML diagram · **Code >**
Terminal session / Diff of two versions... / JavaScript to run / HTML to run ·
**Callout >** Info / Success / Warning / Danger / Note
· Toggle block · **Columns >** 2 / 3 / 4 columns · Card · Timeline · **Tabs >**
2 / 3 tabs · Accordion · Margin note · Poll... · Map... · Show only when... · Badge... · Button... · Anchor... · Footnote ·
Endnote · Comment... `Ctrl+Alt+M` · **Form field >** Text box... / Tick box... /
Drop-down list... / Date... / Signature... · Citation... · References list · Renumber citations · Import sources... ·
**Citation style >** APA / MLA / Chicago / IEEE · Caption... ·
Cross-reference... · **Table of figures >** Figures / Tables / Equations ·
Mark index entry... · Index · Page break · Section break...

## Format

Bold `Ctrl+B` · Italic `Ctrl+I` · Underline `Ctrl+U` · Strikethrough
`Ctrl+Shift+X` · **Formats >** Superscript / Subscript / Code `Ctrl+E` / Small
caps / Highlight · Styles pane · Document fonts... · **Paragraph styles >** Paragraph `Ctrl+Shift+0`,
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
styles, Restart numbering, Continue numbering, five multilevel lists, Define
new multilevel list..., Sort A to Z, Sort Z to A, Fold or unfold item, Task
due date and assignee... · Format painter · Clear text formatting · Clear all formatting `Ctrl+\`

## Tools

Find and replace... `Ctrl+F` · Command palette... `Ctrl+K` · Table of
contents · Document outline · Source code... · Markdown source... · Edit as
Markdown · Edit as HTML · Format JSON · Format XML · Minify · Copy code block ·
Document statistics... · Writing goal... · **Check writing >** All checks /
Grammar / Passive voice / Repeated words / Long sentences / Inclusive language /
Tone / Clichés and jargon / Reading heat map · Spell check · **Writing assistant >**
Rewrite selection... / Summarise selection... / Translate selection... / Continue writing... · Dictate ·
Read aloud · Accessibility
check... · Find duplicate text... · Audit log... · Mail merge... · Smart
quotes and symbols · AutoCorrect as you type · AutoCorrect options... · Check links... · Compare with a
file... · Snippets... · Template variables... · Redact selection · Lock selected blocks ·
Locked sections... · **Macro >** Record macro / Play macro `F8` · **Key
bindings >** Standard / Emacs / Vim · Word count

## Table

Insert table · Draw table · Eraser · Border painter · Row above · Row below ·
Delete row · Column left · Column right · Delete column · Merge cells · Split
cells... · Insert caption... · Freeze header row · Freeze first column ·
**Table style >** Table grid / Grid / Blue grid ... Lime grid /
Header / Blue header ... Lime header · **Style options >** Header row / Total
row / Banded rows / First column / Last column / Banded columns · Cell
background... · **Cell alignment >** Left / Center / Right / Default / Top /
Middle / Bottom · **Cell padding >** None / Narrow / Normal / Wide ·
**Borders >** All / Outside only / Rows only / No borders / Border colour... ·
**Line style >** Solid / Dashed / Dotted / Double · **Line weight >** ½ pt /
1½ pt / 2¼ pt / 3 pt · **Sort by this column >** Ascending / Descending ·
Formula... · **Column type >** Text / Number / Currency / Percentage / Date /
Checkbox · Filter rows... · Show all rows · Hide column · Show hidden columns ·
**Insert chart >** Bar chart / Line chart / Pie chart · Convert text to table · Convert table to text · Import CSV... · Copy as CSV ·
**AutoFit >** AutoFit contents / AutoFit window / Fixed column width ·
Distribute rows evenly · Distribute columns evenly · Reset column sizes ·
Delete table

Draw table, Eraser and Border painter are tools rather than commands: picking
one hands it to the pointer, and the entry shows a tick until you pick it
again or press `Escape`. The table style, style options, line style, line
weight, freeze, cell padding and vertical alignment entries tick what the
table at the caret has.

## View

**Theme >** Light / Dark / Match the system / Sepia / Nord / Solarized / High
contrast / Midnight / Custom theme... / Custom CSS... / Import theme... / Export
theme... / Save theme with document · Add a font... · **Language >** English /
Deutsch / Français / Español / Português / हिन्दी / 日本語 / 中文 / العربية ·
**Toolbar >** Minimal / Writing / Developer / Full · Present · Focus
mode `Ctrl+Shift+F` · Typewriter scrolling · Fullscreen `Ctrl+Shift+Enter` ·
Page view · Table of contents · Document outline · History · Comments · Documents ·
Side-by-side preview · Split editor `Ctrl+Alt+S` · Narrow / Normal / Wide /
Full width · Read-only mode · Suggesting mode · Reduce motion · Dyslexia-friendly
font

Every entry in this menu that switches something on shows a tick while it is
on; the theme, the language, the toolbar preset and the width each behave as
one radio group. The Language entries appear when the host passes catalogues.

## Help

Keyboard shortcuts... · Customize toolbar... · About
