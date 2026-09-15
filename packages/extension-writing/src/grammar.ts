// Rule-based grammar hints. Each rule has a stable id so hosts can label,
// filter or silence it; every issue carries a range into the source text and,
// where the fix is mechanical, a case-preserving suggestion.

import { findRepeatedWords, sentenceSpans } from './analysis'

export type GrammarRuleId =
  | 'repeated-word'
  | 'article'
  | 'sentence-case'
  | 'double-space'
  | 'space-before-punctuation'
  | 'missing-space'
  | 'common-error'
  | 'misspelling'

export interface GrammarIssue {
  readonly index: number
  readonly length: number
  readonly message: string
  /** Replacement for the flagged range, when the fix is mechanical. */
  readonly suggestion?: string
  readonly rule: GrammarRuleId
}

/** Rule id → human label, for settings panels and issue lists. */
export const GRAMMAR_RULES: Readonly<Record<GrammarRuleId, string>> = {
  'repeated-word': 'Repeated word',
  article: 'Article (a/an)',
  'sentence-case': 'Capitalise sentence start',
  'double-space': 'Double space',
  'space-before-punctuation': 'Space before punctuation',
  'missing-space': 'Missing space after punctuation',
  'common-error': 'Commonly confused phrase',
  misspelling: 'Common misspelling',
}

// ------------------------------------------------------------------ helpers

/** Copy the casing shape of `original` onto `replacement`: ALL CAPS, Capitalised or as is. */
export function matchCase(original: string, replacement: string): string {
  if (replacement.length === 0) return replacement
  const letters = original.replace(/[^\p{L}]/gu, '')
  if (letters.length > 1 && letters === letters.toUpperCase()) return replacement.toUpperCase()
  const first = original.match(/\p{L}/u)?.[0]
  if (first && first === first.toUpperCase() && first !== first.toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1)
  }
  return replacement
}

/** Ranges of URLs and e-mail addresses, which punctuation rules must leave alone. */
function protectedRanges(text: string): readonly { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = []
  const pattern =
    /(?:https?:\/\/|www\.)\S+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\b\w+(?:\.\w+)+\.(?:com|org|net|io|dev|edu|gov|co|uk|de|fr|js|ts|html|css|json|md|txt|py)\b/giu
  let match = pattern.exec(text)
  while (match !== null) {
    ranges.push({ from: match.index, to: match.index + match[0].length })
    match = pattern.exec(text)
  }
  return ranges
}

function inRanges(index: number, ranges: readonly { from: number; to: number }[]): boolean {
  return ranges.some((range) => index >= range.from && index < range.to)
}

// ------------------------------------------------------------------ articles

/** Words starting with a vowel letter but a consonant sound ("a university", "a European"). */
const CONSONANT_SOUND =
  /^(?:uni(?![nm])|use|usu|usa|usi|ubi|uti|ute|ur[aei]|uk|eu|ewe|one\b|onc|u\b|uvu|ufo\b)/iu
/** Words starting with a silent "h" ("an hour", "an honest"). */
const SILENT_H = /^(?:hour|honest|honor|honour|heir|herb\b|homage)/iu
/** Initialisms whose first letter is pronounced with a vowel sound ("an FBI agent", "an MRI"). */
const VOWEL_LETTER_NAMES = /^[AEFHILMNORSX]/u

/** Whether a word wants "an" rather than "a" in front of it. */
export function wantsAn(word: string): boolean {
  if (word.length === 0) return false
  if (/^\p{N}/u.test(word)) return /^8/u.test(word) || /^1[18](?!\p{N})/u.test(word)
  const isInitialism = /^[A-Z]{2,}(?![a-z])/u.test(word) || /^[A-Z]$/u.test(word)
  if (isInitialism) return VOWEL_LETTER_NAMES.test(word) && !/^U/u.test(word)
  if (SILENT_H.test(word)) return true
  if (CONSONANT_SOUND.test(word)) return false
  return /^[aeiou]/iu.test(word)
}

const ARTICLE = /\b(a|an|A|An|AN)[  ]+([\p{L}\p{N}][\p{L}\p{N}'’-]*)/gu

function checkArticles(text: string, issues: GrammarIssue[]): void {
  ARTICLE.lastIndex = 0
  let match = ARTICLE.exec(text)
  while (match !== null) {
    const article = match[1] as string
    const next = match[2] as string
    // A capital "A" mid-sentence is usually a name or a grade ("vitamin A
    // deficiency"), not the article; only trust it at a sentence start.
    const capital = article[0] === 'A'
    if (!capital || startsSentence(text, match.index)) {
      const shouldBeAn = wantsAn(next)
      const isAn = article.toLowerCase() === 'an'
      if (shouldBeAn !== isAn) {
        const suggestion = matchCase(article, shouldBeAn ? 'an' : 'a')
        issues.push({
          index: match.index,
          length: article.length,
          message: `Use "${suggestion}" before "${next}"`,
          suggestion,
          rule: 'article',
        })
      }
    }
    match = ARTICLE.exec(text)
  }
}

function startsSentence(text: string, index: number): boolean {
  const before = text.slice(0, index)
  return /(?:^|[.!?…\n]["'”’)\]]*)\s*$/u.test(before)
}

// ------------------------------------------------------------- sentence case

const LOWER_START = /^[a-z][a-z'’-]*$/u

function checkSentenceCase(text: string, issues: GrammarIssue[]): void {
  const spans = sentenceSpans(text)
  spans.forEach((span, i) => {
    const first = span.text[0] as string
    if (!/\p{Ll}/u.test(first)) return
    // Dots belong to the leading token ("e.g.", "example.com"); only the
    // sentence's own final period is dropped again.
    const word = (span.text.match(/^[^\s,;:!?]+/u)?.[0] ?? '').replace(/\.$/u, '')
    // iPhone, eBay, URLs, identifiers, e.g./i.e.: not a capitalisation slip.
    if (!LOWER_START.test(word)) return
    // After `"Stop!" she said.` the quote closed a sentence, not the clause.
    const previous = i > 0 ? (spans[i - 1] as { text: string }).text : ''
    if (/[!?]["'”’)\]]+$/u.test(previous)) return
    issues.push({
      index: span.index,
      length: 1,
      message: 'Sentence should start with a capital letter',
      suggestion: first.toUpperCase(),
      rule: 'sentence-case',
    })
  })
}

// ------------------------------------------------------------------- spacing

function checkSpacing(text: string, issues: GrammarIssue[]): void {
  const protectedSpans = protectedRanges(text)

  // Two or more spaces inside a line (leading indentation is intentional).
  const doubles = /(?<=\S) {2,}(?=\S)/gu
  let match = doubles.exec(text)
  while (match !== null) {
    issues.push({
      index: match.index,
      length: match[0].length,
      message: 'Double space',
      suggestion: ' ',
      rule: 'double-space',
    })
    match = doubles.exec(text)
  }

  // "word ." / "word ,", but not " :)" or " ..." style constructs.
  const before = /(?<=\S) +([,.;:!?])(?=\s|$)/gu
  match = before.exec(text)
  while (match !== null) {
    if (!inRanges(match.index, protectedSpans)) {
      issues.push({
        index: match.index,
        length: match[0].length,
        message: `No space before "${match[1]}"`,
        suggestion: match[1] as string,
        rule: 'space-before-punctuation',
      })
    }
    match = before.exec(text)
  }

  // "a,b" / "first;second", letters on both sides, outside URLs and e-mails.
  const missing = /(?<=\p{L})([,;:])(?=\p{L})/gu
  match = missing.exec(text)
  while (match !== null) {
    if (!inRanges(match.index, protectedSpans)) {
      issues.push({
        index: match.index,
        length: 1,
        message: `Missing space after "${match[1]}"`,
        suggestion: `${match[1]} `,
        rule: 'missing-space',
      })
    }
    match = missing.exec(text)
  }

  // "end.Next". A sentence boundary with the space dropped. Only an upper-case
  // letter after the period counts: "example.com" and "e.g." stay quiet.
  const period = /(?<=\p{L})\.(?=\p{Lu})/gu
  match = period.exec(text)
  while (match !== null) {
    const wordBefore = text.slice(0, match.index).match(/\S+$/u)?.[0] ?? ''
    const abbreviation = /^(?:\p{L}|(?:\p{L}\.)+\p{L})$/u.test(wordBefore)
    if (!abbreviation && !inRanges(match.index, protectedSpans)) {
      issues.push({
        index: match.index,
        length: 1,
        message: 'Missing space after "."',
        suggestion: '. ',
        rule: 'missing-space',
      })
    }
    match = period.exec(text)
  }
}

// --------------------------------------------------------- phrases & spelling

interface PhraseRule {
  readonly pattern: RegExp
  /** Replacement template; `$1` refers to the pattern's first group. */
  readonly replacement: string
  readonly message: string
}

const COMMON_ERRORS: readonly PhraseRule[] = [
  {
    pattern: /\b(could|should|would|must|might) of\b/giu,
    replacement: '$1 have',
    message: 'Did you mean "$1 have"?',
  },
  { pattern: /\balot\b/giu, replacement: 'a lot', message: '"alot" is two words: "a lot"' },
  {
    pattern: /\birregardless\b/giu,
    replacement: 'regardless',
    message: '"irregardless" is not standard; use "regardless"',
  },
  {
    pattern: /\bvery unique\b/giu,
    replacement: 'unique',
    message: '"unique" is absolute; drop "very"',
  },
  {
    pattern: /\bfor all intensive purposes\b/giu,
    replacement: 'for all intents and purposes',
    message: 'The phrase is "for all intents and purposes"',
  },
  {
    pattern: /\b(more|less|rather|other) then\b/giu,
    replacement: '$1 than',
    message: 'Comparison: "$1 than"',
  },
  {
    pattern: /\byour welcome\b/giu,
    replacement: "you're welcome",
    message: 'Did you mean "you\'re welcome"?',
  },
  { pattern: /\bits a\b/giu, replacement: "it's a", message: 'Did you mean "it\'s a"?' },
]

const MISSPELLINGS: Readonly<Record<string, string>> = {
  recieve: 'receive',
  seperate: 'separate',
  definately: 'definitely',
  occured: 'occurred',
  untill: 'until',
  wich: 'which',
  teh: 'the',
  accomodate: 'accommodate',
  occassion: 'occasion',
  neccessary: 'necessary',
  goverment: 'government',
  enviroment: 'environment',
  arguement: 'argument',
  begining: 'beginning',
  beleive: 'believe',
  calender: 'calendar',
  existance: 'existence',
  foriegn: 'foreign',
  grammer: 'grammar',
  independant: 'independent',
  knowlege: 'knowledge',
  liason: 'liaison',
  millenium: 'millennium',
  noticable: 'noticeable',
  occurence: 'occurrence',
  persistant: 'persistent',
  publically: 'publicly',
  realy: 'really',
  succesful: 'successful',
  tommorow: 'tomorrow',
  truely: 'truly',
  wierd: 'weird',
}

const MISSPELLING = new RegExp(`\\b(${Object.keys(MISSPELLINGS).join('|')})\\b`, 'giu')

function checkPhrases(text: string, issues: GrammarIssue[]): void {
  for (const rule of COMMON_ERRORS) {
    rule.pattern.lastIndex = 0
    let match = rule.pattern.exec(text)
    while (match !== null) {
      const group = match[1] ?? ''
      issues.push({
        index: match.index,
        length: match[0].length,
        message: rule.message.replace(/\$1/gu, group),
        suggestion: matchCase(match[0], rule.replacement.replace(/\$1/gu, group.toLowerCase())),
        rule: 'common-error',
      })
      match = rule.pattern.exec(text)
    }
  }
  MISSPELLING.lastIndex = 0
  let match = MISSPELLING.exec(text)
  while (match !== null) {
    const correct = MISSPELLINGS[match[0].toLowerCase()] as string
    const suggestion = matchCase(match[0], correct)
    issues.push({
      index: match.index,
      length: match[0].length,
      message: `Possible misspelling: "${suggestion}"`,
      suggestion,
      rule: 'misspelling',
    })
    match = MISSPELLING.exec(text)
  }
}

// ---------------------------------------------------------------------- main

/** Run every rule over `text`; issues come back sorted by position. */
export function checkGrammar(text: string): readonly GrammarIssue[] {
  const issues: GrammarIssue[] = []
  for (const repeat of findRepeatedWords(text)) {
    issues.push({
      index: repeat.index,
      length: repeat.length,
      message: `Repeated word "${repeat.word}"`,
      suggestion: repeat.word,
      rule: 'repeated-word',
    })
  }
  checkArticles(text, issues)
  checkSentenceCase(text, issues)
  checkSpacing(text, issues)
  checkPhrases(text, issues)
  return issues.sort((a, b) => a.index - b.index || a.length - b.length)
}
