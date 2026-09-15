import { type Command, type Keymap, nodeAtPath } from '@trevixal/core'
import { splitReferenceItem } from './citations'
import { liftOutOfContainer } from './commands'
import { selectFirstTextblock } from './helpers'
import { isTitleNode } from './schema'

/**
 * Enter on an empty trailing paragraph inside a container leaves it, the way
 * a second Enter leaves a code block. Without this a callout at the end of
 * the document traps the cursor: every Enter makes another paragraph inside
 * it and there is no way down to the document body.
 *
 * The blank paragraph the user pressed Enter on is the escape gesture, so it
 * is carried out of the container rather than left behind as a stray line.
 */
export const escapeContainerOnEnter: Command = (state) => {
  const selection = state.selection
  if (!selection.empty) return null
  const path = selection.from.path
  const block = nodeAtPath(state.doc, path)
  // Only an empty block is the gesture, Enter in written text must split.
  if (!block?.isTextblock || block.textContent.length > 0) return null
  return liftOutOfContainer(state)
}

/**
 * Enter on a toggle summary, tab title or accordion title moves the cursor
 * into the body below instead of splitting the line.
 *
 * These titles are one line by construction: their parent's content is
 * exactly `<title> <content>`, so a split writes a second title into it, and
 * a split at the end of the line: where core starts a fresh paragraph rather
 * than a second block of the same type, writes a paragraph. Both leave the
 * toggle, tab item or accordion item holding content its type forbids.
 */
export const enterFromTitle: Command = (state) => {
  const path = state.selection.from.path
  const block = nodeAtPath(state.doc, path)
  if (!block || !isTitleNode(block)) return null
  const index = path[path.length - 1] as number
  const contentPath = [...path.slice(0, -1), index + 1]
  const content = nodeAtPath(state.doc, contentPath)
  if (!content) return null
  return state.tr.setSelection(selectFirstTextblock(content, contentPath))
}

/**
 * Block key bindings. Pass to `createEditor({ keymap: blockKeymap() })`.
 * Enter falls through to the editor's own handling whenever the cursor is
 * not on an empty last paragraph of a container, on the title line of a
 * toggle/tab/accordion, or inside a reference entry.
 */
export function blockKeymap(): Keymap {
  return {
    Enter: (editor) =>
      editor.exec(escapeContainerOnEnter) ||
      editor.exec(enterFromTitle) ||
      editor.exec(splitReferenceItem),
  }
}
