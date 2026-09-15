import type { Editor } from '../editor/editor'

/**
 * The document a piece of floating chrome should build itself into.
 *
 * Every dropdown, popover, toolbar and handle needs the same thing and used to
 * work it out the same three lines at a time: the view's own element if the
 * editor has a view, otherwise whatever container the caller was given, and
 * the document that element belongs to.
 *
 * It throws rather than returning null because there is nothing useful a
 * control can do without one. It would have to build into a document it
 * invented, which no host would ever see. `caller` is in the message because
 * a host wiring six of these in a row needs to know which of them it called
 * before the editor had a view.
 */
export function editorDocument(
  editor: Editor,
  container: Element | null | undefined,
  caller: string,
): Document {
  const host = editor.view?.dom ?? container
  const document = host?.ownerDocument
  if (!document) throw new Error(`${caller}: the editor must have a view`)
  return document
}
