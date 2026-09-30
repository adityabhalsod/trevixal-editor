import type { EditorNode } from '@trevixal/core'
import { resolveConditionals } from '@trevixal/extension-blocks'
import { redactDocument } from '@trevixal/extension-security'

/**
 * The document as it leaves the editor, in a download or on paper: content
 * shown only for some variables settled by them, and redacted words replaced
 * by their stand-in.
 */
export function readerCopy(doc: EditorNode): EditorNode {
  return redactDocument(resolveConditionals(doc))
}
