/**
 * The two typed triggers: `/` for a block, `:` for an emoji.
 *
 * Each trigger is two halves that are no use apart. An extension that
 * watches the text, keeping the keyboard, the query and the range the
 * trigger opened, and a popup that draws the matches and reports clicks back
 * to it. They are built together here, and the mount takes the pair.
 */
import type { Editor } from '@trevixal/core'
import { blockUICommands } from '@trevixal/extension-blocks'
import { diagramUICommands } from '@trevixal/extension-diagram'
import { type EmojiItem, defaultEmoji, emoji } from '@trevixal/extension-emoji'
import type { ImageController } from '@trevixal/extension-image'
import { mathUICommands } from '@trevixal/extension-math'
import {
  type SlashCommandItem,
  defaultSlashCommands,
  slashCommand,
} from '@trevixal/extension-slash-command'
import { tableUICommands } from '@trevixal/extension-table'
import { type SuggestionPopup, createSuggestionPopup, openCharacterPicker } from '@trevixal/ui'

/** A mounted pair of triggers, and the ways they are taken back down. */
export interface SuggestionMenus {
  slashPopup: SuggestionPopup<SlashCommandItem>
  emojiPopup: SuggestionPopup<EmojiItem>
  /** The Insert ▸ Emoji… grid. The same set the `:` trigger searches. */
  pickEmoji(): Promise<void>
  /**
   * Takes both extensions off the editor. The popups are UI and say
   * `destroy`, so they go on the caller's destroy list rather than here.
   */
  dispose(): void
}

/**
 * The `/` menu: the core block types, plus everything this build can insert
 * that the core cannot, tables, images, diagrams, equations and containers.
 */
export function slashItems(images: ImageController): SlashCommandItem[] {
  const blocks = blockUICommands()
  return [
    ...defaultSlashCommands(),
    {
      id: 'table',
      title: 'Table',
      keywords: ['grid', 'rows', 'columns'],
      run: (target) => target.exec(tableUICommands().insertTable(3, 3)),
    },
    {
      id: 'image',
      title: 'Image',
      keywords: ['picture', 'photo', 'upload'],
      run: () => void images.pickFiles(),
    },
    {
      id: 'diagram',
      title: 'Diagram',
      keywords: ['mermaid', 'flowchart', 'graph'],
      run: (target) => target.exec(diagramUICommands().insertDiagram()),
    },
    {
      id: 'equation',
      title: 'Equation',
      keywords: ['math', 'latex', 'formula'],
      run: (target) => target.exec(mathUICommands().insertMathBlock('a^2 + b^2 = c^2')),
    },
    {
      id: 'callout',
      title: 'Callout',
      keywords: ['note', 'admonition', 'info'],
      run: (target) => target.exec(blocks.insertCallout('info')),
    },
    {
      id: 'columns',
      title: 'Columns',
      keywords: ['layout', 'side by side'],
      run: (target) => target.exec(blocks.insertColumns(2)),
    },
    {
      id: 'toggle',
      title: 'Toggle',
      keywords: ['collapse', 'details', 'accordion'],
      run: (target) => target.exec(blocks.insertToggleBlock),
    },
  ]
}

/** Install both triggers on `editor`. `images` is what the `/` menu uploads through. */
export function createSuggestionMenus(editor: Editor, images: ImageController): SuggestionMenus {
  const slashPopup = createSuggestionPopup<SlashCommandItem>({
    editor,
    renderItem: (item) => item.title,
    onPick: (index) => slash.select(index),
    emptyLabel: 'No matching block',
  })
  const slash = slashCommand(editor, { items: slashItems(images), onState: slashPopup.update })

  const emojiPopup = createSuggestionPopup<EmojiItem>({
    editor,
    renderItem: (item) => `${item.char}  :${item.name}:`,
    onPick: (index) => emojis.select(index),
  })
  const emojis = emoji(editor, { onState: emojiPopup.update })

  async function pickEmoji(): Promise<void> {
    const character = await openCharacterPicker(
      document,
      defaultEmoji().map((item) => ({ char: item.char, label: item.name })),
      { title: 'Emoji', className: 'trevixal-charpicker--emoji' },
    )
    editor.view?.focus()
    if (character) editor.commands.insertText(character)
  }

  return {
    slashPopup,
    emojiPopup,
    pickEmoji,
    dispose() {
      slash.dispose()
      emojis.dispose()
    },
  }
}
