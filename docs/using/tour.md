# A tour of the editor

What you see in the assembled editor, top to bottom.

## Menubar

Eight menus: File, Edit, Insert, Format, Tools, Table, View and Help, holding
around two hundred entries. Every entry has an icon and, where a key is bound,
the shortcut printed beside it. Entries that switch something on show a tick
while it is on; the theme and the editor width behave as radio groups. The
menu recomputes as it opens rather than on the next keystroke, because most of
what it reports is chrome, and chrome changes without touching the document.

The full tree is on [Every menu command](./menus).

## Toolbar

Twelve groups:

| Group | Holds |
| --- | --- |
| Quick access | A "+" that searches everything you can insert (type, then `Enter`), and the tools you pinned or used last; right-click one, or press `Shift+F10`, to pin it |
| Block format | Paragraph and heading styles, line height, paragraph spacing |
| Font | Family and size |
| Text style | Bold, italic, underline, strikethrough, inline code, superscript, subscript, small caps, letter spacing, change case |
| Lists | Bullet, numbered, task, list style, multilevel list, restart numbering, indent, outdent |
| Alignment | Left, centre, right, justify |
| Colours | Text and background |
| Insert | Link, unlink, image, table grid, table design, quote, horizontal rule |
| Format painter | Copy formatting from one place to another; double-click to keep painting |
| Blocks | Callout and columns pickers |
| Code | Code block, copy, format JSON, format XML, minify |
| Tools | Find, contents, outline, palette, focus, fullscreen, word count |
| History | Clear formatting, undo, redo |

Drag a group by its grip to move it, or press `Space` on the grip and use the
arrow keys; the order is remembered. *Help > Customize toolbar...* hides and
shows groups, and applies at once.

## Popups at the caret

Type `/` at the start of a line for the slash menu; type `:` and a few letters
for emoji. Both filter as you type, move with the arrow keys, pick with
`Enter` and close with `Escape`. Details and rankings are on
[Shortcuts](./shortcuts#slash-commands).

## Command palette

`Ctrl+K` (or `Ctrl+Shift+P`, outside Firefox) opens a searchable list of every menu command,
with its icon, menu and shortcut. The list is built from the menus as actually
wired, so it can never drift out of step with them, and the shortcut beside
each is the one that fires, rebinds included. The commands you ran last come
first until you type.

## Sidebar panels

Table of contents, document outline, undo history and the documents panel.
The sidebar appears with the first panel you open and disappears with the last
one you close.

## Review bar

In suggesting mode, a bar above the editor walks through each suggestion with
accept and reject, one at a time or all at once. See [Reviewing](./review).

## Status bar

The element path on the left (`p > strong`), live word and character counts
on the right, plus the save state, upload progress, the protection status and
an offline indicator.

## Dialogs

Link, image, source code, special characters (48 of them), word count and
statistics, writing goal, custom CSS, custom theme, add a font, password,
expiry and restrictions, local backups, keyboard shortcuts, customize toolbar,
and About.

## Two more surfaces

*View > Side-by-side preview* shows the document as a downloaded page would
render it, live. *View > Split editor* opens a second editing surface on the
same document; type in either. Open both at once and the three panes share
the row, wrapping one to a line as the window narrows.

Both panes get what the editor has: syntax colours, drawn diagrams and working
tab strips. None of those three is in the document (one is a decoration, one
an element the view appends, one a click handler), so each is carried across
deliberately rather than arriving with the content. The mechanics are on the
[workspace extension](../extensions/workspace#split-view) page.
