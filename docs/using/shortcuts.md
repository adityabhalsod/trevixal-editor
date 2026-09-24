# Keyboard and typing shortcuts

`Mod` is `Cmd` on macOS and `Ctrl` elsewhere. In the assembled editor every
key is owned by the shortcut manager, listed under *Help > Keyboard
shortcuts...*, and rebindable there.

## Always on

These come from the engine's base keymap and work in any editor built on
`@trevixal/core`.

| Key | Action |
| --- | --- |
| `Mod+B` / `Mod+I` / `Mod+U` / `Mod+E` | Bold / italic / underline / inline code |
| `Mod+Z`, `Mod+Shift+Z`, `Mod+Y` | Undo, redo, redo |
| `Tab` / `Shift+Tab` | In a code block: indent / outdent two spaces. In a list: nest / un-nest. In a paragraph with [tab stops](./formatting#tab-stops) of its own, `Tab` types a tab. Otherwise the browser moves focus |
| `Mod+Enter` | Leave a code block from anywhere inside it |
| `Mod+Shift+V` | Paste without formatting |
| `Enter`, `Backspace`, `Delete` | Handled through `beforeinput`: split, join, delete. A second `Enter` on an empty line leaves a code block; inside code, `Enter` keeps indentation and opens a bracket pair onto its own lines |

## The assembled editor's shortcut manager

| Key | Action | | Key | Action |
| --- | --- | --- | --- | --- |
| `Mod+\` | Clear all formatting | | `Mod+X` / `Mod+C` / `Mod+V` | Cut / copy / paste (native) |
| `Mod+Shift+X` | Strikethrough | | `Mod+Shift+0`, `Mod+Alt+0` | Normal text |
| `Mod+Shift+1` to `6`, `Mod+Alt+1` to `6` | Heading 1 to 6 | | `Mod+Shift+7` / `8` / `9` | Numbered / bullet / task list |
| `Mod+Shift+L` / `E` / `R` / `J` | Align left / center / right / justify | | `Mod+]` / `Mod+[` | Increase / decrease indent |
| `Mod+A` | Select all | | `Mod+F` | Find and replace |
| `Mod+K`, `Mod+Shift+P` (not in Firefox) | Command palette | | `Mod+Shift+K` | Insert link |
| `Mod+Shift+Space` | Emoji picker | | `Shift+Enter` | Line break |
| `Mod+Alt+N` | New document | | `Mod+S` | Save now |
| `Mod+O` | Open a file | | `Mod+P` | Print |
| `Mod+Alt+P` | Protect with password | | `Mod+Shift+F` | Focus mode |
| `Mod+Shift+Enter` | Fullscreen | | `Mod+Alt+S` | Split editor |
| `Mod+.` | Writing suggestions for the word under the caret | | | |

On a Mac the paragraph styles are `⌘⌥0` to `6` alone: `⌘⇧3`, `4` and `5` are
the Mac's screenshot keys.

The paragraph keys follow Google Docs rather than Word, whose keys were made
for a desktop app and collide in a browser (`Ctrl+E` is inline code here,
`Ctrl+L` the address bar). Docs' own `Ctrl+Alt+0` to `6` still work, second.
They come second because on Windows `Ctrl+Alt` is AltGr on most keyboards but
the US one: `Ctrl+Alt+E` types é on a UK keyboard and € on a German one, and
`Ctrl+Alt+2` types ² or @. The browser reports that character, and the editor
lets it type rather than take it from you, so a `Ctrl+Alt` key works only
where the keyboard leaves it free. Every everyday key therefore has a first
binding without `Ctrl+Alt`, and the emoji picker is on `Mod+Shift+Space`.
New document, Protect and Split editor stay on `Ctrl+Alt+N`, `P` and `S`,
which AltGr takes only on US-International and a few others; rebind them in
the dialog if yours is one. A Mac keeps `⌘⌥`, since ⌥ never types in a chord
with ⌘.

A key is matched by the key pressed, so `Mod+Shift+7` works on a layout where
Shift turns 7 into `/`. Firefox keeps `Ctrl+Shift+P` for a private window and
never lets a page see it, so there the palette opens on `Ctrl+K` alone.

*Change* in the dialog wants Ctrl, Alt or ⌘ (or a function key) with the key:
a letter on its own would fire instead of typing. It records what your
keyboard sends: where `Ctrl+Alt+E` types é, it records `Ctrl+Alt+É`, and
that then works. Keys do nothing while the dialog is open, so close it to try
a new one. The search box narrows the list by name or by keys.

## In context

| Where | Key | Action |
| --- | --- | --- |
| Table | `Tab` / `Shift+Tab` | Next / previous cell; `Tab` on the last cell adds a row |
| Callout, card, column, toggle, tab, accordion | `Enter` on an empty trailing paragraph | Leave the container |
| Toggle summary, tab title, accordion title | `Enter` | Move into the body |
| Slash or emoji popup | Arrow keys, `Enter` or `Tab`, `Escape` | Move, pick, close |
| Toolbar grip | `Space`, arrow keys, `Enter`, `Escape` | Pick a group up, move it, drop it, put it back (announced to screen readers) |
| Menubar and toolbar | Arrow keys, `Escape` | WAI-ARIA menubar and toolbar patterns, roving tabindex |

## Typing shortcuts

Input rules fire the moment the last character is typed, and never inside a
code block or inline code.

| Type | Get |
| --- | --- |
| `# ` to `###### ` at the start of a line | Heading 1 to 6 |
| `- `, `* ` or `+ ` | Bullet list |
| `1. ` (any number) | Numbered list starting there |
| `> ` | Quote |
| ```` ``` ```` | Code block |
| `--` | An em dash |
| `` `code` `` | Inline code |
| `https://...` or `www....` followed by a space | A link, with trailing punctuation left out |
| `$x^2$` (with the math extension) | An inline equation |

Each rule can be turned off in code (`defaultInputRules({ autolink: false,
emDash: false, inlineCode: false })`), and a rule's effect is a normal edit,
so `Mod+Z` undoes it as one step.

## Slash commands

Type `/` at the start of a line. Nine items ship with the extension (Text,
Heading 1 to 3, Bullet list, Numbered list, Code block, Quote, Divider), each
with keywords such as `h1`, `ul` and `hr`. The assembled editor adds To-do
list, Table, Image, Video, Diagram, Equation, Callout, Columns, Tabs, Toggle
and Page break, and shows every entry with an icon and a line saying what it
makes. The highlight stays in view however far down the list it goes.

Type to filter. Prefix matches rank first, then word boundaries, then any
subsequence: typing `co` puts "Code block" above "Bullet list", although both
contain the letters.

## Emoji

Type `:` and at least one letter. 114 built-in emoji with names and keywords
(`:smi` finds smile). An exact name outranks a prefix, which outranks a
substring, which outranks a keyword hit, so `heart` returns the red heart
before the heart-eyes face. *Insert > Emoji...* opens the same set as a
picker dialog (`Mod+Shift+Space` in the assembled editor).

Both triggers are detected against the document model, never by inspecting
the DOM, so a syntax colour or a node view cannot confuse them. `/` fires only
at the start of a block; `:` fires after whitespace anywhere, never mid-word,
so a URL, a time or `a:b` in code does not open a picker.
