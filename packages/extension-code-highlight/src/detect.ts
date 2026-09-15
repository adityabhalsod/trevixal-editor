import { BUNDLED_LANGUAGES, type LanguageDefinition, findLanguage } from './languages'

/**
 * A signal that a snippet is written in one particular language, and how much
 * it is worth. Weights are relative to each other only.
 */
interface Signal {
  readonly pattern: RegExp
  readonly score: number
}

/**
 * Per-language evidence. These are deliberately *discriminating* patterns,
 * things that are rare or impossible in the other bundled languages, rather
 * than merely common ones. `function` appears in half these languages and so
 * says almost nothing; `def foo(self)` says Python and nothing else.
 *
 * Every pattern is anchored to a line start, a word boundary or punctuation,
 * so a keyword inside a string or an identifier does not vote.
 *
 * They also run against text nobody wrote by hand, a pasted minified bundle,
 * a base64 blob, a wall of punctuation, so none of them may contain two
 * unbounded scans that can split the same span between them, and none may let
 * an unbounded scan start at every character of a long run. Both are
 * super-linear, and detection runs on every unlabelled block.
 *
 * For the same reason a line-anchored pattern spells its indentation `[ \t]*`
 * and never `\s*`: `\s` matches a newline, so under `/m` the scan runs from
 * every line start down through the whole blank run below it and then
 * backtracks a character at a time looking for the keyword, quadratic on a
 * document with many blank lines, which is an ordinary document. Indentation
 * is horizontal, so the narrower class is also the correct reading.
 */
const SIGNALS: Readonly<Record<string, readonly Signal[]>> = {
  typescript: [
    { pattern: /\binterface\s+[A-Z]\w*\s*\{/, score: 5 },
    { pattern: /\btype\s+[A-Z]\w*\s*=/, score: 5 },
    { pattern: /:\s*(?:string|number|boolean|void|unknown|never)\b/, score: 4 },
    { pattern: /\b(?:readonly|implements|enum|namespace)\b/, score: 3 },
    { pattern: /\bas\s+(?:const|[A-Z]\w*)/, score: 3 },
    { pattern: /\bimport\s+type\b/, score: 5 },
    { pattern: /<[A-Z]\w*(?:,\s*[A-Z]\w*)*>\s*[({]/, score: 2 },
  ],
  javascript: [
    { pattern: /\b(?:const|let)\s+\w+\s*=/, score: 2 },
    { pattern: /=>\s*[{(]/, score: 2 },
    { pattern: /\bfunction\s*\*?\s*\w*\s*\(/, score: 2 },
    { pattern: /\b(?:require|module\.exports)\b/, score: 4 },
    { pattern: /\bconsole\.(?:log|error|warn)\(/, score: 3 },
    { pattern: /\bdocument\.(?:querySelector|getElementById)\b/, score: 3 },
    { pattern: /\bexport\s+(?:default|const|function)\b/, score: 2 },
  ],
  python: [
    { pattern: /^[ \t]*def\s+\w+\s*\(/m, score: 5 },
    { pattern: /^[ \t]*from\s+[\w.]+\s+import\b/m, score: 5 },
    { pattern: /^[ \t]*import\s+\w+$/m, score: 3 },
    { pattern: /\bself\b/, score: 4 },
    { pattern: /^[ \t]*class\s+\w+(?:\(\w*\))?\s*:/m, score: 4 },
    { pattern: /\b(?:elif|None|True|False)\b/, score: 4 },
    { pattern: /^[ \t]*@\w+$/m, score: 2 },
    { pattern: /:\s*$/m, score: 1 },
  ],
  html: [
    { pattern: /<!DOCTYPE\s+html>/i, score: 6 },
    // `[^<>]*`, not `[^>]*`: the attribute region of an open tag cannot reach
    // into the next tag, and stopping at `<` is what keeps this linear. With
    // `[^>]*` a document of unclosed tags makes every `<p` scan to end of
    // input hunting a `>` that is not there.
    { pattern: /<(?:html|head|body|div|span|p|a|ul|li|table)\b[^<>]*>/i, score: 4 },
    { pattern: /<\/(?:html|head|body|div|span|p|a|ul|li|table)>/i, score: 4 },
    { pattern: /\b(?:class|id|href|src)\s*=\s*["']/, score: 2 },
  ],
  css: [
    // One `[\w-]` is enough: if `[.#]?[\w-]+\s*\{` occurs anywhere then so
    // does its last character, and `.test` only asks whether it occurs.
    // Both halves exclude `{` as well as the delimiter the other looks for,
    // so neither can run past the rule set it started in: a value scan that
    // may cross `{` hunts the next `;` all the way to end of input from every
    // `{` before it, which is quadratic on a run of them.
    { pattern: /[\w-]\s*\{[^{};:]*:[^{};]*;/, score: 4 },
    { pattern: /\b(?:color|background|margin|padding|display|font-size)\s*:/, score: 3 },
    { pattern: /@(?:media|import|keyframes|supports)\b/, score: 5 },
    { pattern: /:\s*(?:\d+(?:px|rem|em|%|vh|vw)|#[0-9a-f]{3,8})\s*;/i, score: 3 },
    { pattern: /(?<![\w-])--[\w-]+\s*:/, score: 3 },
  ],
  json: [
    // A whole document that is one object or array, with quoted keys.
    { pattern: /^\s*[[{][\s\S]*[\]}]\s*$/, score: 3 },
    { pattern: /"[\w-]+"\s*:\s*(?:"[^"]*"|\d|true|false|null|[[{])/, score: 4 },
  ],
  sql: [
    // The gap may not contain another `SELECT`, so each `SELECT` scans only as
    // far as the next one rather than to end of input. Nested queries still
    // vote: the inner `SELECT` reaches its own `FROM`. A plain `[\s\S]*` here
    // re-scanned the whole document from every `SELECT` in it.
    { pattern: /\bSELECT\b(?:(?!\bSELECT\b)[\s\S])*?\bFROM\b/i, score: 6 },
    {
      pattern: /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE)\b/i,
      score: 6,
    },
    { pattern: /\b(?:INNER|LEFT|RIGHT|FULL)\s+JOIN\b/i, score: 4 },
    { pattern: /\b(?:GROUP\s+BY|ORDER\s+BY|HAVING)\b/i, score: 4 },
  ],
  shell: [
    { pattern: /^#!.*\b(?:ba|z|k)?sh\b/m, score: 6 },
    { pattern: /^[ \t]*(?:echo|cd|ls|mkdir|rm|cp|mv|grep|sed|awk|curl|chmod)\b/m, score: 3 },
    { pattern: /\$\{?\w+\}?/, score: 1 },
    { pattern: /\|\s*(?:grep|awk|sed|head|tail|sort|wc)\b/, score: 4 },
    { pattern: /^[ \t]*(?:if|for|while)\b.*;\s*(?:then|do)\b/m, score: 4 },
  ],
  go: [
    { pattern: /^[ \t]*package\s+\w+$/m, score: 6 },
    { pattern: /\bfunc\s+(?:\(\w+\s+\*?\w+\)\s*)?\w+\s*\(/, score: 5 },
    { pattern: /:=/, score: 3 },
    { pattern: /\bimport\s+\(/, score: 3 },
    { pattern: /\b(?:defer|go|chan|nil)\b/, score: 3 },
    { pattern: /\berr\s*!=\s*nil\b/, score: 5 },
  ],
  rust: [
    // `[^<>]*`: a generic parameter list cannot contain a bare `<`, and
    // stopping there bounds the scan. `[^>]*` ran to end of input from every
    // `fn a<` in a document with no `>`.
    { pattern: /\bfn\s+\w+\s*(?:<[^<>]*>)?\s*\(/, score: 5 },
    { pattern: /\blet\s+mut\b/, score: 5 },
    { pattern: /\b(?:impl|trait|pub\s+fn|use\s+std::)\b/, score: 5 },
    { pattern: /->\s*(?:Result|Option|Vec|String|&str)\b/, score: 4 },
    { pattern: /\b\w+!\s*\(/, score: 2 },
    { pattern: /&(?:mut\s+)?self\b/, score: 4 },
  ],
  java: [
    {
      pattern: /\b(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?[\w<>[\]]+\s+\w+\s*\(/,
      score: 5,
    },
    { pattern: /\bpublic\s+class\s+\w+/, score: 6 },
    { pattern: /\bSystem\.out\.print/, score: 5 },
    { pattern: /^[ \t]*import\s+java\./m, score: 6 },
    { pattern: /\b(?:extends|implements)\s+\w+/, score: 2 },
  ],
  markdown: [
    { pattern: /^#{1,6}\s+\S/m, score: 4 },
    { pattern: /^[ \t]*[-*+]\s+\S/m, score: 2 },
    // One nested pair is allowed on purpose: a Wikipedia-style URL such as
    // `/wiki/Foo_(bar)` is ordinary Markdown and a flat `[^()\n]+` drops it.
    // Still linear: `[^()\n]*` cannot match `(`, so nothing is ambiguous.
    { pattern: /\[[^[\]\n]+\]\([^()\n]*(?:\([^()\n]*\)[^()\n]*)*\)/, score: 4 },
    { pattern: /^```/m, score: 4 },
    { pattern: /\*\*[^*]+\*\*/, score: 3 },
    { pattern: /^[ \t]*>\s+\S/m, score: 2 },
  ],
}

/** One language's score, and how far ahead of the runner-up it was. */
export interface LanguageGuess {
  readonly language: LanguageDefinition
  readonly score: number
  /** How much this beat the next-best by. A small margin means a close call. */
  readonly margin: number
}

export interface DetectLanguageOptions {
  /**
   * Minimum score to report a guess at all. Below this the sample is treated
   * as prose or as too short to call. Defaults to 4.
   */
  readonly minimumScore?: number
  /**
   * How far ahead of the runner-up the winner must be. Two languages within
   * this margin means an ambiguous sample, and nothing is returned.
   * Defaults to 2.
   */
  readonly minimumMargin?: number
  /** Restrict detection to these language ids. */
  readonly languages?: readonly string[]
}

/**
 * Guess which bundled language a snippet is written in, or return null when
 * the evidence is weak or split.
 *
 * Returning null matters more than being clever: mislabelling a block paints
 * it with the wrong grammar, which looks worse than leaving it plain. So a
 * guess needs both an absolute score and a clear margin over the runner-up.
 */
export function detectLanguage(
  code: string,
  options: DetectLanguageOptions = {},
): LanguageGuess | null {
  const minimumScore = options.minimumScore ?? 4
  const minimumMargin = options.minimumMargin ?? 2

  // Very short samples cannot carry enough evidence; `{}` is valid JSON, valid
  // JavaScript and valid CSS-ish, and guessing from it is noise.
  const sample = code.trim()
  if (sample.length < 12) return null

  const allowed = options.languages
    ? new Set(options.languages.map((name) => name.toLowerCase()))
    : null

  const scores: { name: string; score: number }[] = []
  for (const [name, signals] of Object.entries(SIGNALS)) {
    if (allowed && !allowed.has(name)) continue
    let score = 0
    for (const signal of signals) {
      if (signal.pattern.test(sample)) score += signal.score
    }
    if (score > 0) scores.push({ name, score })
  }

  if (scores.length === 0) return null
  scores.sort((a, b) => b.score - a.score)

  const best = scores[0]
  if (!best || best.score < minimumScore) return null
  const margin = best.score - (scores[1]?.score ?? 0)
  if (margin < minimumMargin) return null

  const language = findLanguage(best.name)
  return language ? { language, score: best.score, margin } : null
}

/** Every language id detection can return, for building a picker. */
export function detectableLanguages(): readonly string[] {
  return BUNDLED_LANGUAGES.filter((language) => language.name in SIGNALS).map(
    (language) => language.name,
  )
}
