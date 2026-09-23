# Trevixal Editor

[![CI](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@trevixal/core.svg)](https://www.npmjs.com/package/@trevixal/core)
[![types](https://img.shields.io/npm/types/@trevixal/core.svg)](https://www.npmjs.com/package/@trevixal/core)
[![license](https://img.shields.io/npm/l/@trevixal/core.svg)](LICENSE)
[![stars](https://img.shields.io/github/stars/adityabhalsod/trevixal-editor?style=social)](https://github.com/adityabhalsod/trevixal-editor/stargazers)

[Documentation](https://trevixal-editor.vercel.app) · [Live editor](https://trevixal-editor.vercel.app/full-editor) · [Changelog](CHANGELOG.md) · [Issues](https://github.com/adityabhalsod/trevixal-editor/issues)

**A WYSIWYG rich-text editor engine, written from scratch.** No ProseMirror,
Lexical, Slate, Quill or Draft.js code anywhere in it, and no runtime
dependencies in any package it ships.

Trevixal is not a finished application. It is the building block you put inside
your own (a CMS, a support desk, a notes tool, an internal wiki) so that the
people using it get the writing surface they expect from Google Docs or Notion,
while your app keeps hold of the document, the storage and the chrome around
it.

```ts
import { Schema, createEditor, defaultNodes, defaultMarks } from '@trevixal/core'
import '@trevixal/ui/styles.css'

const editor = createEditor({
  schema: new Schema({ nodes: defaultNodes(), marks: defaultMarks() }),
  element: document.querySelector('#editor'),
  placeholder: 'Write something…',
})

editor.commands.toggleMark('bold')
const doc = editor.getJSON() // the document, as data you can store and validate
```

| | |
| --- | --- |
| **Packages** | 23 under `@trevixal/*`. A headless core, an optional chrome, an assembled editor, five adapters, fifteen extensions |
| **Tests** | **2,210 unit** across 130 files · browser suites across 18 specs |
| **Engines** | Chromium, Firefox and WebKit, all three driven by the browser suite |
| **Size** | **27.3 kB** gzipped for the engine; 180.4 kB for the whole assembled editor |
| **Dependencies** | None at runtime, in any published package |
| **Source** | ~60,800 lines of TypeScript and SCSS |
| **Licence** | Apache-2.0 |

**Where to start**

| If you want to… | Read |
| --- | --- |
| compare it with Tiptap | [Trevixal vs Tiptap](#trevixal-vs-tiptap) |
| decide whether it fits | [Why Trevixal](#why-trevixal) · [Everything it can do](#everything-it-can-do) · [What it deliberately does not do](#what-trevixal-deliberately-does-not-do) |
| get an editor on screen | [Requirements and installation](#requirements-and-installation) · [Quick start](#quick-start) |
| the whole editor, in one call | [The whole editor in one call](#the-whole-editor-in-one-call) |
| wire it into React, Next.js, Vue, Nuxt, Svelte, SvelteKit, Angular or Solid | [Quick start](#quick-start) · [`examples/`](examples) |
| build a toolbar and menus | [Assembling the editing chrome](#assembling-the-editing-chrome) |
| add tables, images, diagrams, export… | [Using the extensions](#using-the-extensions) |
| call the engine directly | [Core API reference](#core-api-reference) |
| understand how it works inside | [Architecture](#architecture) |
| work on Trevixal itself | [Development guide](#development-guide) · [Testing](#testing) |
| look something up | [Every menu command](#every-menu-command) · [Keyboard shortcuts](#keyboard-shortcuts) · [Glossary](#glossary) · [FAQ](#faq) |

---

## Table of contents

One document, read top to bottom or dipped into. The groups below are
signposts in this list only. The page itself runs straight through.

**Orientation**
[Why Trevixal](#why-trevixal) ·
[Trevixal vs Tiptap](#trevixal-vs-tiptap) ·
[Everything it can do](#everything-it-can-do) ·
[What Trevixal deliberately does not do](#what-trevixal-deliberately-does-not-do)

**Getting it running**
[Requirements and installation](#requirements-and-installation) ·
[Packages](#packages) ·
[Quick start](#quick-start)

**Living with the editor**
[A tour of the editor](#a-tour-of-the-editor) ·
[Saving, opening, exporting and printing](#saving-opening-exporting-and-printing) ·
[Appearance](#appearance) ·
[Protecting a document](#protecting-a-document) ·
[Reviewing with tracked changes](#reviewing-with-tracked-changes) ·
[Writing help and readability](#writing-help-and-readability) ·
[Working with several documents](#working-with-several-documents)

**Building with it**
[Assembling the editing chrome](#assembling-the-editing-chrome) ·
[Using the extensions](#using-the-extensions) ·
[Core API reference](#core-api-reference) ·
[UI kit reference](#ui-kit-reference) ·
[Styling and theming](#styling-and-theming) ·
[What an export carries](#what-an-export-carries)

**How it works**
[Architecture](#architecture) ·
[Repository layout](#repository-layout) ·
[Design decisions](#design-decisions)

**Working on Trevixal**
[Development guide](#development-guide) ·
[Testing](#testing) ·
[Quality, packaging and release](#quality-packaging-and-release) ·
[Status, backlog and scope](#status-backlog-and-scope)

**Look-up tables**
[Every menu command](#every-menu-command) ·
[Keyboard shortcuts](#keyboard-shortcuts) ·
[Typing shortcuts](#typing-shortcuts) ·
[Slash command and emoji reference](#slash-command-and-emoji-reference) ·
[Development commands](#development-commands) ·
[Documentation map](#documentation-map) ·
[Glossary](#glossary) ·
[FAQ](#faq) ·
[License](#license)

---

## Why Trevixal

Trevixal is the engine behind a text box that behaves like a modern document
editor, the editing surface you know from Google Docs, Notion or Confluence.
You see your formatting as you type (**bold**, headings, lists, tables)
instead of writing code or markup.

It is not a finished application. It is the **building block that developers
put inside their own apps** (a CMS, a support desk, a note-taking tool, an
internal wiki) so that their users get a first-class writing experience.
The [demo](examples/full-editor) shows every piece wired together into one
page, and it is what the browser test suite drives.

### What makes it different

- **Built from the ground up.** Most editors on the market wrap one of a few
  existing engines. Trevixal implements everything itself (the document
  model, the undo system, the sanitizer, the DOM renderer, the ZIP and XML
  writers behind Word export, the LaTeX-to-MathML converter) which means no
  licence entanglements, no inherited bugs, and full control over behaviour.
- **The document is data, not HTML.** Every document is a clean, structured
  JSON object that can be saved to a database, validated, transformed and
  rendered anywhere. The on-screen editor is one view of it; a `.docx`, an
  `.rtf`, a web page or a PDF are others.
- **Safe by construction.** Content pasted from the web is parsed inside an
  inert template through an allowlist, and tested against a corpus of real
  attack payloads, so malicious HTML cannot smuggle scripts into your app.
- **Exports look like the editor did.** A downloaded page, PDF, Word or RTF
  file carries the theme it was written in, the syntax colours of its code
  and the diagrams it drew, measured by rendering the real files, not by
  reading the markup.
- **Review workflow included.** Tracked changes with accept and reject, like
  Word's suggesting mode, so edits arrive as reviewable, attributed
  suggestions.
- **Single-user by design.** Real-time co-editing, comments and sharing were
  built, measured and then removed; see
  [What Trevixal deliberately does not do](#what-trevixal-deliberately-does-not-do).

## Trevixal vs Tiptap

[Tiptap](https://tiptap.dev) is the editor most people compare this one to, and
the comparison is fair: both are headless, both are extension-driven, both have
adapters for every major framework. This section is meant to help you choose
Tiptap when Tiptap is the right answer.

The one real difference is that Tiptap is a layer over
[ProseMirror](https://prosemirror.net), and Trevixal is not a layer over
anything. Everything below follows from that.

Measured on 19 September 2026: `@trevixal/core` against `@tiptap/core` +
`@tiptap/starter-kit` + `@tiptap/pm`, the smallest install on each side that
gives an editor with a default schema. Bundles gzipped with the same esbuild
settings.

| | Trevixal | Tiptap |
| --- | --- | --- |
| Engine + default schema | **27.3 kB** gz | 117.2 kB gz |
| npm packages installed | **1** | 42 |
| ProseMirror packages | **0** | 13 |
| `node_modules` on disk | **592 kB** | 12 MB |
| Runtime dependencies | **none** | ProseMirror |
| Track changes | In the box | Paid extension |
| DOCX / RTF export | In the box | Paid extension or your own |
| Prebuilt UI | Included, optional | None, by design |
| Collaborative editing | **No** | Yes, first-class |
| Production maturity | **New** (1.0.0, September 2026) | Years |

**Use Tiptap if** you need collaborative editing, you are shipping on a
deadline and want years of production hardening, you want an ecosystem of
community extensions and Stack Overflow answers, or you want commercial
support. All four are real advantages and none of them are close.

**Use Trevixal if** you want to read the whole stack in one repository, your
supply chain makes dependency count a constraint, you want Word export and
track changes without a paid tier, or you need an editor that runs from one
`<script>` tag.

The [full comparison](https://trevixal-editor.vercel.app/reference/vs-tiptap)
goes feature by feature, and tells you how to reproduce every number above.

## Everything it can do

Every line below is implemented **and** reachable from the editor's own
chrome, a menu entry, a toolbar control or a key binding, and was audited
against the code. The two exceptions are marked. The same list, kept as a
checklist, is kept by the maintainers.

**Document structure**: headings 1-6 · blockquote · horizontal rule · page
break · collapsible sections (toggle blocks) · table of contents · document
outline panel · anchor links and bookmarks · find and replace with regular
expressions.

**Formatting**: bold, italic, underline, strikethrough · superscript and
subscript · inline code · text highlight · text and background colour · font
family and size · letter spacing · line height · paragraph spacing (before and
after, separately) · indentation · alignment (left, centre, right, justify) ·
small caps · case conversion (`UPPERCASE`, `lowercase`, `Title Case`) · clear
text formatting, clear all formatting · format painter.

**Lists and tasks**: bulleted, numbered and task (checkbox) lists · nesting,
numbered by level as Word does (`1.` then `a.` then `i.`) · a multilevel list
gallery (`1) a) i)`, `1. 1.1. 1.1.1.`, `I. A. 1.`, `❖ ➢ ▪`) that numbers the
whole tree, levels indented later included, in the editor and in Word and RTF
exports · eight list styles (disc, circle, square, `1, 2, 3`, `a, b, c`,
`A, B, C`, `i, ii, iii`, `I, II, III`) · restart and continue numbering.

**Tables**: insert with a hover-to-size grid · add and delete rows and
columns · merge and split cells · header row · per-cell alignment · cell
background · border styles (all, outside, rows only, none) and border colour ·
sort by column, ascending or descending · resize columns and rows by dragging ·
distribute columns evenly · convert text to a table and back · import CSV ·
copy as CSV · `Tab` and `Shift+Tab` between cells.

**Media**: drag-and-drop, paste or pick images · upload to **your** storage
with progress and cancellation · resize by dragging · crop and rotate ·
client-side compression before upload · captions · alignment and text wrap ·
video and audio · YouTube and Vimeo embeds from a pasted URL · allowlisted
iframe embeds · file attachments with progress · link preview cards.

**Links**: auto-detected URLs as you type · open in a new tab
(`rel="noopener noreferrer"`) · internal document links (anchors) · email
links · quick edit and remove.

**Developer-friendly content**: inline code · code blocks with a language
selector and automatic language detection · syntax highlighting for twelve
bundled languages (or any engine you bring) · a copy-code button · Markdown
source view and *edit as Markdown* · HTML source view and *edit as HTML* ·
JSON and XML pretty-printing and minifying in place · Mermaid diagrams
previewed live under the code that defines them · LaTeX equations, inline
(`$…$`) and display, rendered to MathML with no download.

**Editing workflow**: undo and redo with a visible history panel · autosave ·
draft recovery after a crash · rolling local backups you can go back to ·
tracked changes and suggesting mode with a review bar.

**Keyboard and productivity**: command palette (`Ctrl+K` or `Ctrl+Shift+P`)
· slash commands (`/table`, `/image`, `/code` …) · emoji shortcodes (`:smi`)
· a keyboard shortcut manager where every advertised key is real and
rebindable · quick insert · recently used tools · favourite tools · a toolbar
whose groups you rearrange by dragging, and can hide · focus mode · typewriter
scrolling · fullscreen.

**Files**: open and save `.html`, `.md`, `.txt`, native `.json`, `.docx`,
`.rtf` and encrypted `.tvx` · import Word documents and Markdown · download
only the selection · print preview · PDF *(through the browser's print dialog,
see the exceptions)*.

**Advanced blocks**: callouts in five variants (info, success, warning,
danger, note) · toggle blocks · columns (2-4) · cards · tabs · accordions ·
timelines · badges · buttons · footnotes · citations with a numbered
references list.

**Security and privacy**: password-protected documents · read-only mode ·
document expiry · copy, cut, paste, print, download and context-menu
restrictions · encrypted local storage · offline editing with an indicator ·
automatic local backup.

**Customisation**: light and dark themes · five presets (Sepia, Nord,
Solarized, High contrast, Midnight) · a custom theme built from five colours ·
add web fonts · custom CSS scoped to the editor · four editor widths · page
view (A4, US Letter, US Legal, A5) or continuous · custom toolbar layout.

**Writing assistance**: spell check *(the browser's own, see the
exceptions)* · grammar hints · readability (Flesch reading ease and
Flesch-Kincaid grade) · passive voice · repeated words · long sentences ·
character, word, sentence and paragraph counts · reading and speaking time ·
keyword density · a word-count goal with live progress.

**The two exceptions**

- **Spell check** is the browser's own, switched on and off from Tools. A
  bundled dictionary is deliberately out of scope: browsers ship better ones,
  in more languages, than a shipped word list could match.
- **PDF export** goes through the browser's print dialog ("Save as PDF"),
  with the page pre-styled so backgrounds and colours survive printing, rather
  than through a bundled PDF writer that would add megabytes of font handling
  for output the platform already produces.

## What Trevixal deliberately does not do

- **Real-time collaboration, comments, mentions and sharing.** Built,
  measured, and removed on 2026-09-12. Trevixal is a single-user editor; the
  decision is recorded in [ADR-0009](docs/adr/0009-collab-binding.md) (now
  superseded) and the project notes.
- **A bundled spell-check dictionary or a PDF writer**. The two exceptions
  above.
- **Native mobile SDKs.**
- **Table cells spanning rows.** Cells merge across columns only
  ([ADR-0006](docs/adr/0006-colspan-only-table-model.md)).

---

## Requirements and installation

| Requirement | Version | Notes |
| --- | --- | --- |
| Node.js | ≥ 20 (`engines`) | Developed and measured on 22 |
| pnpm | 11.24.0 | Pinned by `packageManager`; `corepack enable` activates it |
| A browser | Chrome, or Playwright's Chromium/Firefox/WebKit | Only for the browser tests |

Once published, `npm install @trevixal/core` and friends are all you need; every
package is public under the `@trevixal` scope. Until the first release has run,
build against this workspace:

```sh
git clone git@github.com:adityabhalsod/trevixal-editor.git
cd trevixal-editor
corepack enable
pnpm install
pnpm build                                     # every package, ~1 min; the examples resolve through dist/
pnpm --filter @trevixal/example-full-editor dev
```

To build your own app against the workspace, add a package under `examples/`
that depends on `"@trevixal/core": "workspace:*"` and the extensions it uses,
exactly as [`examples/full-editor/package.json`](examples/full-editor/package.json)
does. The `npm install` lines in the sections below show the intended shape
once the packages are published.

## Packages

Twenty-three publishable packages, all released together, each shipping ESM + CJS +
`.d.ts` from `tsup`, each with **no runtime dependencies** (framework adapters
declare their framework as a peer, and `@trevixal/editor-kit` declares the
extensions it assembles). Test counts are from the run at the top of this
file.

| Package | Downloads | Tests | What it is |
| --- | --- | ---: | --- |
| [`@trevixal/core`](packages/core) | ![](https://img.shields.io/endpoint?url=https%3A%2F%2Ftrevixal-editor.vercel.app%2Fapi%2Fdownloads%3Fpackage%3Dcore&label=) | 511 | The engine: immutable `EditorState`, schema-validated documents, nine invertible step types, position mapping, undo history, commands, input rules, sanitizing HTML import, HTML/Markdown/text serializers, clipboard, find & replace, decoration layers, suggestion triggers, format painter, the `beforeinput` + IME view with MutationObserver repair. SSR-safe, `sideEffects: false`. |
| [`@trevixal/editor-kit`](packages/editor-kit) | ![](https://img.shields.io/endpoint?url=https%3A%2F%2Ftrevixal-editor.vercel.app%2Fapi%2Fdownloads%3Fpackage%3Deditor-kit&label=) | 14 | Every package below, assembled: one call builds the menubar, toolbar, status bar, sidebar panels, preview and mirror panes, and wires all twenty extensions to each other. The finished editor, for hosts that do not want to assemble one. |
| [`@trevixal/ui`](packages/ui) | ![](https://img.shields.io/endpoint?url=https%3A%2F%2Ftrevixal-editor.vercel.app%2Fapi%2Fdownloads%3Fpackage%3Dui&label=) | 179 | The editing chrome: menubar, grouped toolbar, controls, dialogs, status bar, suggestion popup, command palette, shortcut manager, find & replace, TOC and outline, history panel, autosave and backups, themes/fonts/custom CSS/page view, view modes, source modes, export/import/print plumbing, and the SCSS design system. |
| [`@trevixal/react`](packages/react) | ![](https://img.shields.io/endpoint?url=https%3A%2F%2Ftrevixal-editor.vercel.app%2Fapi%2Fdownloads%3Fpackage%3Dreact&label=) | 17 | `useEditor`, `useEditorSnapshot`, `<EditorContent>`, `EditorProvider`, portal node views. |
| [`@trevixal/vue`](packages/vue) | ![](https://img.shields.io/endpoint?url=https%3A%2F%2Ftrevixal-editor.vercel.app%2Fapi%2Fdownloads%3Fpackage%3Dvue&label=) | 19 | `useEditor` composable, `useEditorSnapshot`, `<EditorContent>`. |
| [`@trevixal/svelte`](packages/svelte) | ![](https://img.shields.io/endpoint?url=https%3A%2F%2Ftrevixal-editor.vercel.app%2Fapi%2Fdownloads%3Fpackage%3Dsvelte&label=) | 8 | `use:trevixalEditor` action and an `editorStore` store contract. |
| [`@trevixal/angular`](packages/angular) | ![](https://img.shields.io/endpoint?url=https%3A%2F%2Ftrevixal-editor.vercel.app%2Fapi%2Fdownloads%3Fpackage%3Dangular&label=) | 12 | `createAngularEditor` and `editorSnapshotSignal`. A signal-backed snapshot and view lifecycle. Functions rather than decorators, so it needs no Angular compiler. Zoneless. |
| [`@trevixal/web-component`](packages/web-component) | ![](https://img.shields.io/endpoint?url=https%3A%2F%2Ftrevixal-editor.vercel.app%2Fapi%2Fdownloads%3Fpackage%3Dweb-component&label=) | 28 | `<trevixal-editor>` custom element plus a bundler-free IIFE CDN build. |
| [`@trevixal/extension-table`](packages/extension-table) | ![](https://img.shields.io/endpoint?url=https%3A%2F%2Ftrevixal-editor.vercel.app%2Fapi%2Fdownloads%3Fpackage%3Dextension-table&label=) | 104 | Tables: structure, merge/split (colspan), header row, alignment, background, borders, sort, resize, CSV in and out, text ↔ table. |
| [`@trevixal/extension-image`](packages/extension-image) | ![](https://img.shields.io/endpoint?url=https%3A%2F%2Ftrevixal-editor.vercel.app%2Fapi%2Fdownloads%3Fpackage%3Dextension-image&label=) | 95 | Images: pluggable storage, drag/paste/pick upload with progress and cancellation, resize handles, crop, rotate, compress, captions, alignment, a floating toolbar. |
| [`@trevixal/extension-blocks`](packages/extension-blocks) | ![](https://img.shields.io/endpoint?url=https%3A%2F%2Ftrevixal-editor.vercel.app%2Fapi%2Fdownloads%3Fpackage%3Dextension-blocks&label=) | 105 | Callouts, toggles, columns, cards, timelines, page breaks, badges, buttons, footnotes, tabs, accordions, citations and reference lists, anchors. |
| [`@trevixal/extension-embed`](packages/extension-embed) | ![](https://img.shields.io/endpoint?url=https%3A%2F%2Ftrevixal-editor.vercel.app%2Fapi%2Fdownloads%3Fpackage%3Dextension-embed&label=) | 110 | Video, audio, YouTube/Vimeo and allowlisted iframes, file attachments with pluggable storage, link preview cards. |
| [`@trevixal/extension-math`](packages/extension-math) | ![](https://img.shields.io/endpoint?url=https%3A%2F%2Ftrevixal-editor.vercel.app%2Fapi%2Fdownloads%3Fpackage%3Dextension-math&label=) | 118 | LaTeX → MathML for inline and display equations, `$…$` input rule, pluggable renderer. |
| [`@trevixal/extension-diagram`](packages/extension-diagram) | ![](https://img.shields.io/endpoint?url=https%3A%2F%2Ftrevixal-editor.vercel.app%2Fapi%2Fdownloads%3Fpackage%3Dextension-diagram&label=) | 32 | Live diagram previews under code blocks through any renderer; Mermaid adapter and lazy CDN loader included. |
| [`@trevixal/extension-export`](packages/extension-export) | ![](https://img.shields.io/endpoint?url=https%3A%2F%2Ftrevixal-editor.vercel.app%2Fapi%2Fdownloads%3Fpackage%3Dextension-export&label=) | 301 | DOCX and RTF writers and a DOCX reader, with their own ZIP and XML implementations; themed, with highlighted code and embedded diagrams. |
| [`@trevixal/extension-security`](packages/extension-security) | ![](https://img.shields.io/endpoint?url=https%3A%2F%2Ftrevixal-editor.vercel.app%2Fapi%2Fdownloads%3Fpackage%3Dextension-security&label=) | 61 | PBKDF2 + AES-GCM document encryption with expiry, an encrypted key-value storage wrapper, copy/cut/paste/print/download/context-menu restrictions. |
| [`@trevixal/extension-writing`](packages/extension-writing) | ![](https://img.shields.io/endpoint?url=https%3A%2F%2Ftrevixal-editor.vercel.app%2Fapi%2Fdownloads%3Fpackage%3Dextension-writing&label=) | 121 | Readability, passive voice, repeated words, long sentences, grammar rules, keyword density, reading/speaking time, goals, spell-check toggle. |
| [`@trevixal/extension-workspace`](packages/extension-workspace) | ![](https://img.shields.io/endpoint?url=https%3A%2F%2Ftrevixal-editor.vercel.app%2Fapi%2Fdownloads%3Fpackage%3Dextension-workspace&label=) | 142 | A document store with folders, templates, recents and favourites; a tab strip; a workspace panel; a split preview or mirrored second editor. |
| [`@trevixal/extension-track-changes`](packages/extension-track-changes) | ![](https://img.shields.io/endpoint?url=https%3A%2F%2Ftrevixal-editor.vercel.app%2Fapi%2Fdownloads%3Fpackage%3Dextension-track-changes&label=) | 50 | Suggestion mode: attributed, timestamped `ins`/`del` marks; accept and reject one or all; a review bar. |
| [`@trevixal/extension-code-highlight`](packages/extension-code-highlight) | ![](https://img.shields.io/endpoint?url=https%3A%2F%2Ftrevixal-editor.vercel.app%2Fapi%2Fdownloads%3Fpackage%3Dextension-code-highlight&label=) | 70 | Twelve bundled languages behind one `Highlighter` interface, language detection, copy-code buttons. Rendered as decorations. |
| [`@trevixal/extension-format-code`](packages/extension-format-code) | ![](https://img.shields.io/endpoint?url=https%3A%2F%2Ftrevixal-editor.vercel.app%2Fapi%2Fdownloads%3Fpackage%3Dextension-format-code&label=) | 34 | JSON and XML pretty-printing and minification, in place, for the code block at the caret. |
| [`@trevixal/extension-slash-command`](packages/extension-slash-command) | ![](https://img.shields.io/endpoint?url=https%3A%2F%2Ftrevixal-editor.vercel.app%2Fapi%2Fdownloads%3Fpackage%3Dextension-slash-command&label=) | 20 | The `/` menu: fuzzy filtering, keyboard-first, an extensible item list. |
| [`@trevixal/extension-emoji`](packages/extension-emoji) | ![](https://img.shields.io/endpoint?url=https%3A%2F%2Ftrevixal-editor.vercel.app%2Fapi%2Fdownloads%3Fpackage%3Dextension-emoji&label=) | 20 | The `:` picker with 114 built-in emoji and search. |
| `@trevixal/e2e` *(private)* | — | 156 browser | The Playwright suite and its self-contained test pages. |
| `@trevixal/example-*` *(private)* | — | — | [Eleven example apps](examples/README.md), each running the assembled editor, nine from a framework's lifecycle, two from none. |

**What it costs** (`pnpm size`, minified and gzipped as a bundler would ship
it). Every row has a budget in
[`scripts/size-budget.mjs`](scripts/size-budget.mjs) that fails the build when
it is crossed:

| | gzipped | |
| --- | ---: | --- |
| `@trevixal/core` | 36.1 KB | The engine alone |
| `@trevixal/ui` | 63.2 KB | The chrome, plus 10.8 KB of CSS |
| `@trevixal/editor-kit` | **180.3 KB** | Everything, plus 1.2 KB of CSS |
| `@trevixal/editor-kit` CDN build | 180.3 KB | The same, in one `<script>` |
| `<trevixal-editor>` CDN build | 28.6 KB | The engine in one `<script>`, chrome left to you |

## Quick start

Eight ways in, all onto the same engine. Pick the row that matches your app;
none of them is a wrapper around another, and none is the "real" one.

| Your app | Package | What it gives you |
| --- | --- | --- |
| [Anything, and you want all of it](#the-whole-editor-in-one-call) | `@trevixal/editor-kit` | The finished editor (chrome, panels, panes, every extension) from one call |
| [A plain HTML page](#plain-html-no-build-tools) | `@trevixal/web-component` | A `<trevixal-editor>` tag and a global, from one `<script>` |
| [Vanilla JS or TS](#vanilla-javascript-or-typescript) | `@trevixal/core` | `createEditor` and nothing you did not ask for |
| [React](#react) | `@trevixal/react` | `useEditor`, `useEditorSnapshot`, `EditorContent` |
| [Vue 3](#vue-3) | `@trevixal/vue` | `useEditor` and `EditorContent` |
| [Svelte](#svelte) | `@trevixal/svelte` | A `use:` action and a store |
| [Angular](#angular) | `@trevixal/angular` | A signal-backed snapshot, zoneless, no Angular compiler in the adapter |
| [A web component](#web-component) | `@trevixal/web-component` | The custom element, defined by you |

Every adapter meets the same contract: **the editor's DOM stays outside the
framework's reconciliation**, and the snapshot a toolbar binds to keeps its
identity while nothing it would draw differently has changed, so typing does
not re-render your tree. [ADR-0007](docs/adr/0007-adapter-contract.md) records
why, and each example app measures it.

### The whole editor in one call

The rows below all build an editor out of parts. This one hands you the
finished thing: the menubar, the toolbar, the sidebar panels, the
side-by-side preview, autosave, themes, track changes, encryption. Every
package in this workspace, already wired to every other.

```ts
import { mountFullEditor } from '@trevixal/editor-kit'
import '@trevixal/ui/styles.css'
import '@trevixal/editor-kit/styles.css'

const editor = mountFullEditor({ element: document.querySelector('#app') })
// …and when the component holding it goes away:
editor.destroy()
```

It reaches for `window` immediately, so call it from wherever your framework
runs browser-only code. A `useEffect`, an `onMounted`, an `afterNextRender`,
an `onMount`. The [eleven example apps](examples/README.md) are that one call
in eight frameworks and twice in none; what differs between them is the hook,
and nothing else:

| Example | The hook | What it also shows |
| --- | --- | --- |
| [`full-editor`](examples/full-editor) | none, plain DOM | The whole thing, with no framework at all |
| [`react`](examples/react) | `useEffect` | Strict mode mounting twice, and a teardown that survives it |
| [`next`](examples/next) | `useEffect` behind `ssr: false` | The App Router client boundary, and deploying to Vercel |
| [`vue`](examples/vue) | `onMounted` | A Vue component rendered inside the document |
| [`nuxt`](examples/nuxt) | `onMounted` inside `<ClientOnly>` | A prerendered page with a client-only island |
| [`svelte`](examples/svelte) | `$effect` | A Svelte component rendered inside the document |
| [`sveltekit`](examples/sveltekit) | `$effect` + a dynamic import | Why the *import* is the thing that has to move |
| [`angular`](examples/angular) | `afterNextRender` | Zoneless signals, and no change detection at all |
| [`solid`](examples/solid) | `onMount` | That no adapter package is needed to mount it |
| [`vanilla-cdn`](examples/vanilla-cdn) | a `<script>` tag | The same call from a global, with no npm and no bundler |
| [`ssr`](examples/ssr) | `DOMContentLoaded` | Node renders the words to HTML; the browser builds the editor over them |

See [`@trevixal/editor-kit`](packages/editor-kit) for the options, and
[`src/mount.ts`](packages/editor-kit/src/mount.ts) if you want most of this
editor but not all of it. It is a few hundred lines of the same public API
you have, written to be copied and cut down.

### Plain HTML, no build tools

Two CDN builds, at opposite ends of the same trade. `@trevixal/editor-kit`
puts the **whole editor** on `window.TrevixalKit`, 180 KB gzipped, because a
page with no bundler cannot fetch fifteen extensions separately:

```html
<link rel="stylesheet" href="https://unpkg.com/@trevixal/ui/styles.css" />
<link rel="stylesheet" href="https://unpkg.com/@trevixal/editor-kit/styles.css" />
<script src="https://unpkg.com/@trevixal/editor-kit"></script>

<div id="app"></div>
<script>
  TrevixalKit.mountFullEditor({ element: document.querySelector('#app') })
</script>
```

`@trevixal/web-component` is the other end: one script that defines
`<trevixal-editor>` and puts the engine on `window.Trevixal`, at 29 KB, with
the chrome left to you. Both packages' `unpkg` and `jsdelivr` fields point at
their build, so once published these URLs resolve; today, serve
`packages/web-component/dist/trevixal-editor.iife.js` and
`packages/ui/dist/styles.css` yourself.

```html
<link rel="stylesheet" href="https://unpkg.com/@trevixal/ui/styles.css" />
<script src="https://unpkg.com/@trevixal/web-component"></script>

<div class="trevixal">
  <trevixal-editor placeholder="Start typing…">
    <h2>Hello</h2>
    <p>This initial content is parsed <em>and sanitized</em>.</p>
  </trevixal-editor>
</div>

<script>
  const element = document.querySelector('trevixal-editor')
  element.addEventListener('trevixal-change', (event) => {
    console.log(event.detail.html) // serialized HTML
    console.log(event.detail.json) // canonical document JSON
  })
  element.value            // HTML in and out
  element.getJSON()        // canonical JSON
  element.setJSON(json)
  element.editor           // the full Editor instance
</script>
```

### Vanilla JavaScript or TypeScript

```sh
npm install @trevixal/core @trevixal/ui   # once published
```

```ts
import { createEditor, Schema, defaultNodes, defaultMarks } from '@trevixal/core'
import { createEditorUI } from '@trevixal/ui'
import '@trevixal/ui/styles.css'

const editor = createEditor({
  schema: new Schema({ nodes: defaultNodes(), marks: defaultMarks() }),
  element: document.querySelector('#editor'), // omit for a headless editor
  placeholder: 'Write something…',
  onChange: ({ json, html }) => save(json),
})

// The whole chrome (menubar, toolbar, dialogs, status bar) in one call.
createEditorUI(editor, { container: document.querySelector('#chrome') })

// The imperative API
editor.commands.toggleMark('bold')
editor.chain().focus().setHeading(2).insertText('Hello').run()
editor.getHTML()          // '<h2>Hello</h2>'
editor.getJSON()          // what you store
editor.getText()
editor.getWordCount()
editor.setEditable(false) // read-only
```

A **headless** editor, no `element`, runs the identical engine with no DOM.
Use it in Node for server-side processing, migrations, or tests.

### React

```sh
npm install @trevixal/core @trevixal/react @trevixal/ui   # once published
```

```tsx
import { Schema, defaultNodes, defaultMarks } from '@trevixal/core'
import { useEditor, useEditorSnapshot, EditorContent } from '@trevixal/react'
import '@trevixal/ui/styles.css'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

function Toolbar({ editor }) {
  // Reference-stable snapshot: this component re-renders only when the
  // toolbar state actually changes, never on plain typing.
  const snapshot = useEditorSnapshot(editor)
  return (
    <button
      aria-pressed={snapshot?.activeMarks.includes('bold')}
      onClick={() => editor.commands.toggleMark('bold')}
    >
      Bold
    </button>
  )
}

export function MyEditor() {
  const editor = useEditor({ schema })
  return (
    <div className="trevixal">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} placeholder="Write something…" />
    </div>
  )
}
```

React components can render **inside the document** as node views through
portals, see `NodeViewProps`. The test suite includes an interactive counter
block whose clicks dispatch real editor transactions, and a test asserting
that a non-subscribing sibling renders **zero** times while typing.

### Vue 3

```sh
npm install @trevixal/core @trevixal/vue @trevixal/ui   # once published
```

```vue
<script setup>
import { Schema, defaultNodes, defaultMarks } from '@trevixal/core'
import { useEditor, useEditorSnapshot, EditorContent } from '@trevixal/vue'
import '@trevixal/ui/styles.css'

const editor = useEditor({
  schema: new Schema({ nodes: defaultNodes(), marks: defaultMarks() }),
})
const snapshot = useEditorSnapshot(editor)
</script>

<template>
  <div class="trevixal">
    <button
      :aria-pressed="snapshot?.activeMarks.includes('bold')"
      @click="editor?.commands.toggleMark('bold')"
    >Bold</button>
    <EditorContent :editor="editor" placeholder="Write something…" />
  </div>
</template>
```

### Svelte

```sh
npm install @trevixal/core @trevixal/svelte @trevixal/ui   # once published
```

```svelte
<script>
  import { Schema, defaultNodes, defaultMarks, createEditor } from '@trevixal/core'
  import { trevixalEditor, editorStore } from '@trevixal/svelte'
  import '@trevixal/ui/styles.css'

  const editor = createEditor({
    schema: new Schema({ nodes: defaultNodes(), marks: defaultMarks() }),
  })
  const snapshot = editorStore(editor) // Svelte store contract: $snapshot
</script>

<div class="trevixal">
  <button
    aria-pressed={$snapshot?.activeMarks.includes('bold')}
    on:click={() => editor.commands.toggleMark('bold')}
  >Bold</button>
  <div use:trevixalEditor={{ editor, placeholder: 'Write something…' }} />
</div>
```

The Svelte package imports nothing from Svelte itself, so it works with
Svelte 4 stores and Svelte 5 runes alike.

### Angular

```sh
npm install @trevixal/core @trevixal/angular @trevixal/ui   # once published
```

```ts
import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, viewChild } from '@angular/core'
import { Schema, defaultMarks, defaultNodes } from '@trevixal/core'
import { createAngularEditor } from '@trevixal/angular'

@Component({
  selector: 'app-editor',
  standalone: true,
  template: `
    <button
      [attr.aria-pressed]="isBold()"
      (mousedown)="$event.preventDefault()"
      (click)="editor.commands.toggleMark('bold')"
    >Bold</button>

    <div class="trevixal" #host></div>
  `,
})
export class EditorComponent {
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host')
  private readonly binding = createAngularEditor({
    schema: new Schema({ nodes: defaultNodes(), marks: defaultMarks() }),
  })

  readonly editor = this.binding.editor
  readonly isBold = computed(() => this.binding.snapshot()?.activeMarks.includes('bold') ?? false)

  constructor() {
    afterNextRender(() => this.binding.attach(this.host().nativeElement))
    inject(DestroyRef).onDestroy(() => this.binding.destroy())
  }
}
```

Zoneless by construction: the snapshot is a signal, so a change notifies
exactly the templates that read it, no `NgZone`, no `markForCheck`, and
nothing else re-rendering while somebody types.

The adapter itself ships **no** `@Component`, `@Directive` or `@Injectable`,
so it needs no Angular compiler and builds with the same `tsup` pipeline as
every other package here; what it needs from Angular is `signal`, which is an
ordinary function. Your component owns the decorators. The
[example app](examples/angular) shows the compiler side of that arrangement,
and what it costs.

### Web component

`@trevixal/web-component` exports `TrevixalEditorElement` and
`defineTrevixalEditor(tag = 'trevixal-editor')`. The CDN entry
(`@trevixal/web-component/cdn`) calls `defineTrevixalEditor()` on load and
exposes `Trevixal.{ defineTrevixalEditor, TrevixalEditorElement, FormatPainter,
describeFormat }` as a global for pages with no imports.

| Surface | Detail |
| --- | --- |
| Attributes | `placeholder`, `readonly` (observed, flipping it at runtime toggles editability), `autofocus` |
| Initial content | The element's HTML children, sanitized on parse |
| Event | `trevixal-change`, bubbling `CustomEvent<{ json, html }>` on every document change |
| Properties | `value` (HTML get/set), `getJSON()`, `setJSON(json)`, `editor` (the `Editor`) |
| SSR | The class extends a stand-in when `HTMLElement` does not exist, so the module imports in Node; the element registers only where a DOM exists |

## A tour of the editor

What you see in the [demo](examples/full-editor), top to bottom.

**Menubar.** Eight menus (File, Edit, Insert, Format, Tools, Table, View,
Help) holding 205 entries, every one with an icon and,
where a key is bound, the shortcut printed beside it. The full tree is in
[Every menu command](#every-menu-command).

**Toolbar.** Twelve groups: block format, line height and paragraph spacing · font and size · text style
(bold, italic, underline, strikethrough, inline code, superscript, subscript,
small caps, letter spacing, change case) · lists (bullet, numbered, task,
list style, multilevel list, restart numbering, indent, outdent) · alignment · colours ·
insert (link, unlink, image, table grid, quote, rule) · format painter ·
blocks (callout and columns pickers) · code (code block, copy, format JSON,
format XML, minify) · tools (find, contents, outline, palette, focus,
fullscreen, word count) · history (clear formatting, undo, redo). Drag a
group by its grip to move it, or press Space on the grip and use the arrow
keys, and the order is remembered. *Help ▸ Customize toolbar…* hides and
shows groups.

**Popups at the caret.** Type `/` at the start of a line for the slash menu;
type `:` and a few letters for emoji. Both filter as you type, move with the
arrow keys, pick with Enter and close with Escape.

**Command palette.** `Ctrl+K` (or `Ctrl+Shift+P`) opens a searchable list of
every menu command, with its icon, menu and shortcut. The list is built from
the menus as actually wired, so it can never drift out of step with them.

**Sidebar panels.** Table of contents, document outline, undo history and the
documents panel. The sidebar appears with the first panel you open and
disappears with the last one you close.

**Review bar.** In suggesting mode, a bar above the editor walks through each
suggestion with accept and reject, one at a time or all at once.

**Status bar.** The element path on the left (`p › strong`), live word and
character counts on the right, plus the save state, upload progress, the
protection status and an offline indicator.

**Dialogs.** Link, image, source code, special characters (48 of them), word
count and statistics, writing goal, custom CSS, custom theme, add a font,
password, expiry and restrictions, local backups, keyboard shortcuts,
customize toolbar, and About.

**Two more surfaces.** *View ▸ Side-by-side preview* shows the document as a
downloaded page would render it, live. *View ▸ Split editor* opens a second
editing surface on the same document, type in either. Open both at once and
the three panes share the row, wrapping one to a line as the window narrows.
Both panes get what the editor has: syntax colours, drawn diagrams and working
tab strips. None of those three is in the document (one is a decoration, one
an element the view appends, one a click handler) so each is carried across
deliberately rather than arriving with the content.

## Saving, opening, exporting and printing

| Action | Where | Formats |
| --- | --- | --- |
| Save now | File ▸ Save (`Ctrl+S`) | Writes the autosave immediately |
| Download as… | File ▸ Download as | Web page `.html` · Markdown `.md` · Plain text `.txt` · Trevixal JSON `.json` · Word `.docx` · Rich text `.rtf` · PDF (via print) · Encrypted document `.tvx` |
| Download selection… | File ▸ Download selection | Any of the above, for the selected blocks only |
| Open… | File ▸ Open (`Ctrl+O`) | `.html` · `.md` · `.txt` · `.json` · `.docx` · `.tvx` (asks for the password) |
| Import a file… | File ▸ Import a file | The same importers; the demo replaces the document as one undo step (`importFile` can also insert at the caret with `mode: 'insert'`) |
| Local backups… | File ▸ Local backups | Rolling snapshots to restore from |
| Print preview… | File ▸ Print preview | The page as it will print, in its theme |
| Print… | File ▸ Print (`Ctrl+P`) | The browser's print dialog; choose "Save as PDF" for a PDF |

Everything a download produces **carries the theme you were editing in**, the
syntax colours of your code blocks and the diagrams they drew. A downloaded
web page also works when opened straight from disk: its tabs switch, its
toggles open, and a YouTube embed, which will not play from a local file
because the page has no origin to offer, becomes a labelled link instead.

**Autosave** writes to the browser's local storage a moment after you stop
typing, keeps rolling backups (in the demo, one every two minutes, ten kept),
and offers to restore an unsaved draft after a crash. The demo works offline;
an indicator in the status bar says when you are.

## Appearance

*View ▸ Theme* offers Light, Dark, Match the system, and five presets,
**Sepia, Nord, Solarized, High contrast, Midnight**. *Custom theme…* builds a
preset from five colours (page background, chrome background, text, borders,
accent). *Custom CSS…* adds your own rules, scoped so they cannot leak out of
the editor. *Add a font…* loads a web font on demand.

*View* also holds **Focus mode** (dims everything but the paragraph you are
in), **Typewriter scrolling** (keeps the caret line in place), **Fullscreen**,
**Page view** (paginated A4 / US Letter / US Legal / A5 with margins, or
continuous) and four **widths**, narrow, normal, wide, full.

The page around the editor follows the editor's theme in the demo, so a dark
theme is not a dark box on a white page.

## Protecting a document

*File ▸ Protect with password…* encrypts the document with a password you
choose. The saved envelope (`.tvx`, or the autosave in local storage) is
unreadable without it. The key is derived with PBKDF2-SHA256 (310,000
rounds by default) and the content sealed with AES-GCM, using the browser's
own cryptography. An optional **expiry** stops the document opening after a
date; the status bar says how long is left, rounding *down* so it never
overstates the time.

*File ▸ Restrictions…* blocks copy, cut, paste, print, download or the
context menu, individually. A blocked attempt says so in the status line.
*View ▸ Read-only mode* locks the surface without a password.

Nothing about protection is persisted in the demo. A reload starts
unprotected, as a demo should.

## Reviewing with tracked changes

Switch on *View ▸ Suggesting mode*. From then on, typing produces
colour-coded **insertions** attributed to you, and deleting **strikes text
through** instead of removing it. The review bar above the editor steps
through the suggestions; accept or reject each, or all at once. Suggestions
carry an author and a timestamp, so a reviewer can order them, and they
survive copy and paste.

## Writing help and readability

*Tools ▸ Check writing* marks issues in the margin as you type, each with a
one-click fix where one exists:

- **Grammar**: a/an agreement, sentence case, doubled spaces, space before
  punctuation, missing space after punctuation, common errors and misspellings
- **Passive voice**
- **Repeated words**
- **Long sentences** (more than 25 words)

Point at any underlined word for a small card naming the check that fired and
what it found; click it for the same finding as a menu. The replacement where
there is one, and **Ignore this wording** where there is not. `Ctrl+.` opens
that menu for whatever is under the caret. Ignoring is by wording rather than
by position, so a word waved through in one sentence stays waved through
instead of coming back the moment the line above it is edited.

*Tools ▸ Document statistics…* reports words, characters, sentences and
paragraphs, reading time (at 238 words a minute) and speaking time (150),
Flesch reading ease with a plain-language label, Flesch-Kincaid grade, and
keyword density. *Tools ▸ Writing goal…* sets a word-count target with a live
progress readout. *Tools ▸ Spell check* toggles the browser's checker.

## Working with several documents

*View ▸ Documents* opens the workspace panel: a **document store** with
folders, six templates (Blank, Meeting notes, Project brief, Blog post,
Weekly report, README), recents, favourites, pinning, duplicate, rename and
search. Open documents appear as **tabs** above the editor. The store lives in
the browser's local storage in the demo, and behind an interface you can point
at anything.

## Assembling the editing chrome

`createEditorUI` mounts the menubar, toolbar, dialogs and status bar, wired to
the editor. It deliberately depends on **none** of the extension packages: you
pass in the capabilities you have, and **menu entries whose action you have
not supplied are dropped from the menus** rather than left disabled. A menu
entry that seems to have vanished is almost always this, not a CSS bug.

```ts
import { createEditorUI } from '@trevixal/ui'
import { tableUICommands } from '@trevixal/extension-table'
import { blockUICommands } from '@trevixal/extension-blocks'
import { embedUICommands } from '@trevixal/extension-embed'
import { mathUICommands } from '@trevixal/extension-math'
import { diagramUICommands } from '@trevixal/extension-diagram'
import { codeFormatUICommands } from '@trevixal/extension-format-code'

const ui = createEditorUI(editor, {
  container: document.querySelector('#chrome'),
  tableCommands: tableUICommands(),           // Table menu + grid picker
  blockCommands: blockUICommands(),           // callouts, columns, tabs, …
  embedCommands: embedUICommands(),           // video, audio, embeds, cards
  mathCommands: mathUICommands(),             // equations
  diagramCommands: diagramUICommands(),       // Insert ▸ Diagram
  codeFormatCommands: codeFormatUICommands(), // Format JSON / XML, Minify
  images: { pickFiles: () => images.pickFiles(), insertImage: (a) => images.insertImage(a) },
  fileActions: { saveDocument, openDocument, downloadAs, importDocument, /* … */ },
  viewActions: { setTheme, toggleFocusMode, toggleReadOnly, /* … */ },
  shortcutLabels: shortcuts.labels(),         // what the menus print
})

ui.menus       // the wired menu tree, feed it to the command palette
ui.toolbar
ui.statusBar
ui.findReplace
ui.openLinkDialog()
```

The host contracts, as declared in [`editor-ui.ts`](packages/ui/src/editor-ui.ts):

| Option | Type | Drives |
| --- | --- | --- |
| `tableCommands` | `TableCommands` | The Table menu and grid: `insertTable(rows, cols)` plus optional row/column/merge/split/header/delete, `setCellAlign`, `setCellBackground`, `setTableBorders`, `setTableBorderColor`, `sortAscending/Descending`, `convertTextToTable`, `convertTableToText`, `insertTableFromCSV`, `csvAtSelection`, `distributeColumns`, `clearSizing` |
| `images` | `ImageActions` | `pickFiles()`, `insertImage({ src, alt?, title? })`. The image button and dialog |
| `blockCommands` | from `blockUICommands()` | Insert ▸ Callout/Toggle/Columns/Card/Timeline/Tabs/Accordion/Badge/Button/Anchor/Footnote/Citation/References/Page break |
| `embedCommands` | `EmbedCommands` | `insertEmbed(url)`, `insertVideo`, `insertAudio`, `insertIframe`, `insertLinkCard`, `pickAttachment` |
| `mathCommands` | `MathCommands` | `insertMath(latex)`, `insertMathBlock(latex)` |
| `diagramCommands` | `DiagramCommands` | `insertDiagram(code?)` |
| `codeFormatCommands` | from `codeFormatUICommands()` | Format JSON, Format XML, Minify |
| `fileActions` | `FileActions` | `newDocument`, `openDocument`, `saveDocument`, `downloadAs(format)`, `importDocument`, `exportSelection`, `printPreview`, `exportPDF`, `backups`, `protectDocument`, `documentRestrictions` |
| `viewActions` | `ViewActions` | Theme (`setTheme`, `setThemePreset`, `customTheme`, `customCSS`, `manageFonts`), modes (`toggleFocusMode`, `toggleTypewriter`, `toggleFullscreen`, `togglePageMode`), panels (`toggleTableOfContents`, `toggleOutline`, `toggleHistoryPanel`, `toggleWorkspace`, `toggleSplitPreview`, `toggleSplitEditor`), `toggleReadOnly`, `toggleTrackChanges`, `setWidth`, `openCommandPalette`, `copyCode`, `formatPainter`, `insertEmoji`, `toggleSourceMode('markdown' \| 'html')`, writing (`showWritingStats`, `setWritingGoal`, `toggleWritingAssistant`, `toggleWritingCheck(kind)`, `isWritingCheckEnabled`, `toggleSpellcheck`, `isSpellcheckEnabled`), `customizeToolbar`, `showKeyboardShortcuts`, `showAbout`, and the state readbacks `isViewToggleOn(toggle)`, `activeWidth()`, `activeTheme()`, `activeSourceMode()` that put a tick beside whatever is currently on |
| `menus`, `toolbar`, `showMenubar`, `showStatusBar`, `shortcutLabels` | | Replace the menu tree, pass `ToolbarOptions`, hide pieces, print the shortcut manager's labels |

Every piece is also available on its own (`createMenubar`, `createToolbar`,
`createStatusBar`, `createSuggestionPopup`, `openDialog`,
`openCharacterPicker`) and layouts are data:

```ts
import { createToolbar, defaultToolbarGroups } from '@trevixal/ui'

createToolbar(editor, container, {
  groups: [
    ...defaultToolbarGroups().filter((group) => group.name !== 'color'),
    {
      name: 'custom',
      items: [{ name: 'shout', label: 'Shout', icon: 'bold', run: (e) => e.commands.insertText('!!!') }],
    },
  ],
  reorderable: true,
  groupOrder: savedOrder,                   // restores a remembered order without hiding new groups
  onReorder: (order) => remember(order),
})
```

[`@trevixal/editor-kit`](packages/editor-kit) is the complete worked example
of all of the above: [`src/mount.ts`](packages/editor-kit/src/mount.ts) wires
the editor and its chrome, and
[`src/features.ts`](packages/editor-kit/src/features.ts) beside it holds the
parts that are not document model, theme, fonts, custom CSS, page view,
autosave, statistics and protection.

## Using the extensions

Extensions are ordinary packages built on core's public API. **Schema
extensions** merge into your schema; **behaviour extensions** attach to an
editor and return a controller or a disposer. Nothing reaches into private
APIs: [ADR-0008](docs/adr/0008-extension-points.md) lists the four hooks they
all use.

### Tables

```ts
import { Schema, defaultNodes, defaultMarks, createEditor } from '@trevixal/core'
import {
  tableNodes, tableKeymap, insertTable, addRow, addColumn, deleteRow, deleteColumn,
  mergeCells, splitCell, toggleHeaderRow, setCellAlign, setCellBackground,
  setTableBorders, sortTable, convertTextToTable, insertTableFromCSV, tableToCSV,
  createTableResizeHandles,
} from '@trevixal/extension-table'

const editor = createEditor({
  schema: new Schema({ nodes: { ...defaultNodes(), ...tableNodes() }, marks: defaultMarks() }),
  element,
  keymap: tableKeymap(), // Tab / Shift+Tab move between cells, then fall through to code and list indent
})

editor.exec(insertTable({ rows: 3, cols: 3 }))
editor.exec(addRow('after'))
editor.exec(addColumn('before'))
editor.exec(toggleHeaderRow)
editor.exec(setCellBackground('#fff3cd'))
editor.exec(setTableBorders('outer'))
editor.exec(sortTable({ direction: 'asc' }))
editor.exec(insertTableFromCSV('a,b\n1,2'))
createTableResizeHandles(editor, { /* drag handles for columns and rows */ })
```

Merging is across columns only (`colspan`); rows do not span
([ADR-0006](docs/adr/0006-colspan-only-table-model.md)). Drag-resizing stores
proportions rather than pixels, so a table sized in fullscreen fits when the
window shrinks.

### Images with your own storage

The editor never talks to a storage provider directly: it holds an
`ImageStorage` and calls `upload`.

```ts
import {
  image, imageNodes,
  createFetchStorage, createS3PresignedStorage, createDataURLStorage,
  createObjectURLStorage, createFallbackStorage,
} from '@trevixal/extension-image'

// Schema: nodes: { ...defaultNodes(), ...imageNodes() }

const images = image(editor, {
  storage: createFetchStorage({ endpoint: '/api/uploads' }),
  // storage: createS3PresignedStorage({ sign: (file) => api.sign(file.name, file.type) }),
  // storage: createDataURLStorage(),                       // no server at all
  // storage: createFallbackStorage([cdn, createDataURLStorage()]),
  maxBytes: 5 * 1024 * 1024,
  accept: ['image/png', 'image/jpeg', 'image/webp', 'image/*'],
  compress: { maxDimension: 2048, quality: 0.85 },          // client-side, before upload; or false
  deleteOnRemove: true,
  onUpload: (status) => showProgress(status),               // uploading → done | error
  onError: (message) => toast(message),
})

images.pickFiles()
```

Any backend is a two-method object, `upload(file, { onProgress, signal })`
returning `{ url, key? }`, and `delete({ key })`. Dropping a file, pasting a
screenshot and the toolbar button all run one pipeline: validate → insert a
placeholder → upload → swap in the URL. The placeholder is found again **by
id, never by position**, so it survives edits made while the bytes are in
flight; a failed or cancelled upload leaves the document exactly as it was.
Commands: `insertImage`, `updateImage`, `setImageAlign`, `resizeImage`,
`setImageWidth`, `setImageAlt`, `toggleImageCaption`, `setImageCaption`,
`removeImage`; `transformImage` crops and rotates; `createImageResizeHandles`
and `createImageToolbar` add the on-canvas controls.

### Slash commands and emoji

Both ride on one trigger driver in core (`suggestionList`). `@trevixal/ui`
provides a default popup, or render your own from the `onState` callback.

```ts
import { slashCommand, defaultSlashCommands } from '@trevixal/extension-slash-command'
import { emoji } from '@trevixal/extension-emoji'
import { createSuggestionPopup } from '@trevixal/ui'

const slashPopup = createSuggestionPopup({
  editor,
  renderItem: (item) => item.title,
  onPick: (index) => slash.select(index),
  emptyLabel: 'No matching block',
})
const slash = slashCommand(editor, {
  items: [...defaultSlashCommands(), { id: 'table', title: 'Table', keywords: ['grid'], run: (e) => e.exec(insertTable({ rows: 3, cols: 3 })) }],
  onState: slashPopup.update,           // null = closed
})

const emojiPopup = createSuggestionPopup({ editor, renderItem: (i) => `${i.char} ${i.name}`, onPick: (n) => emojis.select(n) })
const emojis = emoji(editor, { onState: emojiPopup.update, minQueryLength: 1 })
```

The `/` trigger fires only at the start of a block; `:` fires after whitespace
anywhere. Filtering is a case-insensitive subsequence match that ranks prefix
matches first, then word boundaries, then any subsequence; emoji search ranks
an exact name above a prefix above a substring above a keyword. The trigger is
detected against the **document model**, never by inspecting the DOM.

### Syntax highlighting

```ts
import { codeHighlight, createHighlighter, createCopyCodeButtons, detectLanguage } from '@trevixal/extension-code-highlight'
import { createCodeLanguageSelect } from '@trevixal/ui'

const dispose = codeHighlight(editor, createHighlighter({ fallback: 'javascript' }))
createCopyCodeButtons(editor)                       // a copy button on every code block
createCodeLanguageSelect(editor, { /* floating picker above the block at the caret */ })
detectLanguage('def foo(self):')                   // → { language, score, margin }, or null when unsure
```

Twelve bundled rule sets (JavaScript, TypeScript, Python, HTML, CSS, JSON,
SQL, shell, Go, Rust, Java, Markdown) with the usual aliases. Every language
emits the same eleven `tvx-tok-*` classes, so a theme is a dozen colours. Wrap
Shiki, Prism or highlight.js behind the two-method `Highlighter` interface if
you prefer. Highlights are **decorations**: the stored document stays plain
text, only blocks whose code changed are re-tokenized, and the tokenizer is
held to a time budget on hostile input by its tests.

### Diagrams

```ts
import { diagram, createMermaidRenderer, loadMermaid, insertDiagram } from '@trevixal/extension-diagram'

const controller = diagram(editor, {
  render: createMermaidRenderer(await loadMermaid()),   // loads mermaid@11 from jsDelivr on first use
  languages: ['mermaid'],                                // which code-block languages get a preview
  debounceMs: 300,
})
editor.exec(insertDiagram())                             // a code block with `graph TD …` and a live preview
```

Any renderer works: `render(code, context) => Promise<SVG string>`. The
preview is appended under the code block by the view, never stored in the
document, which is why exports capture it separately (see
[What an export carries](#what-an-export-carries)).

### Equations

```ts
import { mathNodes, mathInputRules, insertMath, insertMathBlock, latexToMathML } from '@trevixal/extension-math'
import { defaultInputRules } from '@trevixal/core'

// Schema: nodes: { ...defaultNodes(), ...mathNodes() }
// Editor: inputRules: [...defaultInputRules(), ...mathInputRules()]   // enables `$…$`

editor.exec(insertMath('E = mc^2'))
editor.exec(insertMathBlock('\\int_0^1 x^2\\,dx = \\frac{1}{3}'))
latexToMathML('\\sqrt{a^2 + b^2}')   // → '<math>…</math>'
```

The converter is dependency-free: fractions, roots, sub/superscripts,
matrices, large operators with limits, accents, delimiters, spacing, Greek and
a symbol table of several hundred names. Pass `render` in `mathNodes()` to
swap in another engine.

### Structural blocks

```ts
import {
  blockNodes, blockKeymap, blockBindings,
  insertCallout, insertToggleBlock, insertColumns, insertCard, insertTimeline, insertPageBreak,
  insertBadge, insertButton, insertAnchor, insertFootnote, insertCitation, insertReferenceList,
  renumberCitations, insertTabs, insertAccordion,
} from '@trevixal/extension-blocks'

// Schema: nodes: { ...defaultNodes(), ...blockNodes() }
// Editor: keymap: blockKeymap()   // Enter on an empty trailing paragraph leaves the container;
                                   // Enter on a toggle summary / tab title / accordion title moves into the body
blockBindings(editor)              // click handling for tabs, toggles and accordions
editor.exec(insertCallout('warning'))
editor.exec(insertColumns(3))
editor.exec(insertTabs(2))
```

Tabs and accordions write their active state **into the document**
(`data-active`), which is what lets an exported page switch them.

### Media, attachments and link cards

```ts
import { embedNodes, insertEmbed, insertVideo, insertAudio, insertLinkCard, attachments, DEFAULT_IFRAME_HOSTS } from '@trevixal/extension-embed'

// Schema: nodes: { ...defaultNodes(), ...embedNodes({ allowIframeHosts: [...DEFAULT_IFRAME_HOSTS, 'player.example.com'] }) }
editor.exec(insertEmbed('https://www.youtube.com/watch?v=…'))   // detects YouTube / Vimeo / direct media / allowlisted iframe
const files = attachments(editor, { storage: myFileStorage, onUpload: (s) => showProgress(s) })
```

Every URL: pasted, typed or passed to a command, goes through one allowlist
(`safeEmbedSrc`, `safeMediaSrc`, `safeWebURL`), and credentials in a URL are
refused.

### Word and RTF, in and out

```ts
import { serializeToDOCX, serializeToRTF, parseDOCX, exportFormats, importFormats } from '@trevixal/extension-export'

const docx = await serializeToDOCX(editor.state.doc, { title: 'Report', theme: tokens, rendered })
const rtf  = serializeToRTF(editor.state.doc, { theme: tokens, rendered })
const doc  = await parseDOCX(editor.schema, file, { images: 'embed' })
```

`exportFormats()` and `importFormats()` return descriptors (`name`, `label`,
`extension`, `mime`, `serialize`/`parse`) that plug straight into the UI kit's
`exportDocument` / `importFile`. The ZIP writer and reader, the XML parser
and the OOXML/RTF writers are all in this package with no dependencies.

### Encryption, expiry and restrictions

```ts
import {
  encryptDocument, decryptDocument, isEncryptedEnvelope, createEncryptedStorage, createWebStorage,
  applyRestrictions, restrictionsAllow, isExpired, describeExpiry,
  WrongPasswordError, DocumentExpiredError,
} from '@trevixal/extension-security'

const envelope = await encryptDocument(editor.getJSON(), password, { expiresAt: Date.now() + 7 * 864e5 })
const { payload } = await decryptDocument(envelope, password)          // throws WrongPasswordError / DocumentExpiredError

const vault = createEncryptedStorage(createWebStorage(localStorage, 'app:'), password)  // a drop-in KeyValueStorage; the password may be an async getter

const release = applyRestrictions(editor, { copy: true, print: true }, { onBlocked: (action) => say(`${action} is blocked`) })
```

The envelope is `{ format: 'trevixal-encrypted', version: 1, kdf: 'PBKDF2-SHA256', iterations, salt, iv, cipher: 'AES-GCM', … }`;
the default is 310,000 rounds and a ceiling of 10,000,000 is enforced on what
an envelope may ask for. A print restriction swallows the print shortcut,
reports `beforeprint` as blocked, and injects a print-media rule that blanks
the surface if the dialog is opened another way.

### Writing assistance

```ts
import { createWritingAssistant, analyzeText, keywordDensity, goalProgress, setSpellcheck } from '@trevixal/extension-writing'

const assistant = createWritingAssistant(editor, {
  passive: true, repeated: true, grammar: true, longSentences: true,
  debounceMs: 400,
  onReport: (report) => renderIssues(report.issues),   // each issue: kind, range, message, suggestion?
})
assistant.applySuggestion(issue)                         // apply the fix, keeping the marks at the start of the range
const stats = analyzeText(editor.getText())              // words, sentences, syllables, Flesch, times, …
```

### Workspace

```ts
import { WorkspaceStore, createWebStorage, createDocumentTabs, createWorkspacePanel, createSplitView, defaultTemplates } from '@trevixal/extension-workspace'

const store = await WorkspaceStore.open(createWebStorage(localStorage, 'app:workspace:'))
const tabs  = createDocumentTabs(editor, store, { container: tabsHost })
createWorkspacePanel(editor, store, tabs, { container: panelHost, showRecent: true, showFavorites: true })
const split = createSplitView(editor, { container: paneHost, mode: 'preview' })   // or 'mirror' for a second live editor
```

`WorkspaceStore` offers `create`, `save`, `get`, `list`, `rename`, `move`,
`duplicate`, `remove`, `setFavorite`, `setPinned`, `touch`, `recent`,
`favorites`, `search`, and folder operations, over the same four-method
`KeyValueStorage` interface the autosave and the encrypted vault use.

### Code formatting

```ts
import { formatCodeBlock, minifyCodeBlock, formatJSON, formatXML } from '@trevixal/extension-format-code'
editor.exec(formatCodeBlock('json'))   // reformats the code block at the caret, in place, as one undo step
editor.exec(minifyCodeBlock('xml'))
```

### Track changes

```ts
import { TrackChanges, trackChangesMarks, createTrackChangesBar } from '@trevixal/extension-track-changes'

// Schema: marks: { ...defaultMarks(), ...trackChangesMarks() }
const track = new TrackChanges(editor, { author: 'ada' })
track.enable()               // typing → <ins data-trevixal-author="ada" data-trevixal-timestamp="…">
                             // deleting → the text stays, wrapped in <del …>
track.suggestions()          // [{ path, from, to, kind, author, timestamp }]
track.acceptAll(); track.rejectAll(); track.acceptAt(position); track.rejectAt(position)
createTrackChangesBar(editor, track, { container: reviewHost, author: 'You' })
```

Suggestion mode is a **dispatch transform**: it rewrites each transaction
before it applies, so every other command keeps working unchanged. Known
limit: structural edits (Enter, block joins) while suggesting are not tracked.

## Core API reference

Everything below is exported from `@trevixal/core` ([`index.ts`](packages/core/src/index.ts)).

### The editor facade

```ts
createEditor(options: EditorOptions): Editor
```

| `EditorOptions` | |
| --- | --- |
| `schema` | required, `new Schema({ nodes, marks })` |
| `content` / `doc` | initial content as `DocJSON` or an `EditorNode` |
| `element` | mount point; omit for headless |
| `autofocus`, `placeholder`, `editable`, `spellcheck`, `maxLength` | surface behaviour |
| `keymap` | extra bindings that win over `baseKeymap()` |
| `inputRules` | replaces `defaultInputRules()` |
| `nodeViews` | `{ [nodeName]: NodeViewFactory }`, framework components inside the document |
| `onChange({ editor, json, html })` | after every document change |
| `history` | `{ groupDelay?, depth? }` |

| `Editor` | |
| --- | --- |
| `state`, `schema`, `view`, `commands`, `isDestroyed`, `isEditable` | |
| `exec(command)` · `dispatch(tr)` · `chain()` | run a `Command`, apply a `Transaction`, or build one fluently |
| `onTransaction(listener)` · `addDispatchTransform(fn)` · `on('transaction' \| 'update' \| 'selectionUpdate', fn)` · `subscribe(fn)` | events; each returns an unsubscribe |
| `getSnapshot()` | reference-stable `EditorSnapshot` (`activeMarks`, `markAttrs`, `blockType`, `blockAttrs`, `listType`, `align`, `indent`, `canUndo`, `canRedo`, `selectionEmpty`) the `useSyncExternalStore` contract |
| `undo()` · `redo()` · `canUndo` · `canRedo` · `historyEntries()` · `clearHistory()` | |
| `setContent(json \| node, { addToHistory? })` · `getJSON()` · `getHTML()` · `getText()` | |
| `getCharacterCount()` · `getWordCount()` · `getSentenceCount()` · `getParagraphCount()` | |
| `setEditable(bool)` · `setSpellcheck(bool)` · `isActive(markName)` · `destroy()` | |

**`editor.commands`**: `insertText`, `deleteSelection`, `toggleMark`,
`setMark`, `unsetMark`, `setFontFamily`, `setFontSize`, `setTextColor`,
`setBackgroundColor`, `setLink`, `unsetLink`, `clearFormatting`,
`clearBlockFormatting`, `clearAllFormatting`, `setTextAlign`, `setLineHeight`,
`setParagraphSpacing`, `setLetterSpacing`, `toggleSmallCaps`, `convertCase`,
`indent`, `outdent`, `setBlockAttrs`, `setBlockType`, `setParagraph`,
`setHeading`, `splitBlock`, `joinBackward`, `insertHardBreak`,
`insertHorizontalRule`, `wrapIn`, `toggleBulletList`, `toggleOrderedList`,
`toggleTaskList`, `toggleTaskChecked`, `setListStyle`, `setListNumbering`,
`unwrapList`, `restartNumbering`, `continueNumbering`,
`continueNumberingFromPrevious`, `splitListItem`,
`sinkListItem`, `liftListItem`, `setCodeBlock`, `lift`, `selectAll`, `undo`,
`redo`. Each returns `boolean`.

**`editor.chain()`**: `focus()`, `command(cmd)`, `insertText()`,
`toggleMark()`, `setBlockType()`, `setHeading()`, `setParagraph()`, then
`run()`.

### Model

`EditorNode` (alias `Node`), `TextNode`, `Fragment`, `Mark`, `Schema`,
`NodeType`, `MarkType`, `NodeSpec`, `MarkSpec`, `HTMLSpec`, `ParseRule`,
`Attrs`. Positions are `{ path: number[], offset }`
([ADR-0001](docs/adr/0001-path-offset-positions.md)), `pos`,
`resolvePosition`, `comparePositions`, `clampPosition`, `nodeAtPath`,
`updateAtPath`, `parentPathOf`. Inline helpers: `inlineLength`,
`sliceInline`, `replaceInline`, `applyInlineMark`, `marksAtInlineOffset`,
`rangeHasMark`. Content expressions: `parseContentExpr`, `matchesContent`
([ADR-0002](docs/adr/0002-greedy-content-expressions.md)). `normalizeDoc`
repairs an invalid tree deterministically. `nodeFromJSON`, `markFromJSON`,
`DocJSON`.

### State, steps and selections

`EditorState`, `Transaction`, `validateSelection`. Nine step classes, each
self-invertible and carrying its own position mapper
([ADR-0003](docs/adr/0003-primitive-steps-over-monolithic-replace.md)):
`ReplaceInlineStep`, `ReplaceNodesStep`, `AddMarkStep`, `RemoveMarkStep`,
`SetNodeAttrsStep`, `SplitNodeStep`, `JoinNodesStep`, `WrapNodesStep`,
`LiftNodesStep`. Selections: `TextSelection`, `NodeSelection`,
`AllSelection`, `selectionNear`. Transaction meta keys: `ADD_TO_HISTORY`
(`false` keeps a transaction out of history), `NEW_HISTORY_GROUP`,
`HISTORY_LABEL`.

### Commands as functions

A `Command` is `(state) => Transaction | null`. All of `editor.commands` are
exported as plain functions too: `toggleMark`, `setBlockType`, `wrapIn`,
`lift`, `splitBlock`, `joinBackward`, `joinForward`, `deleteSelection`,
`insertText`, `insertContent`, `insertBlockAfter`, `insertInlineNode`,
`toggleList`, `splitListItem`, `sinkListItem`, `liftListItem`,
`toggleTaskList`, `toggleTaskChecked`, `setListStyle`, `setListNumbering`,
`unwrapList`, `listNumberingAt`, `restartNumbering`, `continueNumbering`,
`setTextAlign`, `indentBlocks`, `convertCase`,
`toggleSmallCaps`, `setLetterSpacing`, `setLineHeight`,
`setParagraphSpacing`, `clearFormatting`, `clearAllFormatting`, `selectAll`,
the code-block set (`typeInPreformatted`, `insertNewlineInPreformatted`,
`splitBlockInPreformatted`, `deleteBackwardInPreformatted`,
`indentInPreformatted`, `outdentInPreformatted`, `exitPreformatted`), links
(`linkifyText`, `insertEmailLink`, `isEmailAddress`, `removeLink`,
`setLinkTarget`), plus `chainCommands` to try several in order.

### Input rules, search, counts, history, suggestions, format painter

- `defaultInputRules({ autolink?, inlineCode?, emDash? })`, `applyInputRules`, `InputRule`
- `findMatches(doc, query, { caseSensitive? })`, `replaceMatch`, `replaceAll`, regular-expression search is layered on top by the UI kit's `compileSearch` and `createFindReplace`
- `wordCount`, `characterCount`, `sentenceCount`, `paragraphCount`
- `History`, `HistoryEntry`, `HistoryOptions`
- `findTrigger`, `suggestion`, `suggestionList`, the driver behind slash and emoji, reusable for `@`-style triggers
- `FormatPainter` (`copy`, `copyAndLock`, `apply`, `cancel`, `state`), `formatFromSnapshot`, `describeFormat`

### Serializers and sanitizers

`serializeToHTML(node, { renderNode? })`, `serializeToHTMLDocument(doc, {
title, styleSheets, scripts, baseURL, inlineCSS, inlineJS, lang, theme,
renderNode })`, `serializeToText`, `serializeToMarkdown`, `parseHTML(schema,
html)`, `parseMarkdown`, `escapeHTML`, `escapeMarkdown`.

Value sanitizers every schema uses: `safeHref`, `safeImageSrc`, `safeColor`,
`safeLength`, `safeLineHeight`, `safeCSSValue`, `safeElementId`,
`safeFontFamily`, `safeLanguageName`. `parseHTML` runs inside an inert
`<template>` through allowlisted `parseHTML` rules; a rule returning `false`
drops the element **and its subtree**, and dangerous tags are dropped unless a
schema claims them.

### Schema preset

`defaultNodes()`: `doc`, `paragraph`, `heading`, `blockquote`, `codeBlock`,
`horizontalRule`, `hardBreak`, `bulletList`, `orderedList`, `listItem`,
`taskList`, `taskItem`, `text`. Block nodes carry `align`, `indent`,
`lineHeight`, `spaceBefore`, `spaceAfter` (`blockLayoutAttrs`,
`blockLayoutHTML`, `parseBlockLayout`, `MAX_INDENT`).
`defaultMarks()`: `bold`, `italic`, `underline`, `strikethrough`, `code`,
`link`, `highlight`, `subscript`, `superscript`, `fontFamily`, `fontSize`,
`textColor`, `backgroundColor`, `smallCaps`, `letterSpacing`.
`LIST_STYLES`, `BULLET_LIST_STYLES`, `ORDERED_LIST_STYLES`, `listStylesFor`.

Multilevel list numbering: `LIST_NUMBERING_SCHEMES` (`default` 1. a. i.,
`parenthesis` 1) a) i), `outline` 1. 1.1. 1.1.1., `roman-outline` I. A. 1.,
`symbols` ❖ ➢ ▪), `DEFAULT_LIST_NUMBERING`, `listNumberingScheme`,
`listNumberingOf`, `storedNumbering`, `storedNumberingsFor`, `levelMarker`,
`listMarker`, `formatListCounter`. A scheme is stored once, in the outermost
list's `numbering` attr (written as `data-numbering`), and every list nested
under it takes the marker for its depth, so an item indented later follows it
with nothing written to the new list. The Word and RTF writers and the
toolbar gallery all read this one table.

### View

`EditorView`, `EditorViewOptions`, `DOMRenderer`, `DecorationSource`,
`InlineDecoration`, `NodeViewFactory`, `NodeViewConstructor`,
`view.setDecorationLayer(key, source)`: each extension owns a key so layers
compose. `view.renderer.modelOf` maps a rendered element back to its node.
`domPointFromPosition`, `positionFromDOMPoint`, `pathOfElement`.
`baseKeymap()`, `keydownHandler`, `normalizeKeyName`, `Mod` is Cmd on macOS
and Ctrl elsewhere.

## UI kit reference

Everything below is exported from `@trevixal/ui` ([`index.ts`](packages/ui/src/index.ts)).

| Area | Exports |
| --- | --- |
| Chrome | `createEditorUI`, `createMenubar` + `defaultMenus`, `createToolbar` + `defaultToolbarGroups` + `defaultToolbarItems`, `createStatusBar` |
| Controls | `createSelectControl`, `createColorControl` (`DEFAULT_SWATCHES`), `createTableGridControl`, `defaultBlockFormats`, `defaultFontFamilies` (Open Sans, System UI, Arial, Georgia, Times New Roman, Courier New, Verdana, Tahoma), `defaultFontSizes` (8-48 pt), `applyBlockFormat`, `blockFormatValue` |
| Primitives | `createDropdown`, `bindListNavigation`, `focusFirstItem`, `createIcon` + `iconNames()` (154 icons) |
| Popups and dialogs | `createSuggestionPopup`, `openDialog`, `openConfirmDialog`, `openInfoDialog`, `openCharacterPicker` (`SPECIAL_CHARACTERS`) |
| Code | `createCodeLanguageSelect` (floating picker with detection), `createTableToolbar` (floating table controls) |
| Navigation | `createTableOfContents`, `createDocumentOutline` + `defaultOutlineBlockKinds`, `createFindReplace` + `compileSearch` + `findAll`, `createCommandPalette` + `paletteCommandsFromMenus` + `filterCommands` + `fuzzyScore`, `createHistoryPanel` |
| Shortcuts | `createShortcutManager({ actions, overrides?, onChange?, scopes?, isMac? })`, `openShortcutsDialog`, `formatShortcut`, `parseShortcut` |
| View modes | `createFocusMode`, `createTypewriter`, `createFullscreenToggle`, `setEditorWidth` + `EDITOR_WIDTHS` (narrow 38rem, normal 48rem, wide 64rem, full) |
| Files | `builtinExporters({ scripts? })` (html, markdown, text, json), `builtinImporters()`, `exportDocument`, `importFile`, `importerFor`, `acceptFor`, `pickFile`, `readFileText`, `downloadFile`, `suggestFileName`, `documentTitle`, `selectionDocument`, `textToDocument`, `printDocument`, `openPrintPreview`, `printableHTML`, `editorTheme` |
| Source modes | `createSourceMode(editor, { format: 'markdown' \| 'html' })` |
| Persistence | `createAutosave(editor, { storage, key?, delayMs?, backups?: { intervalMs?, keep? } \| false, onState? })`, `createAutosaveIndicator`, `offerDraftRecovery`, `openBackupsDialog`, `createWebStorage`, `createMemoryStorage`, `formatSavedAt` |
| Theming | `createThemeController(document, { targets?, mode?, preset?, presets?, onChange? })`, `defaultThemePresets`, `buildCustomTheme` + `CUSTOM_THEME_TOKENS`, `readThemeSnapshot`, `createFontManager` + `googleFontURL`, `createCustomStyles` + `scopeCSS`, `createPageView` + `PAGE_SIZES`, `parseColor`, `isDarkColor`, `mixColors` |
| Quick tools | `createQuickInsertControl`, `createRecentToolsControl`, `createToolUsageTracker`, `openCustomizeToolbarDialog`, `applyGroupOrder`, `bindGroupReorder`, `groupOrder` |
| Export support | `collectDocumentCSS`, `captureRenderedBlocks`, `rasterizeDiagrams`, `renderedNodeHTML`, `documentBehaviourScript` |

## Styling and theming

`@trevixal/ui` ships a compiled stylesheet and its SCSS sources:

```ts
import '@trevixal/ui/styles.css'   // everything, compiled
// or compose from source:  @use '@trevixal/ui/scss/tokens';
```

- Wrap the editor in an element with the class **`trevixal`**; the content
  surface is `.trevixal-content`. Class names follow BEM:
  `trevixal-<block>__<element>--<modifier>`.
- Every colour and size is a CSS custom property `--tvx-*`, so overrides need
  no build step: `.trevixal { --tvx-color-accent: rebeccapurple; }`. In SCSS,
  `t.token('space-2')` compiles to `var(--tvx-space-2)`; tokens live in
  [`_tokens.scss`](packages/ui/src/styles/_tokens.scss).
- **Dark mode** follows `prefers-color-scheme` and can be forced with
  `data-trevixal-theme="dark"` (or `"light"`); a preset is applied with
  `data-trevixal-preset="nord"` and a runtime `<style>` the theme controller
  writes. Everything but `.trevixal` in the base theme rules sits in
  `:where()`, capping them at one class of specificity so a preset can win.
- **The palette also sets `color-scheme`**, which is what the browser reads
  for everything it draws itself, scrollbars, form controls, the canvas
  behind them. Tokens alone reach none of that, and without it a dark editor
  sits beside a bright white scrollbar. On top of it every surface gets a
  slim bar in the theme's own colours: `scrollbar-width`/`scrollbar-color`
  inherit, so one declaration on the editor root reaches every scroller under
  it. Exported and previewed pages are separate documents and carry their own
  copy of the same rules.
- The partials: `_tokens`, `_themes`, `_editor`, `_chrome`, `_toolbar`,
  `_navigation`, `_blocks`, `_features`, `_extensions`, composed by
  `index.scss`. Design tokens live in `@trevixal/ui` only
  ([ADR-0004](docs/adr/0004-scss-tokens-in-ui-only.md)); core emits semantic
  HTML and never inlines presentational styles.
- **Two rules the kit holds itself to**, because exports read styles back out
  of the CSSOM: never fill a control with a *border* colour (a high-contrast
  palette may make it the same ink as the text), and never put a `var()` in a
  shorthand that a longhand then overrides. That pair cannot be serialized
  back out, and the declaration vanishes from every saved page. Write the
  longhands. A browser test reads the whole exported stylesheet and fails on
  any empty declaration.

## What an export carries

An export is a page, not a screenshot: anything the editor drove with
JavaScript, and anything it *drew* rather than stored, has to be carried
deliberately. The kit does, end to end:

| Concern | How |
| --- | --- |
| **Theme** | `readThemeSnapshot` reads the resolved `--tvx-*` values off the live editor (whichever of preset, custom theme, host CSS or system preference won) and `ExportContext.theme` hands them to every exporter. HTML writes them as resolved values on `:root, .trevixal` (attributes alone lose a specificity coin-toss), paints `html, body`, sets `color-scheme`, and adds `print-color-adjust: exact` so "Save as PDF" keeps backgrounds. DOCX writes `w:background` plus the `word/settings.xml` that makes Word draw it; RTF shades every paragraph and restates the ink after each `\plain`. |
| **Styles** | `collectDocumentCSS` serializes the editor's own rules from every stylesheet the page parsed, so a saved file does not depend on a dev server being up. |
| **Highlighted code and diagrams** | Neither is in the document, highlighting is a decoration layer, a preview is an appended element. `captureRenderedBlocks` reads both back through `view.renderer.modelOf`, `rasterizeDiagrams` turns each SVG into a PNG for the binary formats, and `renderNode` on `serializeToHTML` emits them for the page. The drawing replaces the source it was drawn from; if nothing drew, the source stays. |
| **Behaviour** | `documentBehaviourScript` is inlined: tab strips switch on click and arrow keys, and a YouTube frame becomes a link when the page is not served over http(s), YouTube refuses to play for a page with no origin; Vimeo and plain iframes are left alone because they work. Printing reveals every tab panel and open toggle. |
| **Images in RTF** | `\pict\pngblip`, so ordinary images embed rather than degrading to `[alt]`. |

## Architecture

Three things are worth reading before changing anything in `@trevixal/core`:
the rules the engine will not bend, the path a keystroke takes from the
keyboard to the screen, and the handful of mechanisms that are not obvious
from the type signatures.

### Principles that do not bend

1. **The DOM is never the source of truth.** State is an immutable
   `EditorState { doc, selection, storedMarks }`; the contenteditable surface
   is a render target and an input source only.
2. **Everything is a `Transaction`**: an ordered list of invertible steps.
   Undo and redo fall out of step inversion; there is no second bookkeeping
   system.
3. **Every step remaps positions**, so selections, decorations and suggestion
   ranges survive arbitrary edits.
4. **Documents are schema-validated**, with a deterministic normalization pass.
5. **Core is pure, portable, strict TypeScript**: no framework code, no DOM
   access at module top level (SSR-safe), no `any` in the public API,
   `sideEffects: false`.
6. **No runtime dependencies in anything shipped.** The schema system,
   transactions, undo, sanitizer, DOM reconciler, fuzzy search, emoji data,
   ZIP, XML, OOXML, RTF and MathML are all written in this repository.

### Data flow

```
        keydown / beforeinput / paste / IME composition / MutationObserver
                                    │
                                    ▼
                  intent → Command(state) → Transaction | null
                                    │
                    dispatch transforms may rewrite it
                    (e.g. suggestion mode turns a delete into a strike)
                                    │
                                    ▼
              EditorState.apply(tr)  →  a new immutable EditorState
                                    │
           ┌────────────────────────┼─────────────────────────┐
           ▼                        ▼                         ▼
   History records            onTransaction             DOMRenderer diffs
   inverted steps             listeners: outline,       model → DOM, keyed,
   in undo groups             autosave, writing         with structural sharing
                              checks, diagrams
```

### Key mechanisms

- **Input pipeline** ([ADR-0005](docs/adr/0005-beforeinput-first-input-pipeline.md)):
  `beforeinput` is intercepted and translated to commands; IME composition
  lets the DOM lead and reconciles at `compositionend`; a MutationObserver
  performs prefix/suffix text-diff repair for anything unexpected,
  autocorrect, browser extensions. Enter and Backspace ride on `beforeinput`;
  the keymap handles marks, undo/redo, Tab and `Mod-Enter`.
- **Positions** ([ADR-0001](docs/adr/0001-path-offset-positions.md)) are a
  child-index trail plus an inline offset; text nodes contribute their length
  and inline atoms count as one.
- **Steps** ([ADR-0003](docs/adr/0003-primitive-steps-over-monolithic-replace.md))
  are small primitives rather than one monolithic replace; a property test
  applies random steps, inverts them and checks the document is restored,
  200 times per run.
- **Clipboard** writes `text/html`, `text/plain` and a lossless
  `application/x-trevixal+json`; `Mod-Shift-V` pastes plain; pasting into a
  code block inserts plain text.
- **Decorations, not document pollution** ([ADR-0008](docs/adr/0008-extension-points.md)):
  search highlights, code tokens, writing marks and diagram previews render
  through named, composable decoration layers or appended elements; none are
  stored.
- **Adapter contract** ([ADR-0007](docs/adr/0007-adapter-contract.md)): the
  editor DOM lives *outside* framework reconciliation; toolbars subscribe to
  reference-stable snapshots, so typing never re-renders host component trees.
- **Extension points** ([ADR-0008](docs/adr/0008-extension-points.md)): every
  extension is built on `onTransaction`, `addDispatchTransform`,
  `setDecorationLayer` and the `suggestion` trigger module, plus schema
  merging, `keymap`, `inputRules` and `nodeViews`. No private access anywhere.
- **Chrome composition** ([ADR-0010](docs/adr/0010-editor-chrome-and-storage.md)):
  the UI kit depends on no extension; hosts inject capabilities, and unwired
  entries drop out of the menus.

## Repository layout

```
trevixal-editor/
├── packages/
│   ├── core/                        # the engine
│   │   └── src/ model/ state/(steps/) commands/ history/ input-rules/ search/
│   │            serialize/ suggest/ schema/ view/ editor/
│   ├── ui/                          # chrome, dialogs, themes, persistence, export plumbing
│   │   └── src/styles/              #   _tokens _themes _editor _chrome _toolbar _navigation _blocks _features _extensions
│   ├── editor-kit/                  # every package above and below, assembled into one call
│   │                                #   plus a one-script-tag build of the lot
│   ├── react/  vue/  svelte/  angular/  web-component/
│   ├── extension-blocks/            extension-code-highlight/   extension-diagram/
│   ├── extension-embed/             extension-emoji/            extension-export/
│   ├── extension-format-code/       extension-image/            extension-math/
│   ├── extension-security/          extension-slash-command/    extension-table/
│   ├── extension-track-changes/     extension-workspace/        extension-writing/
│   └── e2e/                         # Playwright specs (tests/) and built test pages (page/)
├── examples/                        # every one runs with `pnpm i && pnpm dev`
│   ├── full-editor/                 # the assembled editor, mounted in five lines of configuration
│   ├── react/  vue/  svelte/        # the same, from each framework's lifecycle, plus its adapter's own demo
│   ├── angular/                     # signals, zoneless; the one package here on TypeScript 6
│   ├── next/                        # App Router, a client-only island, and a Vercel deployment
│   ├── nuxt/  sveltekit/            # prerendered pages that mount the editor in the browser
│   ├── solid/                       # proof that no adapter package is needed to mount it
│   ├── vanilla-cdn/                 # the kit from one script tag, with no npm and no bundler
│   └── ssr/                         # Node renders the words; the browser builds the editor over them
├── docs/                            # the documentation site (VitePress)
│   └── adr/                         # ten architecture decision records
├── benchmarks/                      # keystroke latency and serialization, with a budget
├── scripts/size-budget.mjs          # bundle size ceilings, measured and enforced
├── turbo.json                       # the task graph: what depends on what, and what caches
├── .changeset/                      # changesets config (versioning)
├── CODE_OF_CONDUCT.md               # Contributor Covenant 2.1
├── biome.json  tsconfig.base.json  pnpm-workspace.yaml  package.json
└── LICENSE                          # Apache-2.0
```

Each package is `src/` + `test/` + `tsup.config.ts` + `package.json`, building
to a gitignored `dist/`. `packages/e2e/page/*.js` and `ui-styles.css` are
committed build artefacts the browser tests load.

## Design decisions

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](docs/adr/0001-path-offset-positions.md) | Path + offset document addressing | Accepted |
| [0002](docs/adr/0002-greedy-content-expressions.md) | Greedy sequential content expressions | Accepted |
| [0003](docs/adr/0003-primitive-steps-over-monolithic-replace.md) | Primitive step set instead of a monolithic ReplaceStep | Accepted |
| [0004](docs/adr/0004-scss-tokens-in-ui-only.md) | SCSS design tokens live in `@trevixal/ui` only | Accepted |
| [0005](docs/adr/0005-beforeinput-first-input-pipeline.md) | beforeinput-first input pipeline with diff-based DOM repair | Accepted |
| [0006](docs/adr/0006-colspan-only-table-model.md) | Colspan-only table cell merging | Accepted |
| [0007](docs/adr/0007-adapter-contract.md) | Adapter contract: editor DOM outside framework reconciliation | Accepted |
| [0008](docs/adr/0008-extension-points.md) | Extension points: transforms, transaction events, decoration layers, triggers | Accepted |
| [0009](docs/adr/0009-collab-binding.md) | Collab binding, character-level text CRDT, block-granular structure | **Superseded**, collaboration removed 2026-09-12 |
| [0010](docs/adr/0010-editor-chrome-and-storage.md) | Editor chrome composition and pluggable image storage | Accepted |

## Development guide

Everything here runs against this checkout; workspace packages link to each
other through `workspace:` ranges, so nothing is fetched from npm. Read [Four conventions that cost time when
met by surprise](#four-conventions-that-cost-time-when-met-by-surprise) before
your first commit; each one has cost somebody an afternoon.

### First-time setup

```sh
git clone git@github.com:adityabhalsod/trevixal-editor.git
cd trevixal-editor
corepack enable        # activates pnpm 11.24.0, the pinned version
pnpm install
pnpm build             # tsup: ESM + CJS + d.ts per package; sass for @trevixal/ui; the CDN bundle; the e2e pages
```

### Running the unit tests

```sh
pnpm test                                  # every package, through turbo, cached
pnpm test:all                              # the same with no cache and no early exit
pnpm --filter @trevixal/core test          # one package
pnpm --filter @trevixal/core test:watch    # watch, core is the only package with this script
pnpm --filter @trevixal/ui exec vitest run test/toolbar.test.ts   # one file
pnpm coverage                              # v8 coverage, @trevixal/core
```

`pnpm test` is the one to run while the tree is green: it caches per package
and stops at the first failure. The moment anything is red, switch to
`pnpm test:all`: it reports every failing package rather than the first, and
bypasses turbo entirely, which is also what to reach for when you suspect the
cache rather than the code.

Turbo builds each package's dependencies first, so `pnpm test` needs no
`pnpm build` in front of it. A bare `pnpm --filter <pkg> test` does not: it
reads its dependencies' `dist/`, so build them first or you are testing the
last build.

### Formatting your changes

`pnpm lint` and `pnpm lint:fix` are defined, and both fail on this checkout,
not because the code is wrong, but because every file is CRLF on disk and
Biome counts that as a format error. See
[convention 2](#four-conventions-that-cost-time-when-met-by-surprise).

To see what Biome thinks of a file, lint it by name: `lint` only, never
`check` or `format --write` over a directory:

```sh
pnpm exec biome lint packages/ui/src/toolbar.ts
```

To actually format one, pass it through Biome as **stdin** with its line
endings stripped, then put them back. Biome never sees a CR, so it has nothing
to complain about and nothing to rewrite:

```sh
f=packages/ui/src/toolbar.ts
tr -d '\r' < "$f" | pnpm exec biome check --write --stdin-file-path="$f" \
  | sed 's/$/\r/' > "$f.fmt" && mv "$f.fmt" "$f"
```

`--stdin-file-path` is what tells Biome which language and which config
section apply, so the file keeps this repo's single quotes, no semicolons and
sorted imports. `check` rather than `format` because it also applies
`organizeImports`. Confirm with `grep -c $'\r' "$f"` that the line endings
survived. A file that comes back LF turns a two-line change into a
whole-file diff.

### Four conventions that cost time when met by surprise

1. **Examples and browser tests read `dist/`, not `src/`.** After editing a
   package, `pnpm --filter @trevixal/<pkg> build` (and
   `pnpm --filter @trevixal/e2e build` to re-bundle the test pages) or you
   will keep looking at stale code. `@trevixal/ui` typechecks against core's
   `dist` too.
2. **Line endings make `biome check` useless.** The repo is checked out with
   `core.autocrlf=true` and no `.gitattributes`, so Biome reports every CRLF
   file as a format error. Lint only the files you changed, and only with
   `lint`: `pnpm exec biome lint packages/ui/src/toolbar.ts`. Never run
   `biome check` or `biome format --write` over a directory, and never
   rewrite line endings. The diff would swamp every review that follows.
   Biome also rejects literal control characters in source, regexes included;
   write `\u00XX` escapes.
3. **`pnpm test` stops at the first failing package, and caches.** While
   anything is red, `pnpm test:all` and `pnpm typecheck:all` report every
   failure and bypass turbo entirely, which is also what to reach for if you
   ever suspect the cache rather than the code.
4. **Browser tests run from `packages/e2e` against the Chrome on the machine**
   with the committed `playwright.local.config.ts` (one project,
   `channel: 'chrome'`, `--no-sandbox`, the sandbox cannot open under WSL or
   in a container). `playwright.config.ts` beside it declares Chromium,
   Firefox and WebKit on Playwright's own browsers and is what a CI job would
   run; `pnpm --filter @trevixal/e2e exec playwright install` fetches them.

### Adding things

- **A node or mark type**: write a `NodeSpec`/`MarkSpec` (content expression,
  `toHTML`, `parseHTML` with `getAttrs` returning sanitized values) and merge
  it into the schema. `HTMLSpec.innerHTML` is *trusted markup* for atoms; only
  ever build it from escaped values. `extension-math` and `extension-table`
  are compact references.
- **A menu entry**: add it to `defaultMenus()` (or pass your own `menus`),
  give it an icon, and wire its action in `createEditorUI`. An entry with no
  action is dropped, by design. Add a `ShortcutAction` if it has a key, so the
  printed shortcut and the real binding cannot disagree. Then add it to the
  browser test that opens every menu.
- **A shortcut**: through `createShortcutManager`, never a bare keymap entry.
  The manager owns the keys, prints the labels, swallows the old default
  when a user rebinds, and offers `alternateKeys`.
- **An interactive block**: decide what it does in an export before writing
  it, `<details>` survives because the browser owns it; a tab strip needed a
  script. Add the `@media print` rule too, or the PDF quietly loses whatever
  is not on top.
- **A decoration layer**: pick a unique key for `setDecorationLayer`; layers
  compose, and two extensions sharing a key clobber each other.

### Verifying a change

```sh
pnpm --filter @trevixal/<pkg> build
pnpm --filter @trevixal/<pkg> test
pnpm -r --no-bail run typecheck
pnpm exec biome lint <the files you touched>
cd packages/e2e && pnpm exec playwright test -c playwright.local.config.ts
```

For a regression test, prove it fails against the broken code (revert or
neuter the fix, rebuild, watch it fail, restore) before trusting it.
For anything visual, measure: screenshot and read pixels, or render the real
`.docx`/`.rtf`/PDF; the project notes record several bugs that were only
visible that way.

## Testing

Every number here is from a run on this checkout, on the date at the top of
this file. Two suites, split by what they can actually see: anything that
needs a real browser (layout, scroll anchoring, focus, composition, printing,
a `.docx` read back) is a browser test, and everything else is a unit test.

### Unit tests: 2,171 across 23 packages

| Package | Tests | Package | Tests |
| --- | ---: | --- | ---: |
| core | 511 | extension-security | 61 |
| extension-export | 301 | extension-track-changes | 50 |
| ui | 179 | extension-format-code | 34 |
| extension-workspace | 142 | extension-diagram | 32 |
| extension-writing | 121 | web-component | 28 |
| extension-math | 118 | extension-slash-command | 20 |
| extension-embed | 110 | extension-emoji | 20 |
| extension-blocks | 105 | vue | 19 |
| extension-table | 104 | react | 17 |
| extension-image | 95 | full-editor | 14 |
| extension-code-highlight | 70 | angular | 12 |
| | | svelte | 8 |

Vitest, with happy-dom where a DOM is needed.

Among them: a randomized **step-inversion property test** (apply → invert →
apply restores the document, 200 iterations); an **XSS corpus** in
`parse-html.test.ts` (script tags, event-handler attributes, `javascript:`
and `data:` URLs, SVG payloads, nested and obfuscated variants) parsed in an
inert template through the allowlist; a **tokenizer time budget** on hostile
20,000-character inputs for every bundled grammar; the adapter test that a
non-subscribing React sibling renders **zero** times while typing; SSR import
tests for React, Vue and the web component; and the `review-2.test.ts` files, which were written
as hypotheses by review passes and then corrected against real behaviour.

### Browser tests: 156 across 18 specs

| Spec | Tests | Covers |
| --- | ---: | --- |
| `feature-set.spec.ts` | 35 | The built demo through its own menus: every new node kind renders; every menu offers its features; tabs switch and write to the document; theme presets repaint; the shortcut manager rebinds; statistics; passive voice; the review bar; autosave; spell check toggles, reports and re-checks; menu labels stay readable in every theme; every entry has an icon; the palette matches the menus; menus stay on one line and on screen; a real `.docx` reads back; **exports carry the theme, the highlighting and the diagram** to the page and to Word; a saved page works from disk; print preview prints the theme and reveals tabs; Markdown export; slash `/tab` → table; emoji `:smi`; new-tab links carry `rel="noopener noreferrer"`; protection encrypts the autosave; a blocked copy says so; the sidebar comes and goes with its panels; read-only locks and unlocks; a Word paste arrives without its stylesheet and a Google Docs paste is not bold end to end |
| `full-editor-example.spec.ts` | 11 | The demo boots on its seeded document with its complete chrome; the cell toolbar appears only inside a table and offers every operation; the language picker floats over the block at the caret and lists every language; every menu item has an icon; code highlights; the format painter copies formatting |
| `editor-ui.spec.ts` | 11 | Every control renders and drives the editor: a menu opens, runs and closes; the block, font-size and colour controls; alignment and indent; the table grid; the link dialog and character picker; image upload with progress; the status bar; clear formatting |
| `chrome-state.spec.ts` | 11 | The chrome tells the truth about itself and stays where it was put: menus report what is on; the command palette leaves the page where it found it; every scrollbar follows the theme; both split panes show what the editor shows, diagrams, colours, tab strips and all; **the two panes scroll together**; a typed space appears at once; typing rewrites no attribute on a block it did not touch |
| `chrome-polish.spec.ts` | 11 | Visual polish: the whole page switches theme; task-checkbox, toggle-header and dropdown-label spacing; the toggle chevron rotates; help opens in a themed dialog; a slim, sticky sidebar; a code block with no language still highlights; the table toolbar moves, swaps and resizes rows and columns |
| `examples.spec.ts` | 10 | Every example app, actually run, React, **Next.js** on its own server, Vue, Nuxt, Svelte, SvelteKit, Angular, Solid, the CDN page and the server-rendered build. Each is checked twice over: that the assembled editor came up exactly once from that page's lifecycle and takes typing, and that the one thing the example exists to show still holds. The prerendered and server-rendered ones are also fetched as text, to confirm the prose is in the HTML and the chrome is not |
| `table-resize.spec.ts` | 10 | Dragging a column border, a row edge and the corner handle; minimum widths; Escape abandons a drag; a resize is one undo step; a table sized in a wide window still fits a narrow one |
| `responsive-editing.spec.ts` | 8 | The chrome wraps at 380 and 320 px without scrolling; code-block Tab/Enter; slim scrollbars on every dropdown; exported pages carry their own CSS with no empty declarations |
| `code-block.spec.ts` | 7 | Editing code: Enter keeps indentation, `Ctrl+Enter` leaves the block, brackets and quotes close themselves and Enter between them opens a block, no spell check inside code, the copy button |
| `wave1-features.spec.ts` | 6 | Advanced blocks render; context-gated entries enable; toolbar groups; task checkboxes; TOC and outline panels |
| `tables.spec.ts` | 6 | Tab navigation, growth, merge/split, header row, undo |
| `ime.spec.ts` | 6 | Japanese composition driven through Chrome's own `Input.imeSetComposition`: while a composition is open the reading lives in the DOM and deliberately not in the document, and only the committed kanji reaches the model |
| `typing.spec.ts` | 5 | Typing, Enter/Backspace, `Mod-b`, undo/redo, caret sync |
| `features.spec.ts` | 5 | Input rules: heading, bullet-list flow, Tab nesting, blockquote and em dash, and undo of a rule as its own step |
| `track-changes.spec.ts` | 4 | Suggest, strike-through, accept all, reject all |
| `accessibility.spec.ts` | 4 | axe-core audits over the editor and its chrome on load, with a menu open, with a dialog open, and in the dark theme with contrast included |
| `toolbar-reorder.spec.ts` | 3 | Drag a group by its grip and remember it; a bare click moves nothing; Space + arrows from the keyboard |
| `docs.spec.ts` | 3 | The documentation site builds and serves, and its playground runs the real CDN bundle from this checkout |

```sh
cd packages/e2e
pnpm exec playwright test -c playwright.local.config.ts                        # everything, local Chrome
pnpm exec playwright test -c playwright.local.config.ts tables.spec.ts --headed
pnpm exec playwright test                                                      # CI config: chromium + firefox + webkit
```

Where the spec cannot see something: whether the browser really marked a
misspelling, whether a colour really printed. It measures pixels in a
screenshot or a rendered PDF rather than reading an attribute.

## Quality, packaging and release

- **TypeScript** strict, `ES2022`, `verbatimModuleSyntax`, `isolatedModules`,
  `noUnusedLocals`/`Parameters`, `noImplicitOverride`
  ([`tsconfig.base.json`](tsconfig.base.json)).
- **Biome** for lint and format: two-space indent, 100 columns, single quotes,
  semicolons as needed, trailing commas ([`biome.json`](biome.json)). Run it
  as described above, per file, `lint` only.
- **Builds** with `tsup`: ESM + CJS + `.d.ts`/`.d.cts` with a correct
  `exports` map per package; core is `sideEffects: false`, the UI kit marks
  only its CSS/SCSS as side-effectful and publishes `./styles.css` and
  `./scss/*`; the web component adds a minified IIFE with `globalName:
  'Trevixal'`.
- **Versioning** with Changesets (`.changeset/config.json`: public access,
  base branch `main`, private workspaces excluded, peer-dependents bumped only
  when a new version leaves their range): `pnpm changeset` records a bump. The
  first release is `1.0.0`; [`RELEASING.md`](RELEASING.md) explains why.
- **The publish gate**: `pnpm check:pkg` runs `publint`, `arethetypeswrong`
  and a tarball inspection (no `src/`, no source map with embedded source)
  over every publishable package.
- **Continuous integration**: `.github/workflows/ci.yml` runs build, typecheck,
  tests and the gate on every pull request; `release.yml` publishes to npm
  with provenance through `changesets/action` once a release PR merges.

## Status, backlog and scope

**Done and verified**: everything in [Everything it can do](#everything-it-can-do),
the twenty-three publishable packages, the eleven example apps, and both test
suites, at the numbers at the top of this file.

**Backlog**: the build brief is finished. `_PROMPT.md` tracked what was left
of it and is gone, as it said it would be when its last line went; the full
original is in version control (`git show 6467962~1:_PROMPT.md`). Its last two
entries closed together: the suite reaches a fully green run on **WebKit** as
well as Chromium and Firefox, and the **Angular example** ships. The toolchain that
could not be installed when that was written now can be, on the three terms
its [README](examples/angular/README.md) sets out.

One caveat on "green": every test in the browser suite passes on every
engine, but not every *run* is clean. On a four-core machine a full run
drops one or two tests to contention, a different one or two each time,
and each of them passes in isolation. Run a failure on its own before
believing it.

The maintainers' notes also carry what is left: a decision on whether to keep
ADR-0009's body now that it is superseded, and the remaining console noise.

Continuous integration and npm publishing are wired; see [`RELEASING.md`](RELEASING.md).

**Known limitations**, each recorded: `rowspan` merges
([ADR-0006](docs/adr/0006-colspan-only-table-model.md)); structural edits
while suggesting are not tracked; YouTube embeds cannot play in a page opened
from disk (a YouTube limitation, the export degrades them to links).

**Out of scope**: real-time collaboration, comments, mentions and sharing
(removed); a bundled spell-check dictionary; a bundled PDF writer; native
mobile SDKs.

---

## Every menu command

The stock menu tree from [`menubar.ts`](packages/ui/src/menubar.ts), with the
default shortcut label where one is printed. A host that supplies a shortcut
manager decides the labels instead (the demo prints `Ctrl+Shift+K` for
*Insert ▸ Link*, since `Ctrl+K` belongs to the palette there). Entries the
host has not wired do not appear.

**File**: New document `Ctrl+Alt+N` · Open… `Ctrl+O` · Save `Ctrl+S` ·
**Download as ▸** Web page (.html) / Markdown (.md) / Plain text (.txt) /
Trevixal JSON (.json) / Word document (.docx) / Rich text (.rtf) / PDF (via
print) / Encrypted document (.tvx) · Download selection… · Import a file… ·
Local backups… · Protect with password… · Restrictions… · Print preview… ·
Print… `Ctrl+P`

**Edit**: Undo `Ctrl+Z` · Redo `Ctrl+Y` · Cut `Ctrl+X` · Copy `Ctrl+C` ·
Paste `Ctrl+V` · Paste without formatting · **Change case ▸** UPPERCASE /
lowercase / Title Case · Find and replace… `Ctrl+F` · Select all `Ctrl+A`

**Insert**: Image… · Link… `Ctrl+K` · Remove link · Horizontal rule · Line
break `Shift+Enter` · Special character… · Emoji… · Video… · Audio… · Embed a
link… · Link preview card… · File attachment… · Equation… · Display equation…
· Diagram · **Callout ▸** Info / Success / Warning / Danger / Note · Toggle
block · **Columns ▸** 2 / 3 / 4 columns · Card · Timeline · **Tabs ▸** 2 / 3
tabs · Accordion · Badge… · Button… · Anchor… · Footnote · Citation… ·
References list · Renumber citations · Page break

**Format**: Bold `Ctrl+B` · Italic `Ctrl+I` · Underline `Ctrl+U` ·
Strikethrough · **Formats ▸** Superscript / Subscript / Code / Small caps /
Highlight · **Paragraph styles ▸** Paragraph / Heading 1-6 / Quote / Code
block · **Align ▸** Left / Center / Right / Justify · **Indentation ▸**
Increase / Decrease · **Line height ▸** Default / Single / 1.15 / 1.5 / Double
· **Paragraph spacing ▸** before and after none / small / medium / large,
then space before none / medium / large, then space after none / medium /
large · **Letter spacing ▸** Normal / Tight / Wide / Wider · **Lists ▸**
Bullet / Numbered / Task, eight list styles, Restart numbering, Continue
numbering, five multilevel lists · Format painter · Clear text formatting · Clear all formatting

**Tools**: Find and replace… `Ctrl+F` · Command palette… `Ctrl+K` · Table of
contents · Document outline · Source code… · Markdown source… · Edit as
Markdown · Edit as HTML · Format JSON · Format XML · Minify · Copy code block
· Document statistics… · Writing goal… · **Check writing ▸** All checks /
Grammar / Passive voice / Repeated words / Long sentences · Spell check ·
Word count

**Table**: Insert table · Row above · Row below · Delete row · Column left ·
Column right · Delete column · Merge cells · Split cell · Header row · Cell
background… · **Cell alignment ▸** Left / Center / Right / Default ·
**Borders ▸** All / Outside only / Rows only / No borders / Border colour… ·
**Sort by this column ▸** Ascending / Descending · Convert text to table ·
Convert table to text · Import CSV… · Copy as CSV · Distribute columns evenly
· Reset column sizes · Delete table

**View**: **Theme ▸** Light / Dark / Match the system / Sepia / Nord /
Solarized / High contrast / Midnight / Custom theme… / Custom CSS… · Add a
font… · Focus mode · Typewriter scrolling · Fullscreen · Page view · Table of
contents · Document outline · History · Documents · Side-by-side preview ·
Split editor · Narrow / Normal / Wide / Full width · Read-only mode ·
Suggesting mode

Every entry in that menu that switches something on shows a tick while it is
on. The theme and the width included, each behaving as one radio group. The
menu recomputes as it opens rather than on the next keystroke, because most of
what it reports is chrome, and chrome changes without touching the document.

**Help**: Keyboard shortcuts… · Customize toolbar… · About

## Keyboard shortcuts

`Mod` is `Cmd` on macOS and `Ctrl` elsewhere. Every key in the demo is owned
by the shortcut manager, listed under *Help ▸ Keyboard shortcuts…*, and
rebindable there.

**Always on (core `baseKeymap`)**

| Key | Action |
| --- | --- |
| `Mod+B` / `Mod+I` / `Mod+U` / `Mod+E` | Bold / italic / underline / inline code |
| `Mod+Z` · `Mod+Shift+Z` · `Mod+Y` | Undo · redo · redo |
| `Tab` / `Shift+Tab` | In a code block: indent / outdent two spaces · in a list: nest / un-nest · otherwise the browser moves focus |
| `Mod+Enter` | Leave a code block from anywhere inside it |
| `Mod+Shift+V` | Paste without formatting |
| `Enter`, `Backspace`, `Delete` | Handled through `beforeinput`: split, join, delete; a second `Enter` on an empty line leaves a code block; `Enter` keeps indentation and opens a bracket pair onto its own lines inside code |

**The assembled editor's shortcut manager** (`packages/editor-kit/src/shortcuts.ts`)

| Key | Action | | Key | Action |
| --- | --- | --- | --- | --- |
| `Mod+\` | Clear all formatting | | `Mod+X` / `Mod+C` / `Mod+V` | Cut / copy / paste (native) |
| `Mod+A` | Select all | | `Mod+F` | Find and replace |
| `Mod+K` · `Mod+Shift+P` | Command palette | | `Mod+Shift+K` | Insert link |
| `Mod+Shift+E` | Emoji picker | | `Shift+Enter` | Line break |
| `Mod+Alt+N` | New document | | `Mod+S` | Save now |
| `Mod+O` | Open a file | | `Mod+P` | Print |
| `Mod+Alt+P` | Protect with password | | `Mod+Shift+F` | Focus mode |
| `Mod+Shift+Enter` | Fullscreen | | `Mod+Alt+S` | Split editor |

**In context**

| Where | Key | Action |
| --- | --- | --- |
| Table | `Tab` / `Shift+Tab` | Next / previous cell; `Tab` on the last cell adds a row |
| Callout, card, column, toggle, tab, accordion | `Enter` on an empty trailing paragraph | Leave the container |
| Toggle summary, tab title, accordion title | `Enter` | Move into the body |
| Slash or emoji popup | `↑` `↓` · `Enter` or `Tab` · `Escape` | Move · pick · close |
| Toolbar grip | `Space` · `←` `→` · `Enter` · `Escape` | Pick a group up · move it · drop · put it back (announced to screen readers) |
| Menubar and toolbar | Arrow keys, `Escape` | WAI-ARIA menubar and toolbar patterns, roving tabindex |

## Typing shortcuts

Input rules fire at the moment the last character is typed and never inside a
code block or inline code. They are `defaultInputRules()` in core plus the
math package's rule.

| Type | Get |
| --- | --- |
| `# ` … `###### ` at the start of a line | Heading 1-6 |
| `- `, `* ` or `+ ` | Bullet list |
| `1. ` (any number) | Numbered list starting there |
| `> ` | Quote |
| ```` ``` ```` | Code block |
| `--` | Em dash — |
| `` `code` `` | Inline code |
| `https://…` or `www.…` followed by a space | A link, with trailing punctuation left out |
| `$x^2$` (with `mathInputRules()`) | An inline equation |

Each rule can be turned off (`defaultInputRules({ autolink: false, emDash:
false, inlineCode: false })`), and a rule's effect is a normal edit, so
`Mod+Z` undoes it.

## Slash command and emoji reference

**`/` at the start of a line.** The package ships nine items (Text, Heading
1, Heading 2, Heading 3, Bullet list, Numbered list, Code block, Quote,
Divider) each with keywords (`h1`, `ul`, `hr` …). The demo adds Table, Image,
Diagram, Equation, Callout, Columns and Toggle. Type to filter; prefix matches
rank first, then word boundaries, then any subsequence.

**`:` then at least one letter.** 114 built-in emoji with names and keywords
(`:smi` → 😄 smile …). An exact name outranks a prefix, which outranks a
substring, which outranks a keyword hit. *Insert ▸ Emoji…* opens the same set
as a picker dialog (`Mod+Shift+E` in the demo).

## Development commands

Run from the repository root unless noted.

| Command | What it does |
| --- | --- |
| `pnpm install` | Install and link every workspace package |
| `pnpm build` | Build every package in dependency order, through turbo, tsup ESM + CJS + types, sass for the UI kit, the CDN IIFE, the e2e pages. About 26 s cold, 30 ms when nothing has changed |
| `pnpm --filter @trevixal/<pkg> build` | Build one package (required before the demo or the browser tests see a change) |
| `pnpm test` | Every unit suite, cached per package; stops at the first failure. See [Running the unit tests](#running-the-unit-tests) |
| `pnpm typecheck` | `tsc --noEmit` across every package, cached the same way |
| `pnpm test:all` / `pnpm typecheck:all` / `pnpm build:all` | The same, straight through pnpm with `--no-bail`: every failure reported, and no cache in the way when you suspect one |
| `pnpm --filter @trevixal/<pkg> test` | One package's tests; `pnpm --filter @trevixal/core test:watch` watches |
| `pnpm exec biome lint <files>` | Lint the files you changed. To *format* one, pipe it through Biome as stdin, [Formatting your changes](#formatting-your-changes) has the line |
| `pnpm lint` / `pnpm lint:fix` | `biome check .` / `--write`, defined, but **do not run them** on this checkout: CRLF makes every file a format error |
| `pnpm e2e` | `playwright test` with the CI config (Chromium, Firefox, WebKit, after `pnpm --filter @trevixal/e2e exec playwright install`) |
| `cd packages/e2e && pnpm exec playwright test -c playwright.local.config.ts [spec] [--headed] [--debug]` | The browser suite on the local Chrome |
| `pnpm --filter @trevixal/e2e build` | Re-bundle `page/*.js` from `dist/` |
| `pnpm --filter @trevixal/example-full-editor dev` | The demo on Vite's dev server |
| `pnpm --filter @trevixal/example-{react,vue,svelte,angular,vanilla-cdn,ssr} dev` | The other six examples, one per integration story |
| `pnpm --filter @trevixal/example-full-editor build` / `preview` | Build the demo (relative asset paths, it opens from disk too) / serve the build |
| `pnpm docs:dev` | The documentation site, on VitePress |
| `pnpm docs:build` / `pnpm docs:preview` | Build it (guides, concepts, the typedoc API reference and the playground) / serve the build |
| `pnpm bench` / `pnpm size` / `pnpm coverage` | The three measured gates, each failing loudly when it slips |
| `pnpm changeset` | Record a version bump |
| `pnpm check:pkg` | The publish gate: `publint`, `arethetypeswrong` and a tarball inspection over every publishable package, after `pnpm build` |

## Documentation map

| Document | What it holds |
| --- | --- |
| This README | Overview for users and engineers, and the reference tables |
| [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) | Contributor Covenant 2.1, and how to report a problem |
| [`RELEASING.md`](RELEASING.md) | How a package reaches npm: the publish-readiness audit, the no-source-leak gate, Changesets, the release workflow and the first-publish checklist |
| [`docs/`](docs/) | The documentation site: guides per framework, a user guide to every menu and key, one page per extension, concepts, reference, contributing, the callout extension end to end, the API reference and a live playground. `pnpm docs:dev` |
| [`docs/adr/`](docs/adr/) | Ten architecture decision records |
| [`examples/README.md`](examples/README.md) | Eleven runnable apps, one per way in; each README explains the one thing its framework makes you think about |
| [`packages/editor-kit/README.md`](packages/editor-kit/README.md) | The assembled editor: what it wires, and every option a host can set |
| [`packages/ui/README.md`](packages/ui/README.md) · [`packages/extension-image/README.md`](packages/extension-image/README.md) · [`packages/extension-code-highlight/README.md`](packages/extension-code-highlight/README.md) · [`packages/e2e/README.md`](packages/e2e/README.md) | Package-level guides |
| [`packages/e2e/tests/feature-set.spec.ts`](packages/e2e/tests/feature-set.spec.ts) | The executable specification: drives the built demo through its menus in a real browser |

## Glossary

| Term | Meaning |
| --- | --- |
| **WYSIWYG** | "What You See Is What You Get", formatting is visible while you type, instead of writing markup. |
| **Headless** | The engine without any visual part. It manages the document data and can run on a server. |
| **Schema** | The rulebook for a document: which building blocks exist (paragraph, heading, table…) and how they may nest. |
| **Node / Mark** | A node is a piece of content (a paragraph, an image); a mark is styling applied to text (bold, a link). |
| **Transaction / Step** | Every change is a small, reversible instruction (a step) bundled into a transaction. This is what makes undo reliable. |
| **Decoration** | A purely visual overlay (a search highlight, a syntax colour, a grammar mark) that is displayed but never saved. |
| **Extension** | An optional add-on package (tables, images, diagrams…) that plugs into the editor through its public hooks. |
| **Sanitizing** | Cleaning pasted or imported HTML so hidden scripts and dangerous links are removed before they reach the page. |
| **IME** | Input Method Editor: how Japanese, Chinese, Korean and other scripts compose characters; handled with a dedicated composition state machine. |
| **Snapshot** | A reference-stable summary of the editor's state (active marks, block type, can undo…) that toolbars subscribe to. |
| **Suggesting mode** | Edits become attributed suggestions to accept or reject, instead of direct changes. |
| **Envelope** | The encrypted container a protected document is saved as (`.tvx`). |
| **Token (design)** | A named CSS custom property (`--tvx-color-accent`) every colour and size is expressed through. |

## FAQ

**Is this a fork or wrapper of ProseMirror / Lexical / Slate / Quill?**
No. Every subsystem (schema, transactions, undo, DOM reconciler, sanitizer,
position mapping, ZIP, XML, OOXML, RTF, MathML) is implemented in this
repository, with no runtime dependencies at all.

**Can I install it today?**
From npm once the first release (`1.0.0`) has been published; check
`npm view @trevixal/core`. Before that, clone the repository,
`pnpm install && pnpm build`, and build against the workspace as the demo
does.

**Can I use it without React/Vue/Svelte?**
Yes: `@trevixal/core` is plain TypeScript, and the web component runs from a
single `<script>` with no build tools.

**Does it work server-side (SSR/Next.js)?**
Yes. Creating an editor touches no DOM until a view is attached, the React,
Vue and web-component adapters have SSR import tests, and the headless editor
can parse, serialize and transform documents in Node.
[`examples/ssr`](examples/ssr) is that, working: Node builds a document,
validates it against a schema, counts its words and serializes it to HTML with
no browser anywhere, and the browser attaches the editor to those words.

**What do I store in my database?**
`editor.getJSON()`: a stable, schema-validated JSON document. HTML is an
*export format* (`getHTML()`), not the storage format.

**Is pasted content safe?**
Imported HTML is parsed in an inert template (scripts cannot run during
parsing) through an allowlist, URL attributes pass a protocol allowlist with
control-character rejection, and an XSS corpus locks the behaviour in.

**Which browsers are supported?**
Chromium, Firefox and WebKit are the declared targets of the Playwright
config. The measured runs in this checkout are on Chrome; the other two run
once a CI workflow exists.

**Will my exports look like the editor?**
Yes: theme, code colours and diagrams are carried into HTML, PDF, DOCX and
RTF, and verified by rendering the real files. See
[What an export carries](#what-an-export-carries).

**How do I add my own block type?**
Define a `NodeSpec` (content expression, `toHTML`, `parseHTML`) and merge it
into your `Schema`, exactly how `extension-math` and `extension-table` do it.

**Why is a menu entry missing?**
Because nothing wired it. `createEditorUI` drops entries with no action rather
than showing a dead switch; supply the action in `fileActions`,
`viewActions`, or the relevant `*Commands` option.

**Where did collaboration go?**
Removed on 2026-09-12, deliberately and completely, along with comments,
mentions and sharing. Trevixal is a single-user editor. Tracked changes,
slash commands, emoji and the security package stayed. They are editing
features, not collaboration.

---


## License
Apache-2.0: see [`LICENSE`](LICENSE).
