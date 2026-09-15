import type { Command } from '@trevixal/core'
import { formatCodeBlock, minifyCodeBlock } from './commands'

/**
 * The command bundle `@trevixal/ui` expects, so the UI package can offer
 * JSON/XML formatting without importing this one:
 *
 * ```ts
 * createEditorUI(editor, { container, codeFormatCommands: codeFormatUICommands() })
 * ```
 */
export interface CodeFormatUICommands {
  readonly formatJSON: Command
  readonly formatXML: Command
  readonly minify: Command
}

export function codeFormatUICommands(): CodeFormatUICommands {
  const json = formatCodeBlock('json')
  const xml = formatCodeBlock('xml')
  const minifyJson = minifyCodeBlock('json')
  const minifyXml = minifyCodeBlock('xml')
  return {
    formatJSON: json,
    formatXML: xml,
    // One Minify button for both: each command declines when the block is not
    // its language, so trying JSON and falling through to XML picks the right
    // one without the user having to say which.
    minify: (state) => minifyJson(state) ?? minifyXml(state),
  }
}
