# Lists and tables

List and table tools beyond making a list or inserting a table: a task's due
date and assignee, a count of what is done, folding an item, sorting a list,
multilevel lists of your own, a table's header row and first column held in
view, cell padding and vertical alignment, tables inside tables, captions
from the Table menu, and header rows that repeat on every printed page. The
[screenshot gallery](./screenshots#lists-and-tables) shows each of them.

## Tasks: due dates, assignees and a done count

With the caret in a task, *Format > Lists > Task due date and assignee...*
gives it an assignee, a due date or both. They show as a chip at the end of
the task's first line, such as `@Priya · 2026-10-01`. A task past its date and
not yet done shows its chip in red, until it is ticked off. Leave a box empty
to clear it. Enter at the end of a task starts a new one without either.

Under a task list of two or more, a line counts what is done: `2 of 5 done`.
A task list nested in a task counts its own tasks.

The chip and the count print, and a saved page shows them. In a `.docx` and
in RTF, the assignee and date follow the task's text, smaller and in grey.

## Folding an item

An item with anything under it, a nested list or a second paragraph, can be
folded so that only its first line shows. With the pointer over the item, a
chevron appears to the left of its marker. Click it to fold the item. A
folded item keeps the chevron, pointing at its text in the accent colour.
Click it again to unfold. *Format > Lists > Fold or unfold item* does the
same for the item at the caret.

A fold is saved with the document, but it is not an edit: undo skips over
it, as it does a toggle block's. When the caret lands inside a folded item,
from *Find* for example, the item unfolds so you can see where you are. Enter
at the end of a folded item starts the new item after everything folded
under it. Printing and a saved page show every item, folded or not.

## Sorting a list

*Format > Lists > Sort A to Z* and *Sort Z to A* sort the list the caret is
in by each item's text. Numbers sort in order, so `2` comes before `10`.
Upper and lower case count as the same letter, and so do accented and plain
letters. Items with no text go last. Each item takes the items nested under
it along. One undo puts the list back.

## Multilevel lists of your own

*Format > Lists > Define new multilevel list...* opens a dialog like Word's
of the same name, and so does the button at the foot of the multilevel list
gallery on the toolbar. It starts from the list at the caret and lists all
nine levels.
For each level you set:

- **Number**: 1, 2, 3; 01, 02, 03; a, b, c; A, B, C; i, ii, iii; I, II, III;
  a bullet; or no number.
- **Marker**: the text around the number, in Word's notation. `%1` to `%9`
  stand for the numbers of levels 1 to 9, so `Step %1:` makes `Step 1:`, and
  `%1.%2)` on level 2 makes `1.a)`. A bullet level's marker is its symbol.
- **Start at**: the number the level's first item takes.
- **Indent**: how far the level's text sits in from the level above's, in em.

The preview below the levels draws the first four as the list will. *Define*
numbers the list at the caret with the scheme. The scheme also joins the
gallery, under the built-in ones, for the other lists in the document.
Opening the dialog in a list numbered with one of your own schemes modifies
it, and every list numbered with it follows.

Your schemes are part of the document. In a `.docx` each one is Word's own
multilevel list, which Word's Define New Multilevel List dialog opens. In RTF
each item carries its marker as text.

## A table's header row and first column, held in view

*Table > Freeze header row* keeps the header row at the top of the window
while a long table scrolls under it. A table without a header row gets one:
its first row becomes the header row. *Table > Freeze first column* keeps the
first column in view while a table wider than the page scrolls sideways. Both
are for the screen. Choose either again to turn it off.

## Header rows on every printed page

When a table runs over a page break, its header row heads each page it runs
onto, in a print and in a PDF saved from one. There is nothing to turn on.
In a `.docx` it is Word's *Repeat as header row at the top of each page*,
and in RTF its header row.

## Cell padding and vertical alignment

*Table > Cell padding* sets the room inside every cell of the table: None,
Narrow, Normal (the default) or Wide. *Table > Cell alignment* sits the
content of the selected cells at the top, middle or bottom of their row,
beside Left, Center and Right. In a `.docx` these are Word's cell margins and
cell alignment, and in RTF its cell padding and vertical alignment.

## Tables inside tables

With the caret in a cell, *Table > Insert table* puts a new table inside the
cell, after the paragraph there. The inner table has a look of its own: the
outer table's style, borders and padding do not reach it. `Tab` moves from
cell to cell of the table the caret is in, and every Table menu command acts
on that table. A `.docx` keeps the table inside its cell, and so does RTF,
as its nested table. Markdown has no way to write a table inside a table, so
the inner table's text goes into its cell.

## Captions

*Table > Insert caption...* is *Insert > Caption...* with **Table** chosen,
from the menu the table is already on. It puts `Table 1` above the table, as
Word does, numbered with the other tables. The [captions
section](./structure#captions) covers numbering and cross-references.
