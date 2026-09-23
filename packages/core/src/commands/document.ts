import { type Attrs, attrsEq } from '../model/attrs'
import { blocksInRange } from '../model/blocks'
import { type TextDirection, textDirection } from '../schema/document-settings'
import { headingNumberingScheme } from '../schema/heading-numbering'
import { SetNodeAttrsStep } from '../state/steps/attrs-step'
import type { Command } from './commands'

/**
 * Merge settings into the document's own attributes, as one undoable step.
 * Only attributes the schema's doc node declares are touched, so a schema
 * without, say, line numbers is left alone rather than given a stray attr.
 */
export function setDocumentAttrs(attrs: Attrs): Command {
  return (state) => {
    const doc = state.doc
    const declared = doc.type.spec.attrs ?? {}
    const known = Object.entries(attrs).filter(([name]) => name in declared)
    const next = { ...doc.attrs, ...Object.fromEntries(known) }
    if (attrsEq(doc.attrs, next)) return null
    return state.tr.step(new SetNodeAttrsStep([], next))
  }
}

/** Number the document's headings with a scheme, by id, or stop numbering them (null). */
export function setHeadingNumbering(schemeId: string | null): Command {
  if (schemeId !== null && !headingNumberingScheme(schemeId)) return () => null
  return setDocumentAttrs({ headingNumbering: schemeId })
}

/**
 * The whole document's direction: `rtl`, or `ltr` (stored as nothing, since
 * it is the default). A block with a direction of its own keeps it.
 */
export function setDocumentDirection(direction: TextDirection): Command {
  return setDocumentAttrs({ direction: direction === 'rtl' ? 'rtl' : null })
}

/** Show or hide line numbers in the margin. */
export function setLineNumbers(on: boolean): Command {
  return setDocumentAttrs({ lineNumbers: on })
}

/**
 * Set the direction of every block the selection touches that has one:
 * `rtl`, `ltr`, or null to follow the document's. A code block, which is
 * always left to right, has no `dir` and is skipped.
 */
export function setTextDirection(dir: TextDirection | null): Command {
  return (state) => {
    const value = textDirection(dir)
    const tr = state.tr
    for (const block of blocksInRange(state.doc, state.selection.from, state.selection.to)) {
      if (!('dir' in (block.node.type.spec.attrs ?? {}))) continue
      if ((block.node.attrs.dir ?? null) === value) continue
      tr.step(new SetNodeAttrsStep(block.path, { ...block.node.attrs, dir: value }))
    }
    return tr.docChanged ? tr : null
  }
}
