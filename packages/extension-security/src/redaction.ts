import {
  type Command,
  type Editor,
  type EditorNode,
  type EditorState,
  Fragment,
  type MarkSpec,
  TREVIXAL_MIME,
  blocksInRange,
  serializeToHTML,
  sliceInline,
  toggleMark,
} from '@trevixal/core'

/**
 * Redaction: words blacked out, and gone from anything that leaves the
 * editor. The author keeps them under a black bar; a download, a print or a
 * copy gets a fixed row of blocks in their place, the same however long the
 * words were, so not even their length gets out.
 */

export const REDACTION_MARK = 'redaction'

/** What stands in for redacted words wherever they leave the editor. */
export const REDACTED = '█████'

/** The `redaction` mark, to merge into a schema's marks. */
export function redactionMarks(): Record<string, MarkSpec> {
  return {
    [REDACTION_MARK]: {
      toHTML: () => ({ tag: 'span', attrs: { class: 'trevixal-redacted', 'data-redacted': '' } }),
      parseHTML: [{ tag: 'span', attribute: 'data-redacted' }],
    },
  }
}

/** Black out the selected words, or bring back ones already blacked out. */
export const toggleRedaction: Command = (state) =>
  state.schema.marks[REDACTION_MARK] ? toggleMark(REDACTION_MARK)(state) : null

const isRedacted = (node: EditorNode): boolean =>
  node.marks.some((mark) => mark.type.name === REDACTION_MARK)

/** A textblock with each run of redacted text replaced by one stand-in. */
function redactBlock(block: EditorNode): EditorNode {
  const children: EditorNode[] = []
  let previousRedacted = false
  for (const child of block.content.children) {
    const redacted = isRedacted(child)
    // One stand-in for the whole run, however many nodes its marks split it into.
    if (redacted && !previousRedacted) children.push(block.type.schema.text(REDACTED, child.marks))
    if (!redacted) children.push(child)
    previousRedacted = redacted
  }
  return block.withContent(Fragment.from(children))
}

/**
 * The document with every redacted run replaced by the stand-in, still
 * marked, so a page shows a black bar and a file holds nothing of the words.
 */
export function redactDocument(doc: EditorNode): EditorNode {
  // Untouched nodes stay the same objects: what the editor drew for a block
  // (highlighted code, a diagram's picture) is found by the node itself.
  if (!hasRedactions(doc)) return doc
  if (doc.isTextblock) return redactBlock(doc)
  return doc.withContent(Fragment.from(doc.content.children.map(redactDocument)))
}

/** Whether anything in this node is redacted. */
export function hasRedactions(node: EditorNode): boolean {
  if (node.isText) return isRedacted(node)
  return node.content.children.some(hasRedactions)
}

/** The selected part of each block, as the view puts it on the clipboard. */
function selectedBlocks(state: EditorState): readonly EditorNode[] {
  const { doc, selection } = state
  if (selection.empty) return []
  return blocksInRange(doc, selection.from, selection.to)
    .filter((block) => block.from < block.to)
    .map((block) => block.node.withContent(sliceInline(block.node.content, block.from, block.to)))
}

function writeBlocks(data: DataTransfer, blocks: readonly EditorNode[]): void {
  data.setData('text/html', blocks.map((block) => serializeToHTML(block)).join(''))
  data.setData('text/plain', blocks.map((block) => block.textContent).join('\n'))
  data.setData(TREVIXAL_MIME, JSON.stringify(blocks.map((block) => block.toJSON())))
}

/**
 * Copy, cut and a dragged selection carry the stand-in, never the words under
 * the bars. The selection is read as the event starts, before a cut deletes
 * it, and written after the view's own handler, over what that put there. A
 * restriction that blocks copying stops the event before either, so nothing
 * lands at all. Returns a disposer.
 */
export function protectRedactionsOnCopy(editor: Editor): () => void {
  const view = editor.view
  if (!view) return () => {}
  let pending: { readonly event: Event; readonly blocks: readonly EditorNode[] } | null = null
  const read = (event: Event): void => {
    const blocks = selectedBlocks(editor.state)
    pending = blocks.some(hasRedactions) ? { event, blocks: blocks.map(redactDocument) } : null
  }
  const write = (event: Event): void => {
    const data =
      (event as ClipboardEvent).clipboardData ?? (event as DragEvent).dataTransfer ?? null
    if (pending?.event === event && data) writeBlocks(data, pending.blocks)
    pending = null
  }
  const types = ['copy', 'cut', 'dragstart'] as const
  for (const type of types) {
    view.dom.addEventListener(type, read, true)
    view.dom.addEventListener(type, write)
  }
  return () => {
    for (const type of types) {
      view.dom.removeEventListener(type, read, true)
      view.dom.removeEventListener(type, write)
    }
  }
}
