import {
  type Attrs,
  type Command,
  Fragment,
  NodeSelection,
  ReplaceNodesStep,
  TextSelection,
  inlineLength,
  nodeAtPath,
  pos,
} from '@trevixal/core'

/**
 * Put in a code block holding `text`, with the caret at the end of it. It
 * takes the place of an empty paragraph at the caret, which is only waiting
 * to be filled; after any other block, or a selected node, it goes after.
 */
export function insertCodeBlock(attrs: Attrs, text: string): Command {
  return (state) => {
    const type = state.schema.nodes.codeBlock
    if (!type) return null
    const selection = state.selection
    let parentPath: readonly number[]
    let from: number
    let to: number
    if (selection instanceof NodeSelection) {
      parentPath = selection.parentPath
      from = selection.index + 1
      to = from
    } else {
      const path = selection.to.path
      if (path.length === 0) return null
      parentPath = path.slice(0, -1)
      const index = path[path.length - 1] as number
      const block = nodeAtPath(state.doc, path)
      const waiting = block?.type.name === 'paragraph' && inlineLength(block.content) === 0
      from = waiting ? index : index + 1
      to = index + 1
    }
    const block = type.create(attrs, text ? Fragment.of(state.schema.text(text)) : Fragment.empty)
    const tr = state.tr.step(new ReplaceNodesStep(parentPath, from, to, Fragment.of(block)))
    return tr.setSelection(new TextSelection(pos([...parentPath, from], text.length)))
  }
}
