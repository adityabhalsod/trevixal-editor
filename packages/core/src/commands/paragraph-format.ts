import { type Attrs, attrsEq } from '../model/attrs'
import { blocksInRange } from '../model/blocks'
import { nodeAtPath } from '../model/tree'
import { safeColor } from '../schema/css-values'
import {
  DROP_CAP_LINES,
  type DropCapKind,
  type ParagraphBorder,
  type TabStop,
  formatTabStops,
  paragraphBorderAttrs,
  paragraphShadingOf,
  parseTabStops,
  tabStopsOf,
} from '../schema/paragraph-format'
import { SetNodeAttrsStep } from '../state/steps/attrs-step'
import { type Command, insertText } from './commands'

/**
 * Merge `attrs` into every textblock the selection touches that declares
 * them all, as one step. A block without them (a code block) is skipped
 * rather than given attributes its schema does not know.
 */
function setTextblockAttrs(attrs: Attrs): Command {
  return (state) => {
    const tr = state.tr
    for (const block of blocksInRange(state.doc, state.selection.from, state.selection.to)) {
      const declared = block.node.type.spec.attrs ?? {}
      if (!Object.keys(attrs).every((name) => name in declared)) continue
      const next = { ...block.node.attrs, ...attrs }
      if (attrsEq(block.node.attrs, next)) continue
      tr.step(new SetNodeAttrsStep(block.path, next))
    }
    return tr.docChanged ? tr : null
  }
}

/** Rule the selected paragraphs with a border, as Word's Borders; null takes it off. */
export function setParagraphBorder(border: ParagraphBorder | null): Command {
  return setTextblockAttrs(paragraphBorderAttrs(border))
}

/** Fill the selected paragraphs with a colour, as Word's Shading; null takes it off. */
export function setParagraphShading(color: string | null): Command {
  const shading = color === null ? null : safeColor(color)
  if (color !== null && shading === null) return () => null
  // A colour that shows nothing takes the shading off.
  return setTextblockAttrs({ shading: paragraphShadingOf({ shading }) })
}

/**
 * Give the selected paragraphs a drop cap spanning `lines` lines, dropped into
 * the text or hung in the margin; null takes it off.
 */
export function setDropCap(
  kind: DropCapKind | null,
  lines: number = DROP_CAP_LINES.default,
): Command {
  if (kind === null) return setTextblockAttrs({ dropCap: null, dropCapLines: null })
  if (kind !== 'drop' && kind !== 'margin') return () => null
  const wanted = Number.isFinite(lines) ? Math.round(lines) : DROP_CAP_LINES.default
  const span = Math.min(DROP_CAP_LINES.max, Math.max(DROP_CAP_LINES.min, wanted))
  return setTextblockAttrs({ dropCap: kind, dropCapLines: span })
}

/** Set the selected paragraphs' custom tab stops; an empty list or null clears them. */
export function setTabStops(stops: readonly TabStop[] | null): Command {
  const kept = parseTabStops(formatTabStops(stops ?? []))
  return setTextblockAttrs({ tabStops: kept.length > 0 ? formatTabStops(kept) : null })
}

/**
 * A tab character at the caret, in a paragraph with tab stops of its own:
 * what Tab does there, as in Word. Anywhere else it declines, and Tab goes on
 * moving focus out of the editor, as keyboard users expect of a web page.
 */
export const insertTabAtStop: Command = (state) => {
  const block = nodeAtPath(state.doc, state.selection.from.path)
  if (!block?.isTextblock || tabStopsOf(block.attrs).length === 0) return null
  return insertText('\t')(state)
}
