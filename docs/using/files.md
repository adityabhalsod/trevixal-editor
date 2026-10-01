# Files

Saving, opening, importing, downloading and printing, and what a downloaded
file actually contains.

## The File menu

| Action | Where | Formats |
| --- | --- | --- |
| Save now | File > Save (`Ctrl+S`) | Writes the autosave immediately |
| Download as... | File > Download as | Web page `.html`, a web page in one file `.html` (its pictures and stylesheets packed in), Markdown `.md`, MDX `.mdx`, plain text `.txt`, Trevixal JSON `.json`, Word `.docx`, Rich text `.rtf`, OpenDocument `.odt`, EPUB `.epub`, LaTeX `.tex`, PowerPoint `.pptx`, a fillable PDF form `.pdf`, PDF (via print), encrypted document `.tvx` |
| Download selection... | File > Download selection | Any of the above, for the selected blocks only |
| Open... | File > Open (`Ctrl+O`) | `.html`, `.md`, `.mdx`, `.txt`, `.json`, `.docx`, `.odt`, the text of a `.pdf`, a Notion or Google Docs export `.zip`, `.tvx` (asks for the password) |
| Import a file... | File > Import a file | The same importers; the assembled editor replaces the document as one undo step (`importFile` can also insert at the caret with `mode: 'insert'`) |
| Import from a web address... | File > Import from a web address | A web page's article at the caret, without its menus, header, footer and sidebars |
| Save version... | File > Save version | The document as it is now, under a name |
| Download a workspace folder... | File > Download a workspace folder | Every document in a folder, and the folders inside it, in one `.zip` |
| Local backups... | File > Local backups | The named versions and the rolling snapshots: restore one, or compare |
| Front matter... | File > Front matter | The YAML a Markdown file keeps above its text |
| Page setup... | File > Page setup | The paper, which way up, the margins, a header, a footer and a watermark; see [Page setup and printing](#page-setup-and-printing) |
| Print preview... | File > Print preview | The pages as they will print, in the theme |
| Print... | File > Print (`Ctrl+P`) | The browser's print dialog, for the document alone rather than the page around it; choose "Save as PDF" for a PDF |

## Presenting

*View > Present* shows the document as slides, full screen. Each top-level
heading starts a slide: the highest heading level the document uses, so a
talk written with level-two headings works too. A level used only once is
the document's title: it opens the talk as a slide of its own, and the rest
split at the level below, so a report with one title and its sections makes
a slide a section. A note callout (*Insert > Callout > Note*) is for the
speaker: it stays off the slide and shows in the notes instead.

| Key | Does |
| --- | --- |
| `→`, `↓`, `Space`, `Page Down`, `Enter`, or a click on the slide | Next slide |
| `←`, `↑`, `Page Up`, `Backspace` | Previous slide |
| `Home`, `End` | First and last slide |
| `N` | Show or hide the speaker's notes |
| `Esc` | End the show |

*File > Download as > PowerPoint (.pptx)* writes the same slides as a deck,
with the notes as PowerPoint's speaker notes.

## Forms and mail merge

*Insert > Form field* puts a field in the text for someone to fill in: a
text box, a tick box, a drop-down list, a date or a signature. Each asks for
a name, which is what a mail merge fills it from, and a label, which it
shows until it is filled in. A drop-down also asks for its choices, one a
line.

A click on a tick box ticks or clears it. A click on any other field asks
for its value. From the keyboard, select the field with `Shift` and an arrow
key, then press `Enter` or `Space`.

*File > Download as > Fillable PDF form (.pdf)* writes the document as a PDF
whose fields are real form fields, filled with what they hold, ready to fill
in and save in any PDF reader. It keeps the words and the fields, not the
pictures, table layout or colours.

*Tools > Mail merge...* makes one document a row from a CSV file with a
header line, or a JSON array of objects. Each field, and each `{{name}}`
written in the text, is filled from the column of the same name. The
documents download together in one `.zip`, as Word, fillable PDF, web page
or Markdown files, each named after its row's first value.

## Long documents

A document of 200 top-level blocks or more is laid out only where you are:
the browser skips the blocks off screen until you scroll near them, so a
500-page manuscript stays as quick to type in as a page. Line numbers and
page view measure every line, so a long document shows in full with either
of them on. Pictures load as they near the screen. Printing loads them all.

Word, OpenDocument, RTF, LaTeX and PowerPoint downloads are written in a
background worker, so the page stays responsive while a long one is made.
Where a worker cannot start, the file is written on the page as before.

## Autosave and backups

Autosave writes to the browser's local storage a moment after you stop typing,
keeps rolling backups (in the assembled editor, one every two minutes, ten
kept), and offers to restore an unsaved draft after a crash. The editor works
offline; an indicator in the status bar says when you are.

## Named versions and comparing

*File > Save version...* keeps the document as it is now under a name, "Sent
to Sam". A named version is kept however many backups come after it.

*File > Local backups...* lists the versions and the backups. *Compare with
now* shows how one differs from the document as it is; tick two and *Compare
the two* shows how they differ from each other. The comparison puts the
earlier on the left and the later on the right: words taken out are struck,
words put in are underlined, and blocks that did not change are hidden until
you ask for them.

*Tools > Compare with a file...* compares the document with any file the
editor can open, the same way.

## Paste special

*Edit > Paste special...* pastes what is on the clipboard the way you
choose: as text in the style around the caret, as Markdown turned into
formatting, as a code block, or with its own formatting.

## Clipping a web page

*File > Import from a web address...* brings a page's article in at the
caret: its headings, text, lists, pictures and links, and a line saying where
it came from. Links and pictures keep working, because their addresses are
made whole. A browser can only read a page that allows it, so a host with a
server passes the editor its own `fetchPage`.

## What you store

The canonical form of a document is its JSON (`File > Download as > Trevixal
JSON`, or `editor.getJSON()` in code). It is schema-validated, round-trips
exactly, and can be transformed on a server without a browser. HTML, Markdown,
Word and RTF are export formats: ways out, not ways to keep things.

## What an export carries

Everything a download produces carries the theme you were editing in, the
syntax colours of your code blocks and the diagrams they drew. A downloaded
web page also works when opened straight from disk: its tabs switch, its
toggles open, and a YouTube embed, which cannot play from a local file because
the page has no origin to offer, becomes a labelled link instead.

An export is a page, not a screenshot, so anything the editor drove with
JavaScript, and anything it drew rather than stored, is carried across
deliberately:

| Concern | How |
| --- | --- |
| Theme | The resolved colour tokens are read off the live editor and written into the file as values, so the page, the `.docx` background and the RTF shading match what was on screen |
| Styles | The editor's own CSS rules are collected into the file, so a saved page does not depend on a dev server being up |
| Highlighted code and diagrams | Neither is in the document. Both are read back from the rendered view; diagrams become PNGs for Word and RTF |
| Behaviour | A small script is inlined so tab strips switch in the saved page; printing reveals every tab panel and open toggle |
| Images in RTF | Embedded as pictures rather than degrading to `[alt]` |

The developer-level account, with the functions involved, is on
[What an export carries](../reference/exports).

## Page setup and printing

*File > Page setup* sets how the document goes on paper, and it is saved with
the document:

| Setting | What it does |
| --- | --- |
| Paper | A4, US Letter, US Legal or A5 |
| Orientation | Portrait or landscape |
| Margins | Top, bottom, left and right, in millimetres |
| Header, Footer | A line of text at the top or foot of every page. `{page}` is the page number and `{pages}` the number of pages: `Page {page} of {pages}` |
| Watermark | Words set large and faint across every page, such as "Draft" |

*Insert > Section break* starts a section: what follows, up to the next
section break, is set on pages of its own. A section can be turned to
landscape, set in one to three columns, or given other margins; anything
left as "As the document" follows the page setup. Its pages start on a new
sheet.

*File > Print* and *File > Print preview* lay the document out as the pages
it prints on. Each page holds as much as fits between its margins, with the
header and footer filled in. A paragraph that runs past the foot of a page
goes on over the page at a line, a list at an item and a table at a row,
with its header row repeated. With widow and orphan control on (*Format >
Widow and orphan control*), no single line of a paragraph is left alone at
the foot or head of a page. A heading goes over with the text it heads. Text
set in columns (*Format > Text columns*) runs down each page's columns in
turn. A page break starts a new page. Heading numbers, list numbers and line
numbers go on across the pages.

*View > Page view* shows the document on its paper while you edit, with the
header, footer and watermark on each sheet. The ruled lines where the sheets
meet are a guide; the print is laid out as described above.

A browser that cannot turn one sheet of a print (it lacks CSS named pages)
prints a landscape section on the document's paper.

The Word download carries the paper, the margins, the header and footer
with Word's own page-number fields, page breaks, and each section with its
own pages; the watermark is the print's only. A document never set up goes
to Word on US Letter with 1 in margins, as before, and prints on A4 with
20 mm margins.

## PDF

The one PDF written here is the fillable form (see
[Forms and mail merge](#forms-and-mail-merge)).
Everything else goes to PDF through the print, laid out as above. *Download as > PDF* and *File >
Print* both open the browser's print dialog with the page pre-styled so backgrounds and
colours survive printing; choose "Save as PDF". The platform already produces
that output, and a bundled writer would add megabytes of font handling to
reproduce it.
