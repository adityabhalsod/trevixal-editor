# Formatting tools

Word's formatting beyond bold and italic: named styles and a Styles pane,
AutoFormat and AutoCorrect as you type, drop caps, text columns, hyphenation,
widow and orphan control, paragraph borders and shading, and tab stops with
leaders. Each works the way Word's does. Each prints as it shows on screen,
and in a `.docx` each is Word's own.

## Named styles and the Styles pane

*Format > Styles pane* lists every style the document has. The paragraph
styles are Normal, Title, Subtitle, Heading 1 to 6 and any you make. The
character styles are Emphasis, Strong, Subtle emphasis and any you make.

- Click a paragraph style to give it to every paragraph the selection
  touches. Title and Subtitle are also under *Format > Paragraph styles*.
- Click a character style to put the selected text in it. Click it again to
  take the text out.
- The pencil beside a style changes it: font, size, colour, bold, italic and
  underline, and for a paragraph style its alignment, space before and after,
  and line spacing. A field left blank keeps the look the style is based on.
- *New style...* makes a style of your own, for paragraphs or for text in a
  paragraph. The bin deletes one of your own, and whatever was in it goes back
  to Normal or to plain text.

Change a style and everything in it follows at once. One undo takes the change
back. Normal's font, size, colour and line spacing are the whole document's,
so the headings and the other styles follow a change to Normal, as Word's
styles are based on Normal. Formatting set directly on text, such as a font
chosen for one word, still wins over its style.

Enter at the end of a Title or Subtitle goes on in Normal, as in Word. After
any other style, the next paragraph keeps the style.

The styles are part of the document. In a `.docx` they are Word's own, the
built-in ones under Word's own names, so Word's Styles pane lists them and a
change there restyles everything in them. RTF has no styles to point at, so
each paragraph and run carries its style's look instead.

## AutoFormat as you type

In the full editor these are on until *Tools > Smart quotes and symbols*
switches them off. The choice is remembered, like the other preferences.

| Type | Get |
| --- | --- |
| `"quoted"`, `it's` | “quoted”, it’s |
| `word - word` | word – word (an en dash) |
| `...` | … |
| `1/2`, `1/4`, `3/4` | ½, ¼, ¾ |
| `->`, `<-`, `=>` | →, ←, ⇒ |
| `(c)`, `(r)`, `(tm)` | ©, ®, ™ |

Each change is an undo step of its own, so `Ctrl+Z` straight after gives back
exactly what you typed, as in Word. Nothing changes in a code block or in text
marked as code. Typing `--` makes an em dash, as it always has.

## AutoCorrect

A word on the AutoCorrect list is put right once you finish it with a space
or punctuation: teh becomes the. The case you typed it in is kept, so Teh
becomes The and TEH becomes THE. With smart quotes on, an apostrophe in a
correction goes in curled: dont becomes don’t.

*Tools > AutoCorrect as you type* switches it off and on. *Tools >
AutoCorrect options...* edits the list, one entry a line, as `teh -> the`. An
edited list replaces the built-in one, and emptying the box brings the
built-in one back. The list is a setting of the browser, like the other
preferences, not part of the document.

## Drop caps

*Format > Drop cap > Dropped* drops the paragraph's first letter over the
lines beside it. *In margin* hangs the letter out in the margin instead, and
*None* takes it off. *Drop cap options...* sets how many lines the letter
spans, from 2 to 5; 3 by default. Enter after a paragraph with a drop cap
starts one without.

In a `.docx` and in RTF the letter is a frame of its own, as Word makes one.

## Text columns

*Format > Text columns* sets the document in one, two or three newspaper
columns: the text runs down one column and on into the next. *Line between*
draws a line between them. Columns are a setting of the whole document, and
in a `.docx` they are Word's own, half an inch apart.

## Hyphenation, widows and orphans

*Format > Hyphenation* breaks words at their syllables at the end of a line,
in the language the page declares, as Word's automatic hyphenation does.

*Format > Widow and orphan control* is on until you turn it off. In a print
or a PDF it keeps a paragraph's first line from being left alone at the foot
of a page, and its last line from being left alone at the top of the next.
Both settings go to Word.

## Borders and shading

*Format > Borders and shading...* rules every paragraph the selection touches
with a box or with lines on some of its sides: top, bottom, top and bottom,
left or right. A line can be solid, dashed, dotted or double, 1 to 6 pixels
wide, in the text's colour or one you choose. *Shading* fills the paragraph
with a colour.

Enter carries the border and the fill on to the next paragraph, as Word does.
A paragraph pasted from another editor keeps a border or a fill it had. In a
`.docx` they are Word's paragraph borders and shading.

## Tab stops

*Format > Tabs...* sets the paragraph's tab stops, one a line: where the stop
is, how the text after the tab lines up there, and what leads to it. For
example, `12 cm decimal dot` sets a stop 12 cm from the margin that lines up
decimal points, with dots leading to it:

```
Adult membership .................. £48.00
Court hire, per hour ............... £6.75
```

- **Where:** in `cm`, or `in`, `mm` or `pt`; centimetres when no unit is
  given.
- **Lining up:** `left`, `centre`, `right` or `decimal`.
- **Leader:** `dot`, `hyphen` or `underscore`, or none.

In a paragraph with stops of its own, `Tab` types a tab, and Enter carries
the stops on to the next paragraph. Elsewhere `Tab` does what it did before:
it moves to the next table cell, indents a list item or a line of code, or
moves the focus out of the editor. *Insert > Tab character* puts a tab
anywhere, a table cell included.

Past the last stop, or in a paragraph with none, stops fall every half inch,
as Word's defaults do. One of the paragraph's own stops past the end of the
line, such as a wide stop in a narrow column, is taken as the end of the
line: the text after the tab ends flush with it rather than wrapping.

In a `.docx` each stop is Word's own, at the same place.

## In print

The print shows all of these as the screen does. A document with tabs is laid
out at 170 mm, A4 less 20 mm margins, which fits Letter too, the same as a
document with line numbers, so every tab reaches its stop on paper. A web
page saved from the editor lays its tabs out when it opens, and again when
its window is resized.

## Limits

- Text columns cover the whole document. There are no section or column
  breaks, and line numbers are placed for text in a single column.
- In a `.docx` and in RTF, a drop cap's size is worked out from the body
  text's, so it can come out a little larger or smaller than on screen.
- RTF carries each style's look but not its name.
- Firefox does not keep widows and orphans together in a print.
- Hyphenation needs the browser to have a dictionary for the document's
  language.
