import type { Command } from '@trevixal/core'
import { addAccordionItem, insertAccordion } from './accordion'
import { insertCitation, insertReferenceList, renumberCitations } from './citations'
import {
  insertAnchor,
  insertBadge,
  insertButton,
  insertCallout,
  insertCard,
  insertColumns,
  insertFootnote,
  insertPageBreak,
  insertTimeline,
  insertTimelineItem,
  insertToggleBlock,
  setCalloutVariant,
  setColumnCount,
  toggleToggleOpen,
} from './commands'
import { badgeTone, calloutVariant } from './schema'
import { addTab, insertTabs, removeTab } from './tabs'

/**
 * The command bundle `@trevixal/ui` expects, so the UI package can offer the
 * advanced blocks without importing this one:
 *
 * ```ts
 * createEditorUI(editor, { container, blockCommands: blockUICommands() })
 * ```
 */
export interface BlockUICommands {
  readonly insertCallout: (variant: string) => Command
  readonly insertToggleBlock: Command
  readonly insertColumns: (count: number) => Command
  readonly insertCard: Command
  readonly insertTimeline: Command
  readonly insertPageBreak: Command
  readonly insertBadge: (label: string, tone: string) => Command
  readonly insertButton: (label: string, href: string) => Command
  readonly insertFootnote: Command
  readonly insertAnchor: (id: string) => Command
  readonly insertTabs: (count: number) => Command
  readonly addTab: Command
  readonly removeTab: Command
  readonly insertAccordion: (count: number) => Command
  readonly addAccordionItem: Command
  readonly insertCitation: (text: string) => Command
  readonly insertReferenceList: Command
  readonly renumberCitations: Command
  // Commands that change a block already in the document, rather than
  // inserting one. Without these the menus can only ever create.
  readonly setCalloutVariant: (variant: string) => Command
  readonly setColumnCount: (count: number) => Command
  readonly insertTimelineItem: Command
  readonly toggleToggleOpen: Command
}

export function blockUICommands(): BlockUICommands {
  return {
    // The UI passes plain strings; the schema's own coercion is what keeps an
    // unknown variant or tone from reaching a node's attrs.
    insertCallout: (variant) => insertCallout(calloutVariant(variant)),
    insertToggleBlock,
    insertColumns: (count) => insertColumns(count),
    insertCard,
    insertTimeline,
    insertPageBreak,
    insertBadge: (label, tone) => insertBadge(label, badgeTone(tone)),
    insertButton: (label, href) => insertButton(label, href || null),
    // insertFootnote takes an optional id; the UI never supplies one, so the
    // command generates it.
    insertFootnote: insertFootnote(),
    insertAnchor: (id) => insertAnchor(id),
    insertTabs: (count) => insertTabs(count),
    addTab,
    removeTab,
    insertAccordion: (count) => insertAccordion(count),
    addAccordionItem,
    insertCitation: (text) => insertCitation(text),
    insertReferenceList,
    renumberCitations,
    setCalloutVariant: (variant) => setCalloutVariant(calloutVariant(variant)),
    setColumnCount: (count) => setColumnCount(count),
    insertTimelineItem,
    toggleToggleOpen,
  }
}
