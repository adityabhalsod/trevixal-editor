# Emoji

`@trevixal/extension-emoji`: `:` and a few letters, then the emoji.

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
your own; the shape is `{ name, char, keywords? }`.

## Search that puts the obvious answer first

`heart` returns the red heart before the heart-eyes face. An exact name beats
a prefix, which beats a substring, which beats a keyword hit. This sounds
obvious and is the thing emoji pickers most often get wrong: matching on
"contains" alone buries the word you actually typed under everything that
happens to include it.

`searchEmoji(query, items?)` is exported on its own for a dialog or a palette
that wants the same ranking without the trigger; the assembled editor's
*Insert > Emoji...* dialog uses it.

## The trigger

`:` fires at the start of a block or after whitespace, never mid-word, so a
URL, a time, or `a:b` in code does not open a picker. The query is read from
the document model rather than the DOM, and it shares that machinery with the
[`/` menu](./slash-command): both are `suggestionList` from `@trevixal/core`.
