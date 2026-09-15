import type { Command } from '@trevixal/core'
import {
  type LinkCardAttrs,
  insertAudio,
  insertEmbed,
  insertIframe,
  insertLinkCard,
  insertVideo,
} from './commands'
import type { EmbedNodesOptions } from './url'

export { formatBytes } from './format'

/**
 * The command bundle `@trevixal/ui` expects, so the UI package can offer
 * embeds without importing this one:
 *
 * ```ts
 * createEditorUI(editor, { container, embedCommands: embedUICommands(options) })
 * ```
 *
 * Pass the same `options` the schema was created with, so the toolbar's
 * allowlist matches the parser's.
 */
export interface EmbedUICommands {
  /** Auto-detect: YouTube/Vimeo player, direct media, or an allowlisted iframe. */
  readonly insertEmbed: (url: string) => Command
  readonly insertVideo: (src: string) => Command
  readonly insertAudio: (src: string) => Command
  readonly insertIframe: (src: string, title?: string) => Command
  readonly insertLinkCard: (attrs: LinkCardAttrs) => Command
}

export function embedUICommands(options: EmbedNodesOptions = {}): EmbedUICommands {
  return {
    insertEmbed: (url) => insertEmbed(url, options),
    insertVideo: (src) => insertVideo({ src }),
    insertAudio: (src) => insertAudio({ src }),
    insertIframe: (src, title) => insertIframe({ src, title: title ?? null }, options),
    insertLinkCard: (attrs) => insertLinkCard(attrs),
  }
}
