import {
  type EditorNode,
  Fragment,
  type InputRule,
  ReplaceInlineStep,
  TextSelection,
  pos,
} from '@trevixal/core'
import { MATH_NODE } from './schema'

/**
 * `$…$` closed by the typed `$`. The lookbehind keeps `$$`, display math,
 * which this rule deliberately leaves alone, from opening a formula, and
 * keeps an escaped `\$` from counting as a delimiter. The body may not
 * contain a `$` and may not end in a backslash, so the closing delimiter is
 * always the real one.
 */
const DOLLAR_MATH = /(?<![$\\])\$([^$]*[^$\\])\$$/

/**
 * Blocks where a formula would be wrong rather than merely unusual: a code
 * block stores source verbatim, so `$x$` there is text the author meant to
 * keep. Both signals are how core spells "no rich inline content here".
 */
function allowsMath(block: EditorNode): boolean {
  const spec = block.type.spec
  return spec.marks !== '' && spec.preserveWhitespace !== true
}

/**
 * The `$…$` shortcut, to merge into an editor's rules:
 * `createEditor({ schema, inputRules: [...defaultInputRules(), ...mathInputRules()] })`.
 *
 * Typing the closing `$` swallows the whole `$…$` run and leaves an inline
 * math atom with the caret after it.
 */
export function mathInputRules(): InputRule[] {
  return [
    {
      match: DOLLAR_MATH,
      run: ({ state, blockPath, block, from, to }, match) => {
        if (!allowsMath(block)) return null
        const type = state.schema.nodes[MATH_NODE]
        if (!type) return null
        const latex = (match[1] ?? '').trim()
        if (latex.length === 0) return null
        const tr = state.tr
        tr.step(new ReplaceInlineStep(blockPath, from, to, Fragment.of(type.create({ latex }))))
        tr.setSelection(new TextSelection(pos(blockPath, from + 1)))
        return tr
      },
    },
  ]
}
