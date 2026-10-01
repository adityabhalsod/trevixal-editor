import type { Editor } from '@trevixal/core'

/** Top-level blocks from which a document counts as long. */
export const LONG_DOCUMENT_BLOCKS = 200

/** Set on the editing surface while its document is long. */
export const LONG_DOCUMENT_ATTRIBUTE = 'data-trevixal-long'

/**
 * Mark the editing surface while its document is long, so the stylesheet can
 * leave the browser to skip laying out and painting the blocks off screen
 * (`content-visibility: auto`): a manuscript of hundreds of pages stays as
 * quick to type in as a page. Returns a disposer.
 */
export function enableLongDocumentMode(
  editor: Editor,
  threshold = LONG_DOCUMENT_BLOCKS,
): () => void {
  const view = editor.view
  if (!view) return () => {}
  const sync = (): void => {
    view.dom.toggleAttribute(LONG_DOCUMENT_ATTRIBUTE, editor.state.doc.childCount >= threshold)
  }
  sync()
  const stop = editor.on('update', sync)
  return () => {
    stop()
    view.dom.removeAttribute(LONG_DOCUMENT_ATTRIBUTE)
  }
}
