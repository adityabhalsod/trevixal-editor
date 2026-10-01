import { Fragment } from '../model/fragment'
import { inlineSize, marksAtInlineOffset } from '../model/inline'
import type { EditorNode } from '../model/node'
import { pos } from '../model/position'
import { nodeAtPath } from '../model/tree'
import type { EditorState } from '../state/editor-state'
import { TextSelection } from '../state/selection'
import { ReplaceInlineStep } from '../state/steps/replace-inline'
import type { Transaction } from '../state/transaction'
import type { InputRule, InputRuleContext } from './input-rules'

/**
 * Word's AutoFormat and AutoCorrect as you type: curly quotes, dashes, the
 * ellipsis, fractions, arrows and symbols, and misspellings put right.
 *
 * These are `after` rules: the character goes in as typed first, and the
 * change follows as an undo step of its own, so Ctrl+Z straight after takes
 * the change back and leaves exactly what was typed, as in Word. They also
 * work in text that follows an inline node (a footnote marker, an equation),
 * matched against the text since it.
 */

/** Stands for an inline node before the text a rule sees: a character that is no space. */
const INLINE_NODE = '￼'

/**
 * The text of `block` from its last inline node before `offset` up to
 * `offset`, and the inline offset its first character is at. An inline node
 * in front shows as {@link INLINE_NODE} (a line break as a newline), at the
 * node's own offset.
 */
function textBeforeCaret(block: EditorNode, offset: number): { text: string; start: number } {
  let position = 0
  let start = 0
  let text = ''
  for (const child of block.content.children) {
    if (position >= offset) break
    const size = inlineSize(child)
    if (child.isText) {
      text += child.textContent.slice(0, Math.max(0, offset - position))
    } else {
      // A line break is a space between words; anything else stands for a word.
      text = child.type.name === 'hardBreak' ? '\n' : INLINE_NODE
      start = position
    }
    position += size
  }
  return { text, start }
}

/**
 * Run the `after` rules for the text just typed at the caret, on the state it
 * produced. Returns the change, or null when none applies. Source text (a code
 * block, text marked as code) is left as typed.
 */
export function applyTypedTextRules(
  state: EditorState,
  rules: readonly InputRule[],
): Transaction | null {
  const selection = state.selection
  if (!(selection instanceof TextSelection) || !selection.empty) return null
  const point = selection.head
  const block = nodeAtPath(state.doc, point.path)
  if (!block?.isTextblock || block.type.spec.preserveWhitespace) return null
  if (marksAtInlineOffset(block.content, point.offset).some((mark) => mark.type.name === 'code')) {
    return null
  }
  const { text, start } = textBeforeCaret(block, point.offset)
  for (const rule of rules) {
    if (!rule.after) continue
    const match = rule.match.exec(text)
    if (!match || match.index + match[0].length !== text.length) continue
    const tr = rule.run(
      { state, blockPath: point.path, block, from: start + match.index, to: point.offset },
      match,
    )
    if (tr) return tr
  }
  return null
}

/**
 * Replace `[from, to)` of the block with `text`, in the marks the text there
 * had, and leave the caret after it. What every rule here does.
 */
function replaceText(
  context: InputRuleContext,
  from: number,
  to: number,
  text: string,
): Transaction {
  const { state, blockPath, block } = context
  const marks = marksAtInlineOffset(block.content, to)
  const tr = state.tr
  tr.step(new ReplaceInlineStep(blockPath, from, to, Fragment.of(state.schema.text(text, marks))))
  const caret = context.to - (to - from) + text.length
  return tr.setSelection(new TextSelection(pos(blockPath, caret)))
}

/** A rule turning the whole of `match` into `text`. */
function symbol(match: RegExp, text: string, enabled: () => boolean): InputRule {
  return {
    match,
    after: true,
    run: (context) => (enabled() ? replaceText(context, context.from, context.to, text) : null),
  }
}

/** Where a quote opens rather than closes: at the start, after a space, a bracket, a dash or another opening quote. */
const OPENS = '(?:^|[\\s(\\[{—–“‘])'

const FRACTIONS: Readonly<Record<string, string>> = { '1/2': '½', '1/4': '¼', '3/4': '¾' }

export interface TypographyOptions {
  /** Read on every keystroke, so a setting can switch them off and on again. Always on by default. */
  readonly enabled?: () => boolean
}

/**
 * Curly quotes and apostrophes; ` - ` between words to an en dash; `...` to
 * an ellipsis; 1/2, 1/4 and 3/4 to their fractions; `->`, `<-` and `=>` to
 * arrows; (c), (r) and (tm) to their signs. The em dash for `--` is one of
 * the {@link defaultInputRules}.
 */
export function smartTypographyRules(options: TypographyOptions = {}): InputRule[] {
  const enabled = options.enabled ?? (() => true)
  const lastCharacter =
    (text: string): InputRule['run'] =>
    (context) =>
      enabled() ? replaceText(context, context.to - 1, context.to, text) : null
  return [
    { match: new RegExp(`${OPENS}"$`), after: true, run: lastCharacter('“') },
    { match: /"$/, after: true, run: lastCharacter('”') },
    { match: new RegExp(`${OPENS}'$`), after: true, run: lastCharacter('‘') },
    // A closing quote, and the apostrophe in "don't".
    { match: /'$/, after: true, run: lastCharacter('’') },
    symbol(/\.\.\.$/, '…', enabled),
    {
      // Between two words, typed as `word - ` and taken when the space after it is.
      match: /\S - $/,
      after: true,
      run: (context) =>
        enabled() ? replaceText(context, context.to - 2, context.to - 1, '–') : null,
    },
    {
      // A fraction standing alone, taken when the character after it ends it.
      match: /(?:^|[^\d/])(1\/2|1\/4|3\/4)[\s.,;:!?)]$/,
      after: true,
      run: (context, match) => {
        const fraction = FRACTIONS[match[1] as string]
        if (!enabled() || !fraction) return null
        const end = context.to - 1
        return replaceText(context, end - 3, end, fraction)
      },
    },
    symbol(/->$/, '→', enabled),
    symbol(/<-$/, '←', enabled),
    symbol(/=>$/, '⇒', enabled),
    symbol(/\([cC]\)$/, '©', enabled),
    symbol(/\([rR]\)$/, '®', enabled),
    symbol(/\((?:tm|TM)\)$/, '™', enabled),
  ]
}

/**
 * Misspellings Word's AutoCorrect puts right out of the box, and a few of
 * its conveniences. Keys are lower case; the case the word was typed in is
 * kept.
 */
export const AUTOCORRECT_WORDS: Readonly<Record<string, string>> = {
  accomodate: 'accommodate',
  acheive: 'achieve',
  adn: 'and',
  alot: 'a lot',
  arguement: 'argument',
  becuase: 'because',
  begining: 'beginning',
  beleive: 'believe',
  calender: 'calendar',
  cemetary: 'cemetery',
  commited: 'committed',
  concious: 'conscious',
  definately: 'definitely',
  dont: "don't",
  embarass: 'embarrass',
  enviroment: 'environment',
  existance: 'existence',
  foriegn: 'foreign',
  freind: 'friend',
  goverment: 'government',
  grammer: 'grammar',
  harrass: 'harass',
  independant: 'independent',
  occured: 'occurred',
  occurence: 'occurrence',
  persue: 'pursue',
  posession: 'possession',
  publically: 'publicly',
  recieve: 'receive',
  recomend: 'recommend',
  refered: 'referred',
  relevent: 'relevant',
  seperate: 'separate',
  succesful: 'successful',
  teh: 'the',
  thier: 'their',
  tommorow: 'tomorrow',
  truely: 'truly',
  untill: 'until',
  wich: 'which',
  wierd: 'weird',
}

export interface AutocorrectOptions {
  /** The list, read on every word, so edits to it apply at once. Keys are matched in lower case. */
  readonly words?: () => Readonly<Record<string, string>>
  /** Read on every word; always on by default. */
  readonly enabled?: () => boolean
  /**
   * Read on every word: whether an apostrophe in a correction goes in curled,
   * as smart quotes would have typed it (dont → don’t). Off by default.
   */
  readonly curlyQuotes?: () => boolean
}

/** A replacement in the case the word was typed in: Teh → The, TEH → THE. */
function inCaseOf(typed: string, replacement: string): string {
  if (typed.length > 1 && typed === typed.toUpperCase()) return replacement.toUpperCase()
  const first = typed[0] ?? ''
  if (first !== first.toLowerCase()) return replacement[0]?.toUpperCase() + replacement.slice(1)
  return replacement
}

/**
 * Word's AutoCorrect: a word on the list is replaced by its correction once
 * it is finished, by a space or punctuation after it.
 */
export function autocorrectRule(options: AutocorrectOptions = {}): InputRule {
  const words = options.words ?? (() => AUTOCORRECT_WORDS)
  const enabled = options.enabled ?? (() => true)
  const curlyQuotes = options.curlyQuotes ?? (() => false)
  return {
    // A word (letters, apostrophes inside it: don't), any closing quotes or
    // brackets after it, then the space or punctuation that finished it.
    match: /(?:^|[^\p{L}\p{N}'’])(\p{L}+(?:['’]\p{L}+)*)([)\]}"'”’»]*)[\s.,;:!?]$/u,
    after: true,
    run: (context, match) => {
      if (!enabled()) return null
      const typed = match[1] as string
      const correction = words()[typed.toLowerCase()]
      if (!correction || correction === typed) return null
      const end = context.to - 1 - (match[2] ?? '').length
      const replacement = inCaseOf(typed, correction)
      const text = curlyQuotes() ? replacement.replaceAll("'", '’') : replacement
      return replaceText(context, end - typed.length, end, text)
    },
  }
}
