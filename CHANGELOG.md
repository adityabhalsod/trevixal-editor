# Changelog

Every release is a [GitHub release](https://github.com/adityabhalsod/trevixal-editor/releases),
and its page carries the package table: what published, and what each one
costs. Per-package history lives alongside each package:

- [@trevixal/core](packages/core/CHANGELOG.md) — the engine
- [@trevixal/ui](packages/ui/CHANGELOG.md) — the chrome
- [@trevixal/editor-kit](packages/editor-kit/CHANGELOG.md) — the assembled editor
- [@trevixal/react](packages/react/CHANGELOG.md) · [vue](packages/vue/CHANGELOG.md) · [svelte](packages/svelte/CHANGELOG.md) · [angular](packages/angular/CHANGELOG.md) · [web-component](packages/web-component/CHANGELOG.md)
- The fifteen extensions, each under `packages/extension-*/CHANGELOG.md`

All packages are versioned and released together, so the version numbers below
apply to every one of them.

## Unreleased

Documentation only: no package code changes.

Every README now carries the one-minute demo video, as a thumbnail that opens
it on YouTube, because a README cannot play a video in place. The root and
package READMEs gain a badge for the launch post on dev.to. The package READMEs
also gain the GitHub stars badge the root README already had, and in all of
them it now ends the badge row. The package READMEs reach npm with the next
release.

## 1.1.0

Word's long-document, formatting, table and list tools; page layout for print
and Word; comments, forms and mail merge; and exports that draw what the
editor shows. Three packages are new. The API change is additive: no export,
node, mark or attribute was removed, and every new option and parameter is
optional. Some defaults change; they are listed under Changed below. The
[release page](https://github.com/adityabhalsod/trevixal-editor/releases/tag/1.1.0)
has what this entry leaves out: the package table, the known limits, and the
new nodes, marks, attributes and API.

### New packages

- `@trevixal/extension-comments`: comment threads on a selection, with
  replies, resolving and `@mentions` from the host's list, and an `onMention`
  hook. Threads are saved in the document and written to `.docx` as Word
  comments.
- `@trevixal/extension-forms`: fields in the text (a text box, a tick box, a
  drop-down, a date and a signature), a fillable PDF with real AcroForm
  fields, and mail merge from CSV or JSON, one document a row.
- `@trevixal/create-extension`: `npm create @trevixal/extension <name>` writes
  an extension package with a node, its commands, a menu entry and four tests.

### Added

- **Long documents.** Heading numbers in four schemes, numbered captions with
  cross-references that follow their target, tables of figures, endnotes, an
  index built from marked words, line numbers on screen and in print,
  right-to-left documents and blocks with the chrome mirrored, and a block menu
  (turn into, duplicate, move, copy a link, delete). In a `.docx` these are
  Word's own fields.
- **Formatting.** Named paragraph and character styles, AutoFormat as you type
  and AutoCorrect, drop caps, text columns, hyphenation, widow and orphan
  control, paragraph borders and shading, and tab stops with leaders.
- **Tables.** Cell selection, merging down a column, splitting a cell into rows
  and columns, draw table, eraser and border painter, AutoFit and even
  distribution, table design (a style gallery, Word's six style options and a
  border pen), tables as data (Word's formulas, column types, filtered rows,
  hidden columns, a chart made from a table), a frozen header row and first
  column, tables inside tables, captions, and header rows that repeat on every
  printed page.
- **Lists.** Numbering by level as in Word, five schemes and schemes of your
  own, tasks with a due date and an assignee, folding, an A to Z sort, and Tab
  and Shift+Tab on every selected item.
- **Page layout and presenting.** Page setup (paper, orientation, margins, a
  header and footer, a watermark), section breaks, print and print preview that
  lay out pages, page view, printing the document alone, and *View ▸ Present*,
  which shows the document as slides with the speaker's notes.
- **Files.** New writers for ODT, EPUB, LaTeX, PowerPoint, a fillable PDF form,
  MDX and a web page in one file, and new readers for ODT, the text of a PDF,
  Notion and Google Docs export zips, and MDX. Every format draws what the
  editor shows: callouts, cards, toggles, columns, galleries, code blocks,
  equations and notes. A workspace folder downloads as one zip, and the Word,
  ODT, RTF, LaTeX and PowerPoint exports run in a worker.
- **Paste.** Word and Google Docs keep their nesting, Excel and Google Sheets
  keep numbers and booleans, Notion keeps tasks, code from VS Code becomes a
  code block, formatting set in a `style` attribute is kept, and a picture
  inside a paragraph becomes a block of its own, where it was dropped.
- **Editing.** Go to, several carets, snippets, macros, paste special, and Vim
  and Emacs key bindings. Backspace on an empty list item or quote line takes
  it out first and the next one steps back, as in Word. Select all, then Delete,
  leaves one empty paragraph, and Quote takes text back out of a quote instead
  of nesting another.
- **Keyboard and toolbar.** Quick access, a command palette that opens on the
  commands run last, a slash menu with an icon and a description for every
  entry, Google Docs paragraph keys, fullscreen, a toolbar that applies a
  customisation without a reload, a searchable shortcuts dialog, and a key for
  every everyday shortcut that AltGr does not use.
- **Media, links, code and equations.** Image galleries with a lightbox, camera
  photos, screen capture, markup on a picture, a whiteboard, audio recording,
  video chapters, embeds recognised from the address alone, links to any block,
  a link check, wiki links with backlinks, code blocks with line numbers,
  highlighted lines, a title and collapsing, terminal and diff blocks,
  JavaScript run in a sandbox, Graphviz and PlantUML beside Mermaid, an
  equation palette with numbered equations and chemistry through `\ce{}`, and
  YAML front matter.
- **Review, versions and protection.** Accept or reject by one reviewer, named
  versions compared word by word, clipping a web page's article, including one
  workspace document in another, margin notes, maps, polls, blocks shown for a
  template variable, redaction, locked sections, a lock screen with a passkey,
  digital signatures and an audit log.
- **Appearance, language and writing.** The chrome in German, French, Spanish,
  Portuguese, Hindi, Japanese, Chinese and Arabic, loaded on demand from
  `@trevixal/ui/locales/<code>`; toolbar presets, document fonts and a document
  theme; reduced motion and a dyslexia-friendly reading setting; every emoji up
  to Unicode 15.1 (1,898 of them), with flags on Windows; writing checks
  (inclusive language, tone, clichés, a reading heat map, synonyms,
  accessibility and duplicate text); citation styles with BibTeX and CSL-JSON
  import; and a pluggable writing assistant (`WritingProvider`).
- **Speech, phones and offline.** Read aloud sentence by sentence with each
  word picked out, dictation with spoken punctuation, a toolbar at the bottom
  of the screen on a phone, a full-editor example that installs as an offline
  app, and long documents that skip drawing what is out of view.

### Changed

- Nested numbered lists read `1. a. i.` in the editor and in `.docx` and
  `.rtf`; they were `1.` at every level. A list with its own style keeps it.
- Print lays out pages. A document never set up prints on A4 with 20 mm
  margins, where the browser used to choose; it still goes to `.docx` on US
  Letter. Every table's header row repeats on each printed page.
- Pasted and imported HTML keeps more: inline-style formatting, pictures inside
  paragraphs, merged cells, and Word's vertical merges.
- Clear all formatting (`Ctrl+\`) also makes plain paragraphs, as Word does:
  lists, quotes and headings become paragraphs. Tables, callouts, columns,
  cards and code stay.
- Keys. `Mod+Shift+E` centres the paragraph, and the emoji picker moves to
  `Mod+Shift+Space`; saved rebinds are kept. New in the kit: `Mod+G` Go to,
  which replaces the browser's Find next inside the editor, `Mod+D` for a caret
  at the next match, `Mod+Alt+M` to insert a comment, `F8` to play a macro, and
  `Alt`+click for another caret. In Firefox the command palette opens on
  `Ctrl+K` only, because Firefox keeps `Ctrl+Shift+P` for a private window.
  `Tab` in a paragraph with its own tab stops types a tab.
- The kit turns on, by default, AutoFormat as you type, the inclusive-language
  check (which can underline existing text), synonyms on a right-click
  (`thesaurus: null` turns them off), and a ten-minute lock for a
  password-protected document (`autoLockMinutes: 0` turns it off).
- Bundle sizes. `@trevixal/extension-emoji` ships every emoji, so it grows from
  1.9 kB to 18.1 kB gzipped. The assembled kit roughly doubled, from 180.8 kB
  to 384.0 kB gzipped with every extension, and so did its CDN build; a host
  that needs less can mount the packages it uses instead. The language
  catalogues are split out and not counted.
- Fullscreen makes the whole page fullscreen, and the editor covers the window
  with `.trevixal-fullscreen`; a `:fullscreen` rule on the editor element no
  longer applies.
- In `defaultMenus()`, Print… has no `run` of its own: `createEditorUI` wires
  it, and a bare `createMenubar` shows it disabled until the host wires
  `print`. Recent-tools buttons carry `data-trevixal-recent` instead of
  `data-trevixal-item`.
- An uploaded SVG is sanitized, and a base64 `data:audio/` source is allowed.
  Menus grow to `min(75vh, 44rem)`; they were capped at 320px.
- The kit's tour, the document it opens with when there is no content, shows
  the new features, and a new workspace's first document is named after its
  first heading.

### Outside requests

A document that uses none of these features fetches nothing new. PlantUML
sends a diagram's source, encoded in an image URL, to
`https://www.plantuml.com/plantuml`; a host with private documents should set
`plantumlServer` to its own server or to `null`. Maps load tiles from
`tile.openstreetmap.org` (`mapTiles` and `mapAttribution` change that, and
OpenStreetMap's tile policy does not allow heavy use). Graphviz and PDF import
load viz.js and PDF.js from jsDelivr, as Mermaid already is, and Windows loads a
font of flags from jsDelivr only where the system draws none. *Check links…*
sends a no-cors `HEAD` request to each linked address (`checkLinkURL`, or
`null` to keep it offline), and *Import from a web address…* fetches the page
where the site allows it (`fetchPage`). Link titles call the host's
`fetchLinkTitle` and are off by default, and dictation uses the browser's own
speech recognition; Chrome sends the sound to its speech service.

### Fixed

- Print dropped table rows after a page break.
- A diagram's redraw could throw away a click in Safari, and typing then went
  to where the caret had been.
- An inserted equation lost its selection when focus came back, so the next
  insert landed before it.
- A caret inside an inline atom mapped to nothing, and Firefox typed at the old
  caret.
- Page breaks in `.docx` were not written, and came back as line breaks.
- Dialog fields with `visibleWhen` never hid.
- Clicks on the review bar, history panel and tabs took the caret away in
  Chrome, so typing went nowhere.
- A toggle's title spread each bold word or link across the line.
- Running JavaScript reported a failure as `Unhandled rejection: {}`.
- Google Docs pastes had lost all their bold.

### For developers

New options on the kit's `mountFullEditor`: `languages`, `users`, `onMention`,
`writingProvider`, `thesaurus`, `fetchLinkTitle`, `checkLinkURL`, `fetchPage`,
`plantumlServer`, `mapTiles`, `mapAttribution` and `autoLockMinutes`. Document
settings are the `doc` node's attributes, so they travel with the file and undo
like any edit. A document with none is written exactly as before, and one with
any is wrapped in `<div data-trevixal-document …>`. Every other new attribute
defaults to what the node was before and writes nothing at its default, so
existing HTML round-trips unchanged. The 19 new nodes, 4 marks and the
attributes on 14 existing nodes are listed on the release page.

## 1.0.5

A blockquote at the end of a document no longer traps the caret: Enter only
ever made another paragraph inside it. Enter on a blank last line now leaves a
blockquote, callout, card, column, list item or the bottom-right table cell,
and `Ctrl`/`Cmd` + Enter leaves anything, from any depth. Code blocks already
answered to a second Enter or `Mod-Enter`; nothing else did.

New in core: `escapeWrapperOnEnter`, which asks the schema rather than naming
node types, so it escapes a blockquote and declines in a table cell or a
timeline item, where lifting would make the document invalid, and
`exitEnclosingBlock`, behind `Mod-Enter` from any depth. New in
`@trevixal/extension-table`: `escapeTableOnEnter`. `mergeKeymaps` chains the
bindings of a key that more than one keymap binds: spreading the keymaps had
kept only the last, which would have silently disabled the table escape in the
assembled editor.

## 1.0.4

The first release published from a GitHub release: creating the release is the
whole process, the 23 packages publish in parallel, and each authenticates with
its own OIDC identity, so there are no tokens. CI runs on every branch and now
includes lint and coverage.

Adds a [Trevixal vs Tiptap](https://trevixal-editor.vercel.app/reference/vs-tiptap)
comparison, with both sides installed and measured rather than quoted. No
functional change to any package: this release is documentation and the
release machinery.

## 1.0.3

Documentation only: every package README gains badges, a screenshot, a
features list and a measured size, and its links are absolute, because a
relative link is a 404 on npm.

## 1.0.2

Ships minified ESM and CJS builds. Identifiers and syntax are minified;
whitespace is kept, because that pass strips the magic comments a dynamic
import relies on and the resulting bundle breaks Next.js builds. The engine
drops 27% on disk and 14% gzipped.

Adds `keywords` to every package, so npm search can find them by what they do
("rich text editor", "docx", "track changes", "mermaid") rather than only by
name.

## 1.0.1

Stops publishing source maps. The maps carried no `sourcesContent`, so they
named their sources as `../src/*.ts` and `src/` is not published: a consumer
downloaded 2.7 MB of maps that no debugger could resolve. They are still built
for local debugging.

## 1.0.0

First public release: the framework-agnostic core, the chrome and design
tokens in `@trevixal/ui`, the assembled `@trevixal/editor-kit`, bindings for
React, Vue, Svelte, Angular and a web component, and fifteen extensions.
