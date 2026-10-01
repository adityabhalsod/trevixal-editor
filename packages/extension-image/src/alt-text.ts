import { ADD_TO_HISTORY, type Editor, type EditorNode, type Path } from '@trevixal/core'

/** What a file name looks like, which an upload leaves as the alt text until it is written. */
const FILE_NAME = /\.(?:png|jpe?g|gif|webp|avif|svgz?|bmp|heic|tiff?)$/i

/** Whether an image still wants alt text: none, or its file's name, and not marked decorative. */
export function needsAltText(node: EditorNode): boolean {
  if (node.type.name !== 'image' || node.attrs.decorative === true) return false
  const alt = typeof node.attrs.alt === 'string' ? node.attrs.alt.trim() : ''
  return alt === '' || FILE_NAME.test(alt)
}

function imagesOf(doc: EditorNode): { path: Path; node: EditorNode }[] {
  const found: { path: Path; node: EditorNode }[] = []
  const visit = (node: EditorNode, path: Path): void => {
    if (node.type.name === 'image') found.push({ path, node })
    if (node.isTextblock) return
    node.content.children.forEach((child, index) => visit(child, [...path, index]))
  }
  visit(doc, [])
  return found
}

/**
 * Ask for alt text as each image arrives: when an upload finishes, or an
 * image is inserted or pasted, and it has no description of its own (or
 * only its file's name) and is not marked decorative. `ask` gets the new
 * image's path; the host opens its prompt there. One prompt per edit, for
 * the first image the edit brought. An undo or redo brings nothing new.
 * Returns a disposer.
 */
export function promptForAltText(editor: Editor, ask: (path: Path) => void): () => void {
  const seen = new Set<string>()
  for (const { node } of imagesOf(editor.state.doc)) {
    if (typeof node.attrs.src === 'string' && node.attrs.src) seen.add(node.attrs.src)
  }
  return editor.onTransaction(({ transaction, state }) => {
    if (!transaction.docChanged) return
    const replayed = transaction.getMeta(ADD_TO_HISTORY) === false
    let asked = false
    for (const { path, node } of imagesOf(state.doc)) {
      const src = typeof node.attrs.src === 'string' ? node.attrs.src : ''
      if (!src || seen.has(src)) continue
      seen.add(src)
      if (!asked && !replayed && needsAltText(node)) {
        asked = true
        ask(path)
      }
    }
  })
}
