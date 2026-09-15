import { describe, expect, it } from 'vitest'
import { BUNDLED_LANGUAGES, createHighlighter, detectLanguage } from '../src'

const highlighter = createHighlighter()

/** Milliseconds one call took. */
function elapsed(run: () => void): number {
  const start = performance.now()
  run()
  return performance.now() - start
}

/**
 * Pathological inputs a user can produce by accident: an unterminated string,
 * a pasted minified bundle, a base64 blob, a run of punctuation. None of them
 * may cost more than linear time. A super-linear grammar freezes the editor
 * on every keystroke, because the block is re-tokenized as it is typed.
 */
const HOSTILE: readonly (readonly [string, string])[] = [
  ['long identifier', 'a'.repeat(20000)],
  ['long identifier after a quote', `"${'a'.repeat(19998)}\\`],
  ['unterminated quotes', '"'.repeat(20000)],
  ['unterminated backticks', '`'.repeat(20000)],
  ['unterminated interpolations', '${'.repeat(10000)],
  ['unterminated block comments', '/*'.repeat(10000)],
  ['blank lines', '\n'.repeat(20000)],
  ['indented blank lines', ' \n'.repeat(10000)],
  ['dashes', '-'.repeat(20000)],
  ['colons', ':'.repeat(20000)],
  ['dots', '.'.repeat(20000)],
  ['brackets', '['.repeat(20000)],
  ['attribute brackets', '#['.repeat(10000)],
  ['digits', '1'.repeat(20000)],
  ['angle brackets', '<'.repeat(20000)],
  ['stars', '*'.repeat(20000)],
]

/** One call may not take longer than this; the fixed code takes ~1ms. */
const BUDGET_MS = 250

describe('tokenizer is linear on hostile input', () => {
  for (const language of BUNDLED_LANGUAGES) {
    it(`${language.name} tokenizes 20k characters of anything quickly`, () => {
      for (const [label, code] of HOSTILE) {
        const took = elapsed(() => highlighter.highlight(code, language.name))
        expect(took, `${language.name} / ${label} took ${took.toFixed(0)}ms`).toBeLessThan(
          BUDGET_MS,
        )
      }
    })
  }
})

describe('detectLanguage is linear on hostile input', () => {
  it('does not backtrack catastrophically on brace-and-colon soup', () => {
    // `[^}]*:[^}]*;` is two unbounded scans separated by a colon: on input
    // full of colons and open braces but no `;`, the pair backtracks
    // cubically. 3000 characters used to take a full second.
    const took = elapsed(() => detectLanguage('a{:'.repeat(1000)))
    expect(took, `took ${took.toFixed(0)}ms`).toBeLessThan(BUDGET_MS)
  })

  it('stays fast on 20k characters of every hostile shape', () => {
    for (const [label, code] of HOSTILE) {
      const took = elapsed(() => detectLanguage(code))
      expect(took, `${label} took ${took.toFixed(0)}ms`).toBeLessThan(BUDGET_MS)
    }
  })

  it('stays fast on a document that is mostly blank lines', () => {
    // The `blank lines` shape above never reaches a pattern at all: detection
    // trims the sample first, and a document of nothing but newlines trims to
    // empty. One character at each end makes it a real document again, and a
    // line-anchored `^\s*` then runs from every line start to the bottom of
    // the blank run below it, which is quadratic on an ordinary long file.
    const document = `x${'\n'.repeat(20000)}x`
    const took = elapsed(() => detectLanguage(document))
    expect(took, `took ${took.toFixed(0)}ms`).toBeLessThan(BUDGET_MS)
  })

  it('does not backtrack on braces that never close a declaration', () => {
    // `{` opens a rule set, so neither half of the CSS declaration probe may
    // scan past one. On a run of `a{`, or of `a{:` with no `;` anywhere, a
    // half that is allowed to cross `{` hunts the missing delimiter to end of
    // input from every brace before it. 20k characters, like the shapes above.
    for (const [label, code] of [
      ['braces', 'a{'.repeat(10000)],
      ['braces and colons', 'a{:'.repeat(6667)],
    ] as const) {
      const took = elapsed(() => detectLanguage(code))
      expect(took, `${label} took ${took.toFixed(0)}ms`).toBeLessThan(BUDGET_MS)
    }
  })
})

/**
 * Added by review. Both of these are the same defect class the rest of this
 * file covers, an unbounded scan restarted at every character of a long run,
 * and both are still present.
 */
describe('review: catastrophic backtracking that survived the fix', () => {
  it('tokenizes an unterminated JSON string full of escapes in linear time', () => {
    // `"(?:\\[\s\S]|[^\\"])*"` has no end-of-input fallback, unlike the shared
    // STRING() builder, so on a string that never closes it scans to the end
    // and backtracks, twice, once for the key rule and once for the value
    // rule, from every `"` in the input. `\"` makes every other character a
    // fresh start position. 20k characters, exactly like HOSTILE above.
    const code = '\\"'.repeat(10000)
    const took = elapsed(() => highlighter.highlight(code, 'json'))
    expect(took, `json / escaped quotes took ${took.toFixed(0)}ms`).toBeLessThan(BUDGET_MS)
  })

  it('detects a document of unclosed tags in linear time', () => {
    // `<(?:html|…|p|a|…)\b[^>]*>` runs an unbounded `[^>]*` from every `<p`,
    // and `.test` only stops early when a `>` exists. A document with no `>`
    // at all makes every one of them scan to the end.
    for (const [label, code] of [
      ['unclosed tags', '<p'.repeat(20000)],
      ['SELECT without FROM', 'SELECT '.repeat(5714)],
      ['fn with an unclosed generic', 'fn a<'.repeat(8000)],
    ] as const) {
      const took = elapsed(() => detectLanguage(code))
      expect(took, `${label} took ${took.toFixed(0)}ms`).toBeLessThan(BUDGET_MS)
    }
  })
})

/**
 * The behaviour the linearity work changed or restored. The timing tests above
 * lock the cost in; these lock the output in, so a future "optimisation" that
 * loses a token fails here rather than silently shipping.
 */
describe('what the linear scanner is allowed to change', () => {
  /** The text of each token, with its class shortened for readability. */
  function classify(code: string, language: string): [string, string][] {
    return highlighter
      .highlight(code, language)
      .map((token) => [code.slice(token.from, token.to), token.className.replace('tvx-tok-', '')])
  }

  it('no longer colours a keyword buried inside a longer word', () => {
    // Skipping the whole lexeme rather than one character is what makes a long
    // identifier linear; `const` inside `constant` was never a keyword anyway.
    // The prefix case is covered in languages.test.ts, these are the interior
    // and suffix cases, which is where the scanner actually changed.
    expect(classify('offset', 'javascript')).toEqual([])
    expect(classify('xconsole', 'javascript')).toEqual([])
    expect(classify('JSONContent', 'javascript')).toEqual([])
    // The bare words themselves still colour.
    expect(classify('const', 'javascript')).toEqual([['const', 'keyword']])
  })

  it('does not let a rejected macro swallow the operator after it', () => {
    // Rust's macro rule recognises `x!` in `x!=y`, but its `followedBy` rejects
    // it. Skipping that whole span would eat the `!` the operator rule owns,
    // leaving `=` where `!=` belongs, so a conditional rule's span may only
    // be skipped when no word-set rule recognised a word here.
    expect(classify('x!=y', 'rust')).toContainEqual(['!=', 'operator'])
    // The macro still colours where it really is one.
    expect(classify('println!("hi")', 'rust')).toContainEqual(['println!', 'function'])
  })

  it('keeps a markdown link whose url contains a parenthesised suffix', () => {
    const link = '[the article](https://en.wikipedia.org/wiki/Foo_(bar))'
    expect(classify(link, 'markdown')).toEqual([[link, 'function']])
    expect(detectLanguage(`See ${link} for more.`)?.language.name).toBe('markdown')
  })

  it('tokenizes an unterminated JSON string to end of input', () => {
    // The end-of-input fallback is what makes the unterminated case linear, so
    // it has to actually emit the token rather than give up on it.
    expect(classify('{"a": "unterminated', 'json')).toEqual([
      ['"a"', 'attribute'],
      ['"unterminated', 'string'],
    ])
  })
})
