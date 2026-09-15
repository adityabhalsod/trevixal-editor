import { detectLanguage } from './detect'
import { type LanguageDefinition, findLanguage } from './languages'
import type { HighlightToken, Highlighter } from './types'

export interface CreateHighlighterOptions {
  /** Extra or overriding definitions, matched before the bundled ones. */
  readonly languages?: readonly LanguageDefinition[]
  /** Used when a code block names no language. */
  readonly fallback?: string
  /**
   * Guess the language of a block that names none, from its content. Off by
   * default: guessing changes what the reader sees without being asked, and
   * a wrong guess paints the block with the wrong grammar.
   *
   * `fallback` still wins. An explicit default is a decision, detection is
   * an inference.
   */
  readonly autoDetect?: boolean
}

/**
 * A rule-based highlighter for the bundled languages. It emits offset tokens
 * and nothing else, so it satisfies {@link Highlighter} exactly like a
 * wrapper around Shiki or Prism would, swap it out whenever you want a real
 * grammar, without touching the editor.
 *
 * Unknown languages produce no tokens, which renders as plain text.
 */
export function createHighlighter(options: CreateHighlighterOptions = {}): Highlighter {
  const extra = new Map<string, LanguageDefinition>()
  for (const language of options.languages ?? []) {
    extra.set(language.name.toLowerCase(), language)
    for (const alias of language.aliases ?? []) extra.set(alias.toLowerCase(), language)
  }

  const resolve = (name: string | null): LanguageDefinition | null => {
    const wanted = name ?? options.fallback ?? null
    if (!wanted) return null
    return extra.get(wanted.trim().toLowerCase()) ?? findLanguage(wanted)
  }

  return {
    highlight(code, language) {
      const definition =
        resolve(language) ??
        // Only when the block names nothing and no fallback covers it.
        (options.autoDetect && !language && !options.fallback
          ? (detectLanguage(code)?.language ?? null)
          : null)
      return definition ? tokenize(code, definition) : []
    },
  }
}

/**
 * Sticky equivalents of `followedBy` patterns that arrived without the flag.
 * Keyed by the original so a host-supplied rule is compiled once, not once
 * per position.
 */
const STICKY_EQUIVALENT = new WeakMap<RegExp, RegExp>()

/** The same pattern, guaranteed to be anchored at `lastIndex`. */
function asSticky(pattern: RegExp): RegExp {
  if (pattern.sticky) return pattern
  const cached = STICKY_EQUIVALENT.get(pattern)
  if (cached) return cached
  const sticky = new RegExp(pattern.source, `${pattern.flags}y`)
  STICKY_EQUIVALENT.set(pattern, sticky)
  return sticky
}

/**
 * Does `pattern` match starting exactly at `at`?
 *
 * `LanguageRule` documents `followedBy` as sticky, but the type is public and
 * nothing enforces it. `.test` on a non-sticky pattern ignores `lastIndex`
 * and searches the whole document instead, which both colours the wrong token
 * and makes every position a full scan, so anchor a clone rather than trust
 * the flag.
 */
function matchesAt(pattern: RegExp, code: string, at: number): boolean {
  const sticky = asSticky(pattern)
  sticky.lastIndex = at
  return sticky.test(code)
}

/**
 * Scan left to right, trying each rule at the current position and taking
 * the first that claims it. Nothing overlaps, and every position advances, so
 * the result is always a valid non-overlapping token list.
 *
 * When no rule claims the position, the scanner still skips the longest
 * *lexeme* any rule recognised there. An identifier that turned out not to
 * be a keyword, a word that is not a property name. Advancing a single
 * character instead would re-run every rule against the same lexeme at every
 * offset inside it, which is quadratic: a 20k-character identifier pasted
 * into a code block would freeze the editor. Skipping the whole lexeme is
 * also the more correct reading, `constant` is one word, and `const` inside
 * it was never a keyword.
 *
 * Which span counts as the lexeme matters. A `keywords` rule is matched
 * against a word set, so its span is exactly one word. A `followedBy` rule's
 * span may reach past the word into punctuation that is a token in its own
 * right, Rust's macro rule recognises `x!` in `x!=y`, and skipping that far
 * swallows the `!` the operator rule was about to claim. So a word-set rule's
 * span wins whenever one is available, and a conditional rule's span is used
 * only when no rule recognised a bare word here at all (HTML and CSS have no
 * word-set rule, and their attribute rules are what keeps a long word linear
 * there).
 */
export function tokenize(code: string, language: LanguageDefinition): HighlightToken[] {
  const tokens: HighlightToken[] = []
  const length = code.length
  let index = 0

  while (index < length) {
    let claimed: string | null = null
    let claimedLength = 0
    // Longest *word* a word-set rule recognised here, whether or not it
    // coloured it. Safe to skip: a word set is compared against a whole word.
    let wordLexeme = 0
    // Longest span a conditional rule recognised. May include trailing
    // punctuation, so it is only trusted when no word-set rule spoke.
    let conditionalLexeme = 0

    for (const rule of language.rules) {
      rule.pattern.lastIndex = index
      const match = rule.pattern.exec(code)
      if (!match || match.index !== index || match[0].length === 0) continue

      const text = match[0]

      let className: string | null = rule.className

      if (rule.keywords) {
        if (text.length > wordLexeme) wordLexeme = text.length
        // A keyword rule claims the span only for words in its set; anything
        // else falls through so a later rule (or none) can handle it.
        if (!rule.keywords.has(text) && !rule.keywords.has(text.toLowerCase())) {
          className = rule.otherwise ?? null
        }
      }

      // The same fall-through for a rule whose colour depends on what comes
      // next: the lexeme is still a lexeme when the condition does not hold.
      if (rule.followedBy) {
        if (text.length > conditionalLexeme) conditionalLexeme = text.length
        if (className !== null && !matchesAt(rule.followedBy, code, index + text.length)) {
          className = null
        }
      }

      if (className === null) continue

      claimed = className
      claimedLength = text.length
      break
    }

    if (claimed !== null) {
      tokens.push({ from: index, to: index + claimedLength, className: claimed })
      index += claimedLength
      continue
    }

    // Nothing coloured this position: step over the whole lexeme if a rule
    // recognised one, otherwise over the single character.
    const lexeme = wordLexeme > 0 ? wordLexeme : conditionalLexeme
    index += lexeme > 0 ? lexeme : 1
  }

  return tokens
}
