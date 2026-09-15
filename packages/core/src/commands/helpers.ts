import { Fragment } from '../model/fragment'
import { inlineLength } from '../model/inline'
import type { Position } from '../model/position'
import { nodeAtPath, pathsEqual } from '../model/tree'
import { ReplaceInlineStep } from '../state/steps/replace-inline'
import { ReplaceNodesStep } from '../state/steps/replace-nodes'
import { JoinNodesStep } from '../state/steps/split-join'
import type { Transaction } from '../state/transaction'

/**
 * Delete the content between two inline positions, joining the boundary
 * blocks when they are direct siblings. `from` remains a valid position in
 * the resulting document (the caller can place the cursor there).
 */
export function deleteRange(tr: Transaction, from: Position, to: Position): void {
  if (pathsEqual(from.path, to.path)) {
    if (from.offset < to.offset) {
      tr.step(new ReplaceInlineStep(from.path, from.offset, to.offset, Fragment.empty))
    }
    return
  }

  const firstBlock = nodeAtPath(tr.doc, from.path)
  const lastBlock = nodeAtPath(tr.doc, to.path)
  if (!firstBlock?.isTextblock || !lastBlock?.isTextblock) return

  // Trim the tail of the first block and the head of the last block.
  const firstLength = inlineLength(firstBlock.content)
  if (from.offset < firstLength) {
    tr.step(new ReplaceInlineStep(from.path, from.offset, firstLength, Fragment.empty))
  }
  if (to.offset > 0) {
    tr.step(new ReplaceInlineStep(to.path, 0, to.offset, Fragment.empty))
  }

  // Remove whole nodes strictly between the two boundary branches.
  let divergence = 0
  while (from.path[divergence] === to.path[divergence]) divergence++
  const commonPath = from.path.slice(0, divergence)
  const firstIndex = from.path[divergence] as number
  const lastIndex = to.path[divergence] as number
  if (lastIndex > firstIndex + 1) {
    tr.step(new ReplaceNodesStep(commonPath, firstIndex + 1, lastIndex, Fragment.empty))
  }

  // Join the boundary blocks when they are direct siblings.
  const directSiblings = from.path.length === divergence + 1 && to.path.length === divergence + 1
  if (directSiblings) {
    tr.step(new JoinNodesStep(from.path, from.offset))
  }
}
