import type { Command } from '@trevixal/core'
import { defaultMenus } from './menubar'
import { QUICK_ACCESS_GROUP, type ToolbarOptions, defaultToolbarGroups } from './toolbar'

/**
 * Translation for everything the kit puts on screen.
 *
 * The catalogue is keyed by what a thing *is*: `menu.insertTable`,
 * `toolbar.bold`, rather than by the English words it happens to use. That
 * matters more than it sounds: a catalogue extracted from strings has to be
 * re-extracted whenever a label is reworded, and the day it is not, a host's
 * French build silently reverts a line to English. Here the key is the item's
 * own name, so a reworded label changes the default and nothing else.
 *
 * `defaultMessages()` is *derived* from the menus and toolbar rather than
 * written out beside them, so the list of keys is complete by construction.
 * There is no second file to keep in step.
 *
 * ```ts
 * createEditorUI(editor, {
 *   container,
 *   messages: { 'menu.file': 'Fichier', 'toolbar.bold': 'Gras' },
 * })
 * ```
 *
 * Anything a host leaves out keeps its English. Partial translation is the
 * normal state of a catalogue, not an error.
 */

/** Keys to strings. Anything missing falls back to the kit's own English. */
export type Messages = Readonly<Record<string, string>>

/** Looks up a key, falling back to the text the kit would have used. */
export type Translator = (key: string, fallback: string) => string

/** Prefix for a menu entry, by its `name`. */
export const MENU_KEY = 'menu.'
/** Prefix for a toolbar item, by its `name`. */
export const TOOLBAR_KEY = 'toolbar.'
/** Prefix for a toolbar group's label. */
export const TOOLBAR_GROUP_KEY = 'toolbar.group.'
/** Prefix for an accessible name that differs from the visible label. */
export const ARIA_SUFFIX = '.aria'

/**
 * Every key the kit will look up, with the English it would otherwise show.
 *
 * Read it to see what there is to translate, or to build a starting file:
 *
 * ```ts
 * console.log(JSON.stringify(defaultMessages(), null, 2))
 * ```
 */
export function defaultMessages(): Messages {
  const messages: Record<string, string> = {}

  const walkMenuItems = (
    items: readonly { name: string; label: string; items?: readonly unknown[] }[],
  ): void => {
    for (const item of items) {
      if (item.label) messages[`${MENU_KEY}${item.name}`] = item.label
      if (item.items) {
        walkMenuItems(item.items as readonly { name: string; label: string }[])
      }
    }
  }

  for (const menu of defaultMenus()) {
    messages[`${MENU_KEY}${menu.name}`] = menu.label
    walkMenuItems(menu.items as readonly { name: string; label: string }[])
  }

  // Built only when a host asks for it, so it is not among the defaults.
  messages[`${TOOLBAR_GROUP_KEY}${QUICK_ACCESS_GROUP.name}`] = QUICK_ACCESS_GROUP.label
  for (const group of defaultToolbarGroups(EVERY_TOOLBAR_ITEM)) {
    if (group.label) messages[`${TOOLBAR_GROUP_KEY}${group.name}`] = group.label
    for (const item of group.items ?? []) {
      const entry = item as { name: string; label?: string; ariaLabel?: string }
      if (entry.label) messages[`${TOOLBAR_KEY}${entry.name}`] = entry.label
      if (entry.ariaLabel && entry.ariaLabel !== entry.label) {
        messages[`${TOOLBAR_KEY}${entry.name}${ARIA_SUFFIX}`] = entry.ariaLabel
      }
    }
  }

  return messages
}

const nothing = (): void => undefined
const unchanged: Command = (state) => state.tr

/**
 * A handler for every optional toolbar item, so each one is built and its
 * labels listed: the kit's toolbar has them all, and a label missing here
 * could not be translated.
 */
const EVERY_TOOLBAR_ITEM: ToolbarOptions = {
  onLink: nothing,
  onImage: nothing,
  onInsertTable: nothing,
  onCopyCode: nothing,
  onFindReplace: nothing,
  onToggleTableOfContents: nothing,
  onToggleOutline: nothing,
  onCommandPalette: nothing,
  onToggleFocusMode: nothing,
  onToggleFullscreen: nothing,
  onFormatPainter: nothing,
  onSpecialCharacter: nothing,
  onEmoji: nothing,
  onWordCount: nothing,
  codeFormatCommands: { formatJSON: unchanged, formatXML: unchanged, minify: unchanged },
  blockCommands: {
    insertCallout: () => unchanged,
    insertToggleBlock: unchanged,
    insertColumns: () => unchanged,
    insertCard: unchanged,
    insertTimeline: unchanged,
    insertPageBreak: unchanged,
    insertFootnote: unchanged,
  },
}

/**
 * A lookup over a catalogue.
 *
 * With no catalogue it returns the fallback unchanged, which is what makes
 * translation cost nothing for the hosts that do not want it. There is no
 * table to consult and no allocation per label.
 */
export function createTranslator(messages?: Messages): Translator {
  if (!messages) return (_key, fallback) => fallback
  return (key, fallback) => messages[key] ?? fallback
}
