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
| `Tab` / `Shift+Tab` | In a code block: indent / outdent two spaces. In a list: nest / un-nest. Otherwise the browser moves focus |
| `Mod+Enter` | Leave a code block from anywhere inside it |
| `Mod+Shift+V` | Paste without formatting |
| `Enter`, `Backspace`, `Delete` | Handled through `beforeinput`: split, join, delete. A second `Enter` on an empty line leaves a code block; inside code, `Enter` keeps indentation and opens a bracket pair onto its own lines |

## The assembled editor's shortcut manager

| Key | Action | | Key | Action |
| --- | --- | --- | --- | --- |
| `Mod+\` | Clear all formatting | | `Mod+X` / `Mod+C` / `Mod+V` | Cut / copy / paste (native) |
| `Mod+A` | Select all | | `Mod+F` | Find and replace |
| `Mod+K`, `Mod+Shift+P` | Command palette | | `Mod+Shift+K` | Insert link |
| `Mod+Shift+E` | Emoji picker | | `Shift+Enter` | Line break |
| `Mod+Alt+N` | New document | | `Mod+S` | Save now |
| `Mod+O` | Open a file | | `Mod+P` | Print |
| `Mod+Alt+P` | Protect with password | | `Mod+Shift+F` | Focus mode |
| `Mod+Shift+Enter` | Fullscreen | | `Mod+Alt+S` | Split editor |
| `Mod+.` | Writing suggestions for the word under the caret | | | |

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
with keywords such as `h1`, `ul` and `hr`. The assembled editor adds Table,
Image, Diagram, Equation, Callout, Columns and Toggle.

Type to filter. Prefix matches rank first, then word boundaries, then any
subsequence: typing `co` puts "Code block" above "Bullet list", although both
contain the letters.

## Emoji

Type `:` and at least one letter. 114 built-in emoji with names and keywords
(`:smi` finds smile). An exact name outranks a prefix, which outranks a
substring, which outranks a keyword hit, so `heart` returns the red heart
before the heart-eyes face. *Insert > Emoji...* opens the same set as a
picker dialog (`Mod+Shift+E` in the assembled editor).

Both triggers are detected against the document model, never by inspecting
the DOM, so a syntax colour or a node view cannot confuse them. `/` fires only
at the start of a block; `:` fires after whitespace anywhere, never mid-word,
so a URL, a time or `a:b` in code does not open a picker.
