# @trevixal/extension-track-changes

[![CI](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@trevixal/extension-track-changes.svg)](https://www.npmjs.com/package/@trevixal/extension-track-changes)
[![types](https://img.shields.io/npm/types/@trevixal/extension-track-changes.svg)](https://www.npmjs.com/package/@trevixal/extension-track-changes)
[![license](https://img.shields.io/npm/l/@trevixal/extension-track-changes.svg)](https://github.com/adityabhalsod/trevixal-editor/blob/main/LICENSE)
[![docs](https://img.shields.io/badge/docs-GitHub%20Pages-blue)](https://adityabhalsod.github.io/trevixal-editor/)
[![dev.to](https://img.shields.io/badge/dev.to-blog-0A0A0A?logo=devdotto&logoColor=white)](https://dev.to/aditya_bhalsod/i-built-a-rich-text-editor-from-scratch-no-prosemirror-no-dependencies-52b6)
[![stars](https://img.shields.io/github/stars/adityabhalsod/trevixal-editor?style=social)](https://github.com/adityabhalsod/trevixal-editor/stargazers)

[Documentation](https://trevixal-editor.vercel.app) · [Live editor](https://trevixal-editor.vercel.app/full-editor) · [Changelog](https://github.com/adityabhalsod/trevixal-editor/blob/main/packages/extension-track-changes/CHANGELOG.md) · [Issues](https://github.com/adityabhalsod/trevixal-editor/issues)

[![Watch the Trevixal demo on YouTube](https://img.youtube.com/vi/PF8VchgEAeU/maxresdefault.jpg)](https://youtu.be/PF8VchgEAeU)

▶ [Watch the 1-minute demo on YouTube](https://youtu.be/PF8VchgEAeU)

[![The Trevixal editor](https://trevixal-editor.vercel.app/media/editor.png)](https://trevixal-editor.vercel.app/full-editor)

## Features

- Attributed insertion and deletion marks
- Accept and reject, one change or all of them
- **3.1 kB** minified and gzipped, with TypeScript types in the package

Suggestion mode: edits become attributed, timestamped marks to accept or
reject, instead of changes to the document.

```sh
npm install @trevixal/extension-track-changes
```

## Usage

```ts
import { TrackChanges, trackChangesMarks, createTrackChangesBar } from '@trevixal/extension-track-changes'

// Schema: marks: { ...defaultMarks(), ...trackChangesMarks() }
const track = new TrackChanges(editor, { author: 'ada' })
track.enable()

// Typing  → <ins data-trevixal-author="ada" data-trevixal-timestamp="…">
// Deleting → the text stays, wrapped in <del …>

track.suggestions()   // [{ path, from, to, kind, author, timestamp }]
track.acceptAll()
track.rejectAll()
track.acceptAt(position)
track.disable()

createTrackChangesBar(editor, track, { container: reviewHost, author: 'You' })
```

Switching modes changes no document, so it raises no transaction, and anything
watching the editor alone never hears about it. `track.onEnabledChange(fn)`
does. The review bar subscribes to it, so a toggle anywhere (a View menu, a
shortcut, a button of your own) is reflected at once:

```ts
const off = track.onEnabledChange((enabled) => setIndicator(enabled))
```

Without it a bar reads "off" while every keystroke is in fact being recorded
as a suggestion. The worst way for this feature to be wrong, because the
writer believes their edits are going in directly.

## How it works, and why that matters

Suggestion mode is a **dispatch transform**: it rewrites each transaction
before it applies, turning a deletion into a strike and an insertion into an
attributed run. Every other command in the editor keeps working unchanged.
Nothing had to learn about suggestions, because nothing sees them.

It also means history metadata set by the source transaction survives the
rewrite, so an input rule that fires in suggestion mode still undoes as one
step.

## Suggestions carry a time

Each mark records an author and a timestamp, so a reviewer can order them and
a document can show who suggested what, when. The attributes round-trip
through `parseHTML`, so a suggestion survives copy and paste.

## Known limit

Structural edits: pressing Enter, joining blocks, are not tracked while
suggesting. The text of a suggestion is, but a new paragraph is applied
directly. Splitting a block is not expressible as an `ins`/`del` pair over
inline content, and pretending otherwise would produce a document that
accept-all could not reconstruct.

## License

Apache-2.0
