/** One highlighted span inside a code block, as inline offsets. */
export interface HighlightToken {
  readonly from: number
  readonly to: number
  readonly className: string
}

/**
 * The injectable highlighter contract. Wrap any engine that can emit
 * offset-based tokens synchronously, e.g. Shiki after `createHighlighter`
 * resolved, or a hand-rolled tokenizer. The editor core never depends on a
 * highlighting library.
 */
export interface Highlighter {
  highlight(code: string, language: string | null): readonly HighlightToken[]
}
