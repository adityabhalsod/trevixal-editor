import { isListItemTypeName } from '../commands/lists'
import { NEW_HISTORY_GROUP } from '../history/history'
import { Fragment } from '../model/fragment'
import { marksAtInlineOffset } from '../model/inline'
import type { EditorNode } from '../model/node'
import { pos } from '../model/position'
import { type Path, nodeAtPath } from '../model/tree'
import { safeHref } from '../schema/basic'
import type { EditorState } from '../state/editor-state'
import { TextSelection } from '../state/selection'
import { AddMarkStep } from '../state/steps/mark-steps'
import { ReplaceInlineStep } from '../state/steps/replace-inline'
import { ReplaceNodesStep, replaceNodeAt } from '../state/steps/replace-nodes'
import { WrapNodesStep } from '../state/steps/wrap-lift'
import type { Transaction } from '../state/transaction'

export interface InputRuleContext {
  readonly state: EditorState
  readonly blockPath: Path
  readonly block: EditorNode
  /** Matched range in the block's existing inline content ([from, caret)). */
  readonly from: number
  readonly to: number
}

/**
 * A pattern-triggered transform. `match` runs against the block text from its
 * start to the caret plus the just-typed character, and must anchor at the
 * end (`$`). When it fires, the typed character is never inserted. The rule
 * produces the whole transaction.
 */
export interface InputRule {
  readonly match: RegExp
  readonly run: (context: InputRuleContext, match: RegExpExecArray) => Transaction | null
  /**
   * Run once the typed character is in the document, as an undo step of its
   * own, instead of in its place: Word's AutoFormat as you type, which Ctrl+Z
   * takes back leaving what was typed. `match` then sees the text up to and
   * including the character, from the last inline node before it (shown as
   * U+FFFC), and so also fires after a footnote marker or an equation. See
   * `applyTypedTextRules`.
   */
  readonly after?: boolean
}

/**
 * Try the rules for a typed character. Returns the transform transaction, or
 * null when no rule applies (the caller then inserts the text normally).
 */
export function applyInputRules(
  state: EditorState,
  typed: string,
  rules: readonly InputRule[],
): Transaction | null {
  if (typed.length !== 1) return null
  const selection = state.selection
  if (!(selection instanceof TextSelection) || !selection.empty) return null
  const point = selection.head
  const block = nodeAtPath(state.doc, point.path)
  if (!block?.isTextblock) return null
  // Source text is typed, not written: "# ", "> ", "```" and "--" are all
  // things a code block is expected to hold literally, so no rule may fire
  // inside one. The same goes for text already carrying the `code` mark.
  if (block.type.spec.preserveWhitespace) return null
  if (isInsideInlineCode(block, point.offset)) return null
  // Offsets in `textContent` equal inline offsets only without atoms, bail otherwise.
  if (block.content.children.some((child) => !child.isText)) return null
  const textBefore = block.textContent.slice(0, point.offset)
  const candidate = textBefore + typed
  for (const rule of rules) {
    if (rule.after) continue
    const match = rule.match.exec(candidate)
    if (!match || match.index + match[0].length !== candidate.length) continue
    const tr = rule.run(
      { state, blockPath: point.path, block, from: match.index, to: point.offset },
      match,
    )
    if (tr) return tr.setMeta(NEW_HISTORY_GROUP, true)
  }
  return null
}

/**
 * Whether the text the caret is extending carries the `code` mark. Marks
 * continue from the left as you type, so it is the run *ending* at the caret
 * that decides. The same rule `marksAtInlineOffset` applies.
 */
function isInsideInlineCode(block: EditorNode, offset: number): boolean {
  const marks = marksAtInlineOffset(block.content, offset)
  return marks.some((mark) => mark.type.name === 'code')
}

export interface DefaultInputRuleOptions {
  /** `--` → em dash. On by default. */
  readonly emDash?: boolean
  /** Link a URL as soon as it is followed by a space. On by default. */
  readonly autolink?: boolean
  /** `` `text` `` → inline code, on the closing backtick. On by default. */
  readonly inlineCode?: boolean
}

/** The stock markdown-style shortcuts: headings, lists, quote, code, em dash. */
export function defaultInputRules(options: DefaultInputRuleOptions = {}): InputRule[] {
  const rules: InputRule[] = [
    // "## " → heading
    {
      match: /^(#{1,6}) $/,
      run: ({ state, blockPath, from, to }, match) => {
        const level = (match[1] as string).length
        const tr = state.tr
        tr.step(new ReplaceInlineStep(blockPath, from, to, Fragment.empty))
        const block = nodeAtPath(tr.doc, blockPath)
        if (!block) return null
        tr.step(
          replaceNodeAt(
            blockPath,
            Fragment.of(state.schema.nodeType('heading').create({ level }, block.content)),
          ),
        )
        tr.setSelection(new TextSelection(pos(blockPath, 0)))
        return tr
      },
    },
    // "- " / "* " / "+ " → bullet list; "1. " → ordered list
    {
      match: /^([-*+]) $/,
      run: (context) => wrapInList(context, 'bulletList', undefined),
    },
    {
      match: /^(\d{1,9})\. $/,
      run: (context, match) =>
        wrapInList(context, 'orderedList', {
          start: Number.parseInt(match[1] as string, 10),
        }),
    },
    // "> " → blockquote
    {
      match: /^> $/,
      run: ({ state, blockPath, from, to }) => {
        const tr = state.tr
        tr.step(new ReplaceInlineStep(blockPath, from, to, Fragment.empty))
        const parentPath = blockPath.slice(0, -1)
        const index = blockPath[blockPath.length - 1] as number
        tr.step(new WrapNodesStep(parentPath, index, index + 1, 'blockquote'))
        tr.setSelection(new TextSelection(pos([...parentPath, index, 0], 0)))
        return tr
      },
    },
    // "```" → code block
    {
      match: /^```$/,
      run: ({ state, blockPath, from, to }) => {
        const tr = state.tr
        tr.step(new ReplaceInlineStep(blockPath, from, to, Fragment.empty))
        const block = nodeAtPath(tr.doc, blockPath)
        if (!block) return null
        tr.step(
          replaceNodeAt(
            blockPath,
            Fragment.of(state.schema.nodeType('codeBlock').create(undefined, block.content)),
          ),
        )
        tr.setSelection(new TextSelection(pos(blockPath, 0)))
        return tr
      },
    },
  ]
  if (options.autolink !== false) rules.push(autolinkRule())
  if (options.inlineCode !== false) rules.push(inlineCodeRule())
  if (options.emDash !== false) {
    rules.push({
      match: /--$/,
      run: ({ state, blockPath, from, to }) => {
        const tr = state.tr
        tr.step(new ReplaceInlineStep(blockPath, from, to, Fragment.of(state.schema.text('—'))))
        tr.setSelection(new TextSelection(pos(blockPath, from + 1)))
        return tr
      },
    })
  }
  return rules
}

function wrapInList(
  context: InputRuleContext,
  listTypeName: string,
  attrs: Record<string, unknown> | undefined,
): Transaction | null {
  const { state, blockPath, from, to } = context
  // Never trigger inside an existing list item or a non-paragraph block.
  if (context.block.type.name !== 'paragraph') return null
  const parentPath = blockPath.slice(0, -1)
  if (parentPath.length > 0 && isListItemTypeName(nodeAtPath(state.doc, parentPath)?.type.name)) {
    return null
  }
  const tr = state.tr
  tr.step(new ReplaceInlineStep(blockPath, from, to, Fragment.empty))
  const block = nodeAtPath(tr.doc, blockPath)
  if (!block) return null
  const index = blockPath[blockPath.length - 1] as number
  const schema = state.schema
  const item = schema.nodeType('listItem').create(undefined, Fragment.of(block))
  tr.step(
    new ReplaceNodesStep(
      parentPath,
      index,
      index + 1,
      Fragment.of(schema.nodeType(listTypeName).create(attrs, Fragment.of(item))),
    ),
  )
  tr.setSelection(new TextSelection(pos([...parentPath, index, 0, 0], 0)))
  return tr
}

/**
 * A URL followed by a space becomes a link. Matching only at a terminating
 * space (or closing bracket) means the rule fires once, on a complete URL,
 * rather than re-running on every keystroke as one is typed.
 *
 * Trailing sentence punctuation is left out of the link. "See https://x.dev."
 * should not link the full stop. Balanced trailing parens are kept, since
 * they are common in real URLs (Wikipedia article titles, for one).
 */
const AUTOLINK = /(?:^|[\s(])((?:https?:\/\/|www\.)[^\s<>"'`]{2,2000})([\s)])$/i

function autolinkRule(): InputRule {
  return {
    match: AUTOLINK,
    run: ({ state, blockPath, block, to }, match) => {
      const type = state.schema.markType('link')
      // Code blocks disallow every mark, so this is what keeps a URL typed
      // into one plain text. The same check covers any such block type.
      if (!block.type.allowsMarkType(type)) return null

      const raw = match[1] as string
      const trailing = match[2] as string
      const url = trimTrailingPunctuation(raw)
      if (url.length === 0) return null
      // `www.` is a URL to a human but not to a browser; give it a scheme.
      const href = safeHref(/^www\./i.test(url) ? `https://${url}` : url)
      if (!href) return null

      // The *matched* text, punctuation included, is what sits immediately
      // before the typed character, so the start is measured from the raw
      // match and the link then stops short of the punctuation. Measuring
      // from the trimmed URL instead would shift the whole span right, eating
      // the first character of the URL and marking the full stop after it.
      const start = to - raw.length
      if (start < 0) return null
      const end = start + url.length

      const tr = state.tr
      tr.step(new AddMarkStep(blockPath, start, end, type.create({ href })))
      // The rule swallowed the typed character, so put it back, unmarked,
      // or the link would keep growing as the user carries on typing. It
      // belongs at the caret, after any punctuation left out of the link.
      tr.step(new ReplaceInlineStep(blockPath, to, to, Fragment.of(state.schema.text(trailing))))
      tr.setSelection(new TextSelection(pos(blockPath, to + trailing.length)))
      return tr
    },
  }
}

/**
 * `` `code` `` → the text between the backticks in the `code` mark, on the
 * closing backtick. Three backticks in a row are the code-block rule's, so a
 * run of backticks with nothing between them never matches here.
 */
function inlineCodeRule(): InputRule {
  return {
    match: /(?:^|[^`])`([^`]+)`$/,
    run: ({ state, blockPath, block, to }, match) => {
      const type = state.schema.marks.code
      if (!type || !block.type.allowsMarkType(type)) return null
      const inner = match[1] as string
      // The caret sits after "`inner"; the typed closing backtick is swallowed.
      const start = to - inner.length - 1
      if (start < 0) return null
      const tr = state.tr
      tr.step(
        new ReplaceInlineStep(
          blockPath,
          start,
          to,
          Fragment.of(state.schema.text(inner, [type.create()])),
        ),
      )
      tr.setSelection(new TextSelection(pos(blockPath, start + inner.length)))
      return tr
    },
  }
}

/** Punctuation that ends a sentence rather than a URL. */
const TRAILING_PUNCTUATION = '.,;:!?\'"`'

/** Drop the punctuation a sentence, not a URL, is likely to have ended with. */
function trimTrailingPunctuation(url: string): string {
  let end = url.length
  while (end > 0) {
    const char = url[end - 1] as string
    if (char === ')') {
      // Keep a closing paren only when the URL opened one.
      const opens = (url.slice(0, end).match(/\(/g) ?? []).length
      const closes = (url.slice(0, end).match(/\)/g) ?? []).length
      if (opens >= closes) break
      end -= 1
      continue
    }
    if (TRAILING_PUNCTUATION.includes(char)) {
      end -= 1
      continue
    }
    break
  }
  return url.slice(0, end)
}
