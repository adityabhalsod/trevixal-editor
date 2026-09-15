# @trevixal/extension-slash-command

The `/` menu: type a slash at the start of a line and pick a block.

```sh
npm install @trevixal/extension-slash-command
```

## Usage

```ts
import { slashCommand, defaultSlashCommands } from '@trevixal/extension-slash-command'
import { createSuggestionPopup } from '@trevixal/ui'

const popup = createSuggestionPopup({
  editor,
  renderItem: (item) => item.title,
  onPick: (index) => slash.select(index),
  emptyLabel: 'No matching block',
})

const slash = slashCommand(editor, {
  items: [
    ...defaultSlashCommands(),
    { id: 'table', title: 'Table', keywords: ['grid', 'rows'], run: (e) => e.exec(insertTable()) },
  ],
  onState: popup.update, // null means closed
})
```

The popup is not required. `onState` hands you the query, the matches and the
selected index; render that however you like and call `select(index)`.

## Nine items ship

Text, Heading 1-3, Bullet list, Numbered list, Code block, Quote, Divider.
Each with keywords, so `/h1`, `/ul` and `/hr` all find the right thing.

## Details that matter

**The trigger is found in the document, not the DOM.** `/` fires only at the
start of a block, and the query is read from the model, so a rendered
decoration, a syntax colour or a node view cannot confuse it.

**Filtering ranks by how you matched.** A prefix beats a word boundary, which
beats any subsequence. Typing `co` puts "Code block" above "Bullet list", even
though both contain the letters.

**The keyboard is the point.** Arrows move, `Enter` and `Tab` select, `Escape`
dismisses, and picking an item removes the `/` and the query before running
it, so a command never has to clean up after the menu.

## License

Apache-2.0
