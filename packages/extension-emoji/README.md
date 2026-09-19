# @trevixal/extension-emoji

<!-- generated: header -->

[![CI](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@trevixal/extension-emoji.svg)](https://www.npmjs.com/package/@trevixal/extension-emoji)
[![types](https://img.shields.io/npm/types/@trevixal/extension-emoji.svg)](https://www.npmjs.com/package/@trevixal/extension-emoji)
[![license](https://img.shields.io/npm/l/@trevixal/extension-emoji.svg)](https://github.com/adityabhalsod/trevixal-editor/blob/main/LICENSE)

[Documentation](https://trevixal-editor.vercel.app) · [Live editor](https://trevixal-editor.vercel.app/full-editor) · [Changelog](https://github.com/adityabhalsod/trevixal-editor/blob/main/packages/extension-emoji/CHANGELOG.md) · [Issues](https://github.com/adityabhalsod/trevixal-editor/issues)

[![The Trevixal editor](https://trevixal-editor.vercel.app/media/editor.png)](https://trevixal-editor.vercel.app/full-editor)

## Features

- A `:shortcode` trigger with built-in search
- **1.9 kB** minified and gzipped, with TypeScript types in the package

<!-- /generated: header -->

`:` and a few letters, then the emoji.

```sh
npm install @trevixal/extension-emoji
```

## Usage

```ts
import { emoji, defaultEmoji, searchEmoji } from '@trevixal/extension-emoji'
import { createSuggestionPopup } from '@trevixal/ui'

const popup = createSuggestionPopup({
  editor,
  renderItem: (item) => `${item.char} ${item.name}`,
  onPick: (index) => emojis.select(index),
})

const emojis = emoji(editor, { onState: popup.update, minQueryLength: 1 })
```

114 emoji ship with names and keywords. Pass `items` to replace the set with
your own. The shape is `{ name, char, keywords? }`.

## Search that puts the obvious answer first

`heart` returns ❤️ before 😍. An exact name beats a prefix, which beats a
substring, which beats a keyword hit. This sounds obvious and is the thing
emoji pickers most often get wrong: matching on "contains" alone buries the
word you actually typed under everything that happens to include it.

## The trigger

`:` fires at the start of a block or after whitespace, never mid-word, so a
URL, a time, or `a:b` in code does not open a picker. The query is read from
the document model rather than the DOM, and it shares that machinery with the
`/` menu; both are `suggestionList` from `@trevixal/core`.

`searchEmoji(query, items?)` is exported on its own for a dialog or a palette
that wants the same ranking without the trigger.

## License

Apache-2.0
