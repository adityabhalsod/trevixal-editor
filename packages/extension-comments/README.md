# @trevixal/extension-comments

[![CI](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@trevixal/extension-comments.svg)](https://www.npmjs.com/package/@trevixal/extension-comments)
[![types](https://img.shields.io/npm/types/@trevixal/extension-comments.svg)](https://www.npmjs.com/package/@trevixal/extension-comments)
[![license](https://img.shields.io/npm/l/@trevixal/extension-comments.svg)](https://github.com/adityabhalsod/trevixal-editor/blob/main/LICENSE)

[Documentation](https://trevixal-editor.vercel.app/extensions/comments) · [Live editor](https://trevixal-editor.vercel.app/full-editor) · [Changelog](https://github.com/adityabhalsod/trevixal-editor/releases) · [Issues](https://github.com/adityabhalsod/trevixal-editor/issues)

[![The Trevixal editor](https://trevixal-editor.vercel.app/media/editor.png)](https://trevixal-editor.vercel.app/full-editor)

## Features

- Comment threads on a selection, with replies, resolving and deleting
- `@mentions` from a list you supply, and a hook to notify the people named
- Saved with the document, and carried into Word as Word comments
- **3.2 kB** minified and gzipped, with TypeScript types in the package

Comments for the Trevixal editor: threads on a selection, replies, resolving,
`@mentions` from a host-supplied list and a notifications hook, all saved with
the document.

```sh
npm install @trevixal/extension-comments
```

## Usage

```ts
import { commentMarks, createCommentsPanel } from '@trevixal/extension-comments'

const schema = new Schema({ nodes, marks: { ...defaultMarks(), ...commentMarks() } })

const panel = createCommentsPanel(editor, {
  container: sidebar,
  author: () => currentUser.name,
  users: () => team,                        // who `@` can mention: { id, name }[]
  onMention: ({ user, thread, comment }) => notify(user, comment.text),
})
panel.addComment('Is this approved?')       // on the selected text
```

## Saved with the document

The text a thread is about carries the `comment` mark, named by the thread's
id (`span.trevixal-comment[data-comment]`). The threads themselves are one
document setting, `comments`, written as `data-comments` on the document
wrapper, so they round-trip through Trevixal JSON and HTML with the text.

## Commands

| Command | What it does |
| --- | --- |
| `addComment({ author, text, time }, id?)` | Marks the selection and opens a thread on it, in one undoable step. Declines on an empty selection. |
| `replyToComment(id, entry)` | Adds a reply to the end of a thread |
| `resolveComment(id, resolved?)` | Resolves or reopens a thread. Its text keeps the mark. |
| `deleteComment(id)` | Removes the thread and its mark together |

`commentThreads(doc)` lists the threads in the order their text appears.
`commentRanges(doc, id)` and `commentedText(doc, id)` say where a thread is.
`commentAt(state)` names the thread under the caret, and
`mentionsIn(text, users)` finds whole-name `@` mentions.

## The panel

The panel lists every thread with its quote, its comments and a reply box.
Typing `@` in the reply box offers the people whose names start with what
follows it. A click on the quote selects the text. The thread under the caret
is picked out. A resolved thread stays listed, faded, and its text loses its
highlight.

## In a Word file

The DOCX writer in `@trevixal/extension-export` carries each thread as a Word
comment. The range starts where the thread's text begins and ends after its
last stretch, even when that is paragraphs later. Replies follow the first
comment as paragraphs of their own, each with its author.

## License

Apache-2.0
