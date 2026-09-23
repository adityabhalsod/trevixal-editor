# Files

Saving, opening, importing, downloading and printing, and what a downloaded
file actually contains.

## The File menu

| Action | Where | Formats |
| --- | --- | --- |
| Save now | File > Save (`Ctrl+S`) | Writes the autosave immediately |
| Download as... | File > Download as | Web page `.html`, Markdown `.md`, plain text `.txt`, Trevixal JSON `.json`, Word `.docx`, Rich text `.rtf`, PDF (via print), encrypted document `.tvx` |
| Download selection... | File > Download selection | Any of the above, for the selected blocks only |
| Open... | File > Open (`Ctrl+O`) | `.html`, `.md`, `.txt`, `.json`, `.docx`, `.tvx` (asks for the password) |
| Import a file... | File > Import a file | The same importers; the assembled editor replaces the document as one undo step (`importFile` can also insert at the caret with `mode: 'insert'`) |
| Local backups... | File > Local backups | Rolling snapshots to restore from |
| Print preview... | File > Print preview | The page as it will print, in its theme |
| Print... | File > Print (`Ctrl+P`) | The browser's print dialog, for the document alone rather than the page around it; choose "Save as PDF" for a PDF |

## Autosave and backups

Autosave writes to the browser's local storage a moment after you stop typing,
keeps rolling backups (in the assembled editor, one every two minutes, ten
kept), and offers to restore an unsaved draft after a crash. The editor works
offline; an indicator in the status bar says when you are.

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

## PDF

There is no bundled PDF writer. *Download as > PDF* and *File > Print* both
open the browser's print dialog with the page pre-styled so backgrounds and
colours survive printing; choose "Save as PDF". The platform already produces
that output, and a bundled writer would add megabytes of font handling to
reproduce it.
