# Long documents

The tools a report, a thesis or a contract needs once it outgrows a page or
two: numbered headings, numbered captions, references that keep up with the
numbers, lists of figures, an index, notes, line numbers and right-to-left
text. Each works the way Word's does, and in a `.docx` each is Word's own
wherever Word has one: the notes are the exception, and go as text. The
[screenshot gallery](./screenshots#long-documents) shows each of them.

## Heading numbers

*Format > Heading numbering* numbers every heading at the top level of the
document, down the outline:

| Scheme | Reads |
| --- | --- |
| 1. 1.1. 1.1.1. | Legal numbering, every level carrying its parents |
| 1. a. i. | Each level its own style, and round again |
| 1) a) i) | The same, closed with a parenthesis |
| I. A. 1. | Roman, then letters, then numbers |

The schemes are the multilevel list gallery's, so a heading and a list item
at the same depth read alike. A heading skipped on the way down counts 0
(`1.0.1.`), as Word shows it. A heading inside a callout, a column or a table
is not numbered, as Word leaves a heading in a text box alone.

The numbers are a setting of the document, not text in it: they renumber as
headings are added, moved and deleted, and in a `.docx` they are Word's own
heading numbering.

## Captions

*Insert > Caption...* numbers what the caret is on: a figure below its image,
a table above it, an equation below it. Figures, tables and equations each
count on their own, in document order, and renumber as they move.

The word before the number is ordinary text, so it can be changed to "Fig."
or to another language; the number is a field and cannot be typed over. A
paragraph holding a caption number takes the Caption look, and Word's Caption
style in a `.docx`.

## Cross-references

*Insert > Cross-reference...* inserts a reference to a heading, a caption, a
footnote or an endnote, showing one of:

| Show | For a caption | For a heading |
| --- | --- | --- |
| Label and number | Figure 2 | 2.1 (its text when unnumbered) |
| Number only | 2 | 2.1 |
| Text only | A cat | Results |
| All of it | Figure 2: A cat | 2.1 Results |

A reference follows its target. Insert a figure before it and "Figure 2"
becomes "Figure 3" in the same edit, which one undo takes back. Delete the
target and the reference reads "Reference not found", as Word's does.

`Ctrl+click` (`⌘+click` on a Mac) takes the caret to the target; on a saved
page a plain click does. A heading gets an id the first time something points
at it, so the link lasts as long as the heading.

## Tables of figures and the index

*Insert > Table of figures* lists every figure, table or equation caption,
each a link to its caption, and keeps the list current.

For an index, select the words to file and choose *Insert > Mark index
entry...*: the entry is filed under the selected words, or under the main
entry given, with an optional subentry ("apple" under "fruit"). *Insert >
Index* lists every entry alphabetically, under its initial letter, with a
link to each place it is marked. Marked words show a dotted underline while
editing, and nowhere else.

On screen a location reads its section's number where the headings are
numbered, and 1, 2, 3 otherwise: the page has no page numbers until it is
printed. In a `.docx` both lists are Word fields (TOC and INDEX) holding the
editor's entries, and Word fills in the page numbers when it updates them on
opening the file.

## Footnotes and endnotes

*Insert > Footnote* and *Insert > Endnote* each put a numbered marker at the
caret and a note in a list at the end of the document. Footnotes count 1, 2,
3 and endnotes i, ii, iii, in the order they are inserted; the endnotes come
last, after the footnotes. In a `.docx` both are text at the end, not Word's
own notes.

## Line numbers

*Format > Line numbers* numbers every line of body text in the margin, for a
draft discussed line by line. The lines are the ones on screen, so a sentence
that wraps takes a number per line. Tables, notes and the generated lists are
not counted, and the numbers run on through the whole document.

Printing lays the page out at 170 mm, A4 less 20 mm margins, which fits Letter
too, with the numbers in a 12 mm gutter beside the text. Each number is
printed against its own line, so it stays with that line whichever page the
line falls on. In a `.docx` the numbers are Word's own line numbering.

## Right to left

*Format > Text direction* sets the paragraph at the caret right to left or
left to right. *Whole document right to left* turns the document round: every
paragraph without a direction of its own runs right to left, indents come
from the right, and the menus, toolbar and sidebar mirror with it. Word and
RTF exports carry both.

## The block menu

Click the grip beside a block, rather than dragging it, for the block menu:

| Entry | Does |
| --- | --- |
| Turn into | Text, Heading 1 to 3, a list, a to-do list, a quote, a code block |
| Duplicate | A copy after it, without the ids that name the original |
| Move up / Move down | One place |
| Copy link to block | Gives the block an id from its words and copies a link to it |
| Delete | The block |

From the keyboard, focus the grip and press `Shift+F10` or the menu key.
`Space` still picks the block up to move it with the arrow keys.
