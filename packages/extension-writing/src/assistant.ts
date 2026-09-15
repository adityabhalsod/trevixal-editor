// The editor-facing assistant: runs the analysis over every textblock, turns
// findings into inline decorations on a private layer, and offers one-click
// fixes. Decorations never touch the document, so nothing leaks into saved
// content; headless editors get the report without the paint.

import {
  type Editor,
  type EditorNode,
  Fragment,
  type InlineDecoration,
  type Path,
  ReplaceInlineStep,
  type TextNode,
  TextSelection,
  inlineSize,
  marksAtInlineOffset,
  nodeAtPath,
  pos,
  textblocks,
} from '@trevixal/core'
import {
  type TextAnalysis,
  analyzeText,
  findLongSentences,
  findPassiveSentences,
  findRepeatedWords,
} from './analysis'
import { checkGrammar } from './grammar'

export type WritingIssueKind = 'passive' | 'repeat' | 'grammar' | 'long'

export interface WritingIssue {
  /**
   * Identifies this issue among the report's, and is written onto the painted
   * span as `data-trevixal-issue` so a hover card or a click menu can find its
   * way from the DOM back here. Derived from the range and the kind rather
   * than counted, so a re-check that finds the same problem in the same place
   * produces the same id and an open popover stays pointed at it.
   */
  readonly id: string
  readonly kind: WritingIssueKind
  /** Path of the textblock holding the range. */
  readonly path: Path
  /** Inline offsets within that block. */
  readonly from: number
  readonly to: number
  readonly message: string
  /** Replacement for the range, when the fix is mechanical. */
  readonly suggestion?: string
  /** The flagged text, so a fix can refuse to apply once the block has changed. */
  readonly text: string
  /** Grammar rule id, for `grammar` issues. */
  readonly rule?: string
}

export interface WritingReport {
  readonly issues: readonly WritingIssue[]
  /** Whole-document analysis (code blocks excluded). */
  readonly analysis: TextAnalysis
}

export interface WritingAssistantOptions {
  /** Flag passive constructions (default true). */
  readonly passive?: boolean
  /** Flag doubled words (default true). */
  readonly repeated?: boolean
  /** Run the grammar rules (default true). */
  readonly grammar?: boolean
  /** Flag sentences over 25 words (default false, it is noisy in long-form prose). */
  readonly longSentences?: boolean
  /** Decoration layer key (default `'writing'`). */
  readonly layer?: string
  /** Delay between the last edit and the re-check; 0 runs synchronously (default 200). */
  readonly debounceMs?: number
  readonly onReport?: (report: WritingReport) => void
}

export interface WritingAssistant {
  /** The latest report; flushes a pending re-check first. */
  report(): WritingReport
  /** Re-run every check now. */
  refresh(): WritingReport
  setEnabled(kind: WritingIssueKind, enabled: boolean): void
  isEnabled(kind: WritingIssueKind): boolean
  /**
   * Replace the issue's range with its suggestion, keeping the marks at the
   * start of the range. False when the issue has no suggestion or the text has
   * moved on since the report.
   */
  applySuggestion(issue: WritingIssue): boolean
  /** Select the issue's range (and focus the view, when there is one). */
  goTo(issue: WritingIssue): void
  /**
   * The issue with this id in the latest report, or null once it is gone,
   * which is the answer a popover opened over a span wants when the text has
   * since been fixed or edited away.
   */
  issue(id: string): WritingIssue | null
  /**
   * Stop flagging this wording: the kind, the rule and the exact text, so
   * "their" accepted in one sentence is accepted in all of them. Dismissing
   * only the one occurrence would put the warning straight back the next time
   * anything before it in the block was edited, because the range has moved.
   */
  ignore(issue: WritingIssue): void
  /** Flag everything again. */
  clearIgnored(): void
  destroy(): void
}

/**
 * Stand-in for an inline atom (hard break, badge, formula) in the block
 * text. LINE SEPARATOR is one UTF-16 unit, so offsets stay aligned with the
 * document's inline offsets, and it is whitespace to `\s`, so it separates
 * words and never masquerades as one.
 */
const ATOM_PLACEHOLDER = ' '

/** A textblock's text with each inline atom as one placeholder character. */
export function blockText(block: EditorNode): string {
  let text = ''
  for (const child of block.content.children) {
    text += child.isText ? (child as TextNode).text : ATOM_PLACEHOLDER.repeat(inlineSize(child))
  }
  return text
}

/** Code and other verbatim blocks are not prose; the checks skip them. */
function isProse(block: EditorNode): boolean {
  const spec = block.type.spec as { preserveWhitespace?: boolean; code?: boolean }
  return spec.preserveWhitespace !== true && spec.code !== true
}

/** Human label per kind, for the hover card's heading. */
export const WRITING_KIND_LABELS: Readonly<Record<WritingIssueKind, string>> = {
  passive: 'Passive voice',
  repeat: 'Repeated word',
  grammar: 'Grammar',
  long: 'Long sentence',
}

/** The attribute each painted span carries, naming the issue underneath it. */
export const WRITING_ISSUE_ATTR = 'data-trevixal-issue'

/** A stable id for one finding: same problem, same place, same id. */
function issueId(kind: WritingIssueKind, path: Path, from: number, to: number): string {
  return `${kind}@${path.join('.')}:${from}-${to}`
}

const CLASS_BY_KIND: Readonly<Record<WritingIssueKind, string>> = {
  passive: 'trevixal-writing trevixal-writing--passive',
  repeat: 'trevixal-writing trevixal-writing--repeat',
  grammar: 'trevixal-writing trevixal-writing--grammar',
  long: 'trevixal-writing trevixal-writing--long',
}

export function createWritingAssistant(
  editor: Editor,
  options: WritingAssistantOptions = {},
): WritingAssistant {
  const layer = options.layer ?? 'writing'
  const debounceMs = options.debounceMs ?? 200
  const enabled: Record<WritingIssueKind, boolean> = {
    passive: options.passive !== false,
    repeat: options.repeated !== false,
    grammar: options.grammar !== false,
    long: options.longSentences === true,
  }

  let destroyed = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let current: WritingReport = { issues: [], analysis: analyzeText('') }
  /** Wordings the reader has waved through, by kind, rule and exact text. */
  const ignored = new Set<string>()
  const ignoreKey = (issue: Omit<WritingIssue, 'id'>): string =>
    `${issue.kind}|${issue.rule ?? ''}|${issue.text}`

  const collect = (): WritingReport => {
    const issues: WritingIssue[] = []
    const decorations = new WeakMap<EditorNode, InlineDecoration[]>()
    const texts: string[] = []
    for (const { path, node } of textblocks(editor.state.doc)) {
      if (!isProse(node)) continue
      const text = blockText(node)
      texts.push(text)
      if (text.trim().length === 0) continue
      // Ids are stamped on once, below, rather than repeated at each of the
      // four places a finding is made.
      const found: Omit<WritingIssue, 'id'>[] = []
      if (enabled.passive) {
        for (const match of findPassiveSentences(text)) {
          found.push({
            kind: 'passive',
            path,
            from: match.index,
            to: match.index + match.length,
            message: `Passive voice: "${match.trigger}"`,
            text: match.trigger,
          })
        }
      }
      if (enabled.repeat) {
        for (const repeat of findRepeatedWords(text)) {
          found.push({
            kind: 'repeat',
            path,
            from: repeat.index,
            to: repeat.index + repeat.length,
            message: `Repeated word "${repeat.word}"`,
            suggestion: repeat.word,
            text: text.slice(repeat.index, repeat.index + repeat.length),
          })
        }
      }
      if (enabled.grammar) {
        for (const issue of checkGrammar(text)) {
          // Doubled words belong to the `repeat` toggle, whatever its state.
          if (issue.rule === 'repeated-word') continue
          found.push({
            kind: 'grammar',
            path,
            from: issue.index,
            to: issue.index + issue.length,
            message: issue.message,
            suggestion: issue.suggestion,
            text: text.slice(issue.index, issue.index + issue.length),
            rule: issue.rule,
          })
        }
      }
      if (enabled.long) {
        for (const sentence of findLongSentences(text)) {
          found.push({
            kind: 'long',
            path,
            from: sentence.index,
            to: sentence.index + sentence.length,
            message: `Long sentence (${sentence.words} words)`,
            text: sentence.sentence,
          })
        }
      }
      if (ignored.size > 0) {
        for (let index = found.length - 1; index >= 0; index--) {
          if (ignored.has(ignoreKey(found[index] as Omit<WritingIssue, 'id'>))) {
            found.splice(index, 1)
          }
        }
      }
      if (found.length === 0) continue
      found.sort((a, b) => a.from - b.from || a.to - b.to)
      const identified: WritingIssue[] = found.map((issue) => ({
        ...issue,
        id: issueId(issue.kind, path, issue.from, issue.to),
      }))
      issues.push(...identified)
      decorations.set(
        node,
        identified
          .filter((issue) => issue.to > issue.from)
          .map((issue) => ({
            from: issue.from,
            to: issue.to,
            className: CLASS_BY_KIND[issue.kind],
            // Named in the DOM, so a pointer over the span can be traced back
            // to the finding that painted it. `title` is deliberately not set:
            // the browser's own tooltip is slow, unstyled, and swallows the
            // message on touch.
            attrs: { [WRITING_ISSUE_ATTR]: issue.id },
          })),
      )
    }
    const view = editor.view
    if (view) {
      view.setDecorationLayer(
        layer,
        issues.length > 0 ? (node) => decorations.get(node) ?? null : null,
      )
    }
    return { issues, analysis: analyzeText(texts.join('\n')) }
  }

  const run = (): WritingReport => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    if (destroyed) return current
    current = collect()
    options.onReport?.(current)
    return current
  }

  const schedule = (): void => {
    if (destroyed) return
    if (debounceMs <= 0) {
      run()
      return
    }
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(run, debounceMs)
  }

  const offTransaction = editor.onTransaction((event) => {
    if (event.transaction.docChanged) schedule()
  })

  run()

  return {
    report() {
      return timer !== null ? run() : current
    },
    refresh: run,
    setEnabled(kind, value) {
      if (enabled[kind] === value) return
      enabled[kind] = value
      run()
    },
    isEnabled(kind) {
      return enabled[kind]
    },
    applySuggestion(issue) {
      if (destroyed || issue.suggestion === undefined) return false
      const block = nodeAtPath(editor.state.doc, issue.path)
      if (!block?.isTextblock) return false
      // The report may predate an edit; never replace text the user has changed.
      if (blockText(block).slice(issue.from, issue.to) !== issue.text) return false
      const insert =
        issue.suggestion.length === 0
          ? Fragment.empty
          : Fragment.of(
              editor.schema.text(
                issue.suggestion,
                marksAtInlineOffset(block.content, Math.min(issue.from + 1, issue.to)),
              ),
            )
      const tr = editor.state.tr
      if (!tr.maybeStep(new ReplaceInlineStep(issue.path, issue.from, issue.to, insert)))
        return false
      const end = pos(issue.path, issue.from + issue.suggestion.length)
      tr.setSelection(new TextSelection(end))
      editor.dispatch(tr)
      return true
    },
    goTo(issue) {
      if (destroyed) return
      const block = nodeAtPath(editor.state.doc, issue.path)
      if (!block?.isTextblock) return
      editor.dispatch(
        editor.state.tr.setSelection(
          new TextSelection(pos(issue.path, issue.from), pos(issue.path, issue.to)),
        ),
      )
      editor.view?.focus()
      editor.view?.scrollSelectionIntoView()
    },
    issue(id) {
      return current.issues.find((entry) => entry.id === id) ?? null
    },
    ignore(issue) {
      ignored.add(ignoreKey(issue))
      run()
    },
    clearIgnored() {
      if (ignored.size === 0) return
      ignored.clear()
      run()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      if (timer !== null) clearTimeout(timer)
      timer = null
      offTransaction()
      editor.view?.setDecorationLayer(layer, null)
    },
  }
}
