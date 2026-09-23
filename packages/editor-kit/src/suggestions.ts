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
import {
  type IconName,
  type SuggestionPopup,
  createSuggestionPopup,
  openCharacterPicker,
} from '@trevixal/ui'

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

/** How the core's own entries look in this menu: they ship without an icon or a line. */
const CORE_LOOKS: Readonly<Record<string, Pick<SlashCommandItem, 'icon' | 'description'>>> = {
  paragraph: { icon: 'langPlain', description: 'Plain text' },
  heading1: { icon: 'caseUpper', description: 'A big section heading' },
  heading2: { icon: 'caseUpper', description: 'A medium section heading' },
  heading3: { icon: 'caseUpper', description: 'A small section heading' },
  bulletList: { icon: 'bulletList', description: 'A simple bulleted list' },
  orderedList: { icon: 'orderedList', description: 'A list with numbers' },
  codeBlock: { icon: 'codeLanguage', description: 'Code, highlighted as you type' },
  blockquote: { icon: 'quote', description: 'A quotation, set apart' },
  horizontalRule: { icon: 'horizontalRule', description: 'A line between sections' },
}

/**
 * The `/` menu: the core block types, plus everything this build can insert
 * that the core cannot, tables, images, video, diagrams, equations and
 * containers. `runMenuEntry` runs a wired menu entry by name: Video asks for
 * its link through the same dialog Insert ▸ Video… opens.
 */
export function slashItems(
  images: ImageController,
  runMenuEntry: (name: string) => void,
): SlashCommandItem[] {
  const blocks = blockUICommands()
  return [
    ...defaultSlashCommands().map((item) => ({ ...item, ...CORE_LOOKS[item.id] })),
    {
      id: 'taskList',
      title: 'To-do list',
      description: 'Tasks with checkboxes',
      icon: 'taskList',
      keywords: ['todo', 'task', 'checkbox', 'checklist'],
      run: (target) => target.commands.toggleTaskList(),
    },
    {
      id: 'table',
      title: 'Table',
      description: 'Rows and columns',
      icon: 'table',
      keywords: ['grid', 'rows', 'columns'],
      run: (target) => target.exec(tableUICommands().insertTable(3, 3)),
    },
    {
      id: 'image',
      title: 'Image',
      description: 'Upload a picture',
      icon: 'image',
      keywords: ['picture', 'photo', 'upload'],
      run: () => void images.pickFiles(),
    },
    {
      id: 'video',
      title: 'Video',
      description: 'YouTube, Vimeo or a video file',
      icon: 'image',
      keywords: ['youtube', 'vimeo', 'embed', 'movie'],
      run: () => runMenuEntry('insertVideo'),
    },
    {
      id: 'diagram',
      title: 'Diagram',
      description: 'A Mermaid flowchart or chart',
      icon: 'statistics',
      keywords: ['mermaid', 'flowchart', 'graph'],
      run: (target) => target.exec(diagramUICommands().insertDiagram()),
    },
    {
      id: 'equation',
      title: 'Equation',
      description: 'A formula, written in LaTeX',
      icon: 'specialChar',
      keywords: ['math', 'latex', 'formula'],
      run: (target) => target.exec(mathUICommands().insertMathBlock('a^2 + b^2 = c^2')),
    },
    {
      id: 'callout',
      title: 'Callout',
      description: 'A note that stands out',
      icon: 'callout',
      keywords: ['note', 'admonition', 'info'],
      run: (target) => target.exec(blocks.insertCallout('info')),
    },
    {
      id: 'columns',
      title: 'Columns',
      description: 'Two columns side by side',
      icon: 'columns',
      keywords: ['layout', 'side by side'],
      run: (target) => target.exec(blocks.insertColumns(2)),
    },
    {
      id: 'tabs',
      title: 'Tabs',
      description: 'Content split across tabs',
      icon: 'columns2',
      keywords: ['tab', 'panels', 'switch'],
      run: (target) => target.exec(blocks.insertTabs(2)),
    },
    {
      id: 'toggle',
      title: 'Toggle',
      description: 'Content that folds away',
      icon: 'toggleBlock',
      keywords: ['collapse', 'details', 'accordion'],
      run: (target) => target.exec(blocks.insertToggleBlock),
    },
    {
      id: 'pageBreak',
      title: 'Page break',
      description: 'Start a new page when printed',
      icon: 'pageBreak',
      keywords: ['page', 'print', 'break'],
      run: (target) => target.exec(blocks.insertPageBreak),
    },
  ]
}

/**
 * Install both triggers on `editor`. `images` is what the `/` menu uploads
 * through, and `runMenuEntry` what it opens a menu entry's dialog with.
 */
export function createSuggestionMenus(
  editor: Editor,
  images: ImageController,
  runMenuEntry: (name: string) => void,
): SuggestionMenus {
  const slashPopup = createSuggestionPopup<SlashCommandItem>({
    editor,
    renderItem: (item) => item.title,
    // The names are this UI's own: every icon below is one `@trevixal/ui` draws.
    iconOf: (item) => item.icon as IconName | undefined,
    detailOf: (item) => item.description,
    onPick: (index) => slash.select(index),
    emptyLabel: 'No matching block',
  })
  const slash = slashCommand(editor, {
    items: slashItems(images, runMenuEntry),
    onState: slashPopup.update,
  })

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
