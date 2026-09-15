// Pure text analysis: sentence and word splitting, syllable counting,
// readability scores, time estimates, keyword density, passive voice and
// repeated words. Nothing here knows about the editor; the assistant feeds it
// block text and maps the offsets back onto the document.

/** A sentence with its position in the source text. */
export interface SentenceSpan {
  readonly text: string
  readonly index: number
  readonly length: number
}

/** A word with its position in the source text. */
export interface WordSpan {
  readonly text: string
  readonly index: number
  readonly length: number
}

export interface TimeEstimate {
  readonly minutes: number
  readonly seconds: number
  /** `"3 min read"`, `"< 1 min read"`, … */
  readonly label: string
}

export interface KeywordEntry {
  readonly word: string
  readonly count: number
  /** Share of all words in the text (0-1). */
  readonly density: number
}

export interface KeywordDensityOptions {
  /** How many keywords to return (default 10). */
  readonly limit?: number
  /** Words shorter than this are ignored (default 3). */
  readonly minLength?: number
  /** Words never reported. Defaults to {@link ENGLISH_STOPWORDS}. */
  readonly stopwords?: ReadonlySet<string> | readonly string[]
}

export interface PassiveMatch {
  /** The sentence the construction was found in. */
  readonly sentence: string
  /** Offset of the verb phrase (`was written by`) in the source text. */
  readonly index: number
  readonly length: number
  /** The matched verb phrase. */
  readonly trigger: string
  /** True when the phrase names its agent with `by`. */
  readonly byAgent: boolean
}

export interface RepeatedWord {
  /** The word as written the first time. */
  readonly word: string
  /** Offset of the first occurrence; `length` spans both (`the the`). */
  readonly index: number
  readonly length: number
}

export interface LongSentence {
  readonly sentence: string
  readonly index: number
  readonly length: number
  readonly words: number
}

export interface TextAnalysisOptions {
  readonly keywords?: KeywordDensityOptions
  /** Sentences with more words than this are reported (default 25). */
  readonly longSentenceWords?: number
}

export interface TextAnalysis {
  readonly characters: number
  readonly charactersNoSpaces: number
  readonly words: number
  readonly sentences: number
  readonly paragraphs: number
  readonly syllables: number
  readonly averageWordsPerSentence: number
  readonly fleschReadingEase: number
  readonly fleschKincaidGrade: number
  readonly readabilityLabel: string
  readonly readingTime: TimeEstimate
  readonly speakingTime: TimeEstimate
  readonly passive: readonly PassiveMatch[]
  readonly repeated: readonly RepeatedWord[]
  readonly keywords: readonly KeywordEntry[]
  readonly longSentences: readonly LongSentence[]
}

// ----------------------------------------------------------------- sentences

/**
 * Abbreviations whose trailing period does not end a sentence. Compared
 * lowercased and without the final period.
 */
const ABBREVIATIONS = new Set([
  'e.g',
  'i.e',
  'etc',
  'vs',
  'cf',
  'viz',
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'sr',
  'jr',
  'st',
  'mt',
  'no',
  'inc',
  'ltd',
  'co',
  'corp',
  'fig',
  'figs',
  'approx',
  'dept',
  'est',
  'ca',
  'al',
  'a.m',
  'p.m',
  'u.s',
  'u.k',
  'u.n',
  'ph.d',
  'jan',
  'feb',
  'mar',
  'apr',
  'jun',
  'jul',
  'aug',
  'sep',
  'sept',
  'oct',
  'nov',
  'dec',
])

/** A run of sentence terminators, optionally closed by quotes/brackets, before whitespace or the end. */
const TERMINATOR = /[.!?…]+["'”’)\]]*(?=\s|$)/gu

/**
 * Sentences with their offsets. Splits on `.`, `!`, `?` and `…` followed by
 * whitespace, except after known abbreviations (`e.g.`, `Dr.`) and initials
 * (`J. K. Rowling`). Decimals (`3.14`) never split because nothing follows the
 * period but a digit.
 */
export function sentenceSpans(text: string): readonly SentenceSpan[] {
  const spans: SentenceSpan[] = []
  let start = 0
  const push = (end: number): void => {
    let from = start
    while (from < end && /\s/u.test(text[from] as string)) from++
    let to = end
    while (to > from && /\s/u.test(text[to - 1] as string)) to--
    if (to > from) spans.push({ text: text.slice(from, to), index: from, length: to - from })
    start = end
  }
  TERMINATOR.lastIndex = 0
  let match = TERMINATOR.exec(text)
  while (match !== null) {
    const end = match.index + match[0].length
    if (!isAbbreviation(text, match.index, match[0])) push(end)
    match = TERMINATOR.exec(text)
  }
  push(text.length)
  return spans
}

/** Sentences as plain strings; see {@link sentenceSpans} for offsets. */
export function splitSentences(text: string): readonly string[] {
  return sentenceSpans(text).map((span) => span.text)
}

function isAbbreviation(text: string, index: number, terminator: string): boolean {
  if (!terminator.startsWith('.') || /[!?…]/u.test(terminator)) return false
  // The token before the period: everything back to the previous whitespace.
  let from = index
  while (from > 0 && !/\s/u.test(text[from - 1] as string)) from--
  const token = text
    .slice(from, index)
    .replace(/^["'“‘(\[]+/u, '')
    .toLowerCase()
  if (token.length === 0) return false
  if (ABBREVIATIONS.has(token)) return true
  // A single letter: an initial ("J. K. Rowling") or a list marker ("a.").
  if (/^\p{L}$/u.test(token)) return true
  // Dotted acronyms not in the list ("d.c.", "n.b.").
  return /^(?:\p{L}\.)+\p{L}$/u.test(token)
}

// --------------------------------------------------------------------- words

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu

/** Words with their offsets: Unicode letters and digits, apostrophes inside a word allowed. */
export function wordSpans(text: string): readonly WordSpan[] {
  const spans: WordSpan[] = []
  WORD.lastIndex = 0
  let match = WORD.exec(text)
  while (match !== null) {
    spans.push({ text: match[0], index: match.index, length: match[0].length })
    match = WORD.exec(text)
  }
  return spans
}

export function splitWords(text: string): readonly string[] {
  return wordSpans(text).map((span) => span.text)
}

// ----------------------------------------------------------------- syllables

/**
 * English syllable estimate: vowel groups, with the usual corrections for a
 * silent final `e`, `-ed`/`-es` endings and a syllabic `-le`. A heuristic, it
 * is off by one on words like "idea", but consistent, which is what the
 * readability formulas need. Never below 1 for a non-empty word.
 */
export function countSyllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (w.length === 0) return 0
  if (w.length <= 3) return 1
  if (/[^aeiouy]le$/.test(w)) {
    // "table", "little": the -le is its own syllable, keep it.
  } else if (/[^sxzhaeiouy]es$/.test(w) || /[^tdaeiouy]ed$/.test(w)) {
    w = w.slice(0, -2)
  } else if (/[^aeiouy]e$/.test(w) || /[aeiou]le$/.test(w)) {
    w = w.slice(0, -1)
  }
  w = w.replace(/^y/, '')
  const groups = w.match(/[aeiouy]+/g)
  let count = groups ? groups.length : 0
  // "-ia", "-io" and "-ual" endings are two syllables ("media", "radio").
  if (/(?:[^aeiou]i[ao]|ual)$/.test(w)) count++
  return Math.max(1, count)
}

// ---------------------------------------------------------------- readability

export function fleschReadingEase(words: number, sentences: number, syllables: number): number {
  if (words === 0) return 0
  const perSentence = words / Math.max(1, sentences)
  return 206.835 - 1.015 * perSentence - 84.6 * (syllables / words)
}

export function fleschKincaidGrade(words: number, sentences: number, syllables: number): number {
  if (words === 0) return 0
  const perSentence = words / Math.max(1, sentences)
  return 0.39 * perSentence + 11.8 * (syllables / words) - 15.59
}

/** The conventional band names for a Flesch reading-ease score. */
export function readabilityLabel(score: number): string {
  if (score >= 90) return 'Very easy'
  if (score >= 80) return 'Easy'
  if (score >= 70) return 'Fairly easy'
  if (score >= 60) return 'Standard'
  if (score >= 50) return 'Fairly difficult'
  if (score >= 30) return 'Difficult'
  return 'Very difficult'
}

// ---------------------------------------------------------------------- time

function timeEstimate(words: number, wpm: number, noun: string): TimeEstimate {
  const totalSeconds = wpm > 0 ? Math.round((Math.max(0, words) / wpm) * 60) : 0
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const label =
    totalSeconds < 60 ? `< 1 min ${noun}` : `${Math.ceil(totalSeconds / 60)} min ${noun}`
  return { minutes, seconds, label }
}

/** Silent reading time; 238 words per minute is the adult average. */
export function readingTime(words: number, wpm = 238): TimeEstimate {
  return timeEstimate(words, wpm, 'read')
}

/** Time to read aloud; 150 words per minute is a comfortable presentation pace. */
export function speakingTime(words: number, wpm = 150): TimeEstimate {
  return timeEstimate(words, wpm, 'speaking')
}

// ------------------------------------------------------------------ keywords

export const ENGLISH_STOPWORDS: ReadonlySet<string> = new Set([
  'a',
  'about',
  'above',
  'after',
  'again',
  'against',
  'all',
  'am',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'because',
  'been',
  'before',
  'being',
  'below',
  'between',
  'both',
  'but',
  'by',
  'can',
  'could',
  'did',
  'do',
  'does',
  'doing',
  'down',
  'during',
  'each',
  'few',
  'for',
  'from',
  'further',
  'had',
  'has',
  'have',
  'having',
  'he',
  'her',
  'here',
  'hers',
  'herself',
  'him',
  'himself',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  "it's",
  'its',
  'itself',
  'just',
  'me',
  'more',
  'most',
  'my',
  'myself',
  'no',
  'nor',
  'not',
  'now',
  'of',
  'off',
  'on',
  'once',
  'only',
  'or',
  'other',
  'our',
  'ours',
  'ourselves',
  'out',
  'over',
  'own',
  'same',
  'she',
  'should',
  'so',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'theirs',
  'them',
  'themselves',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'to',
  'too',
  'under',
  'until',
  'up',
  'very',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
  'yours',
  'yourself',
  'yourselves',
])

/**
 * The most frequent words, case-folded, with each word's share of the total
 * word count. Stopwords and bare numbers are skipped; the denominator still
 * counts every word so densities are comparable across texts.
 */
export function keywordDensity(
  text: string,
  options: KeywordDensityOptions = {},
): readonly KeywordEntry[] {
  const limit = options.limit ?? 10
  const minLength = options.minLength ?? 3
  const stopwords =
    options.stopwords === undefined
      ? ENGLISH_STOPWORDS
      : options.stopwords instanceof Set
        ? options.stopwords
        : new Set(options.stopwords)
  const words = splitWords(text).map((word) => word.toLowerCase())
  const total = words.length
  if (total === 0 || limit <= 0) return []
  const counts = new Map<string, number>()
  for (const word of words) {
    if (word.length < minLength || stopwords.has(word) || /^\p{N}+$/u.test(word)) continue
    counts.set(word, (counts.get(word) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word, count]) => ({ word, count, density: count / total }))
}

// ------------------------------------------------------------- passive voice

const BE_FORMS = /\b(?:am|is|are|was|were|be|been|being|get|gets|got|gotten|getting)\b/giu

/** Words allowed between the auxiliary and the participle ("was not written", "were often seen"). */
const PASSIVE_ADVERB =
  /^(?:not|never|also|often|always|already|still|just|recently|being|usually|widely|largely|mostly|partly|finally|later|then|thus|therefore|generally|quickly|slowly|badly|well|only|even|all|both|clearly|actually|really|n't)$/iu

/** Irregular past participles: anything not ending in -ed the regex would otherwise miss. */
export const IRREGULAR_PARTICIPLES: ReadonlySet<string> = new Set([
  'arisen',
  'awoken',
  'beaten',
  'become',
  'begun',
  'bent',
  'bet',
  'bitten',
  'bled',
  'blown',
  'born',
  'borne',
  'bought',
  'bound',
  'bred',
  'broken',
  'brought',
  'built',
  'burnt',
  'burst',
  'cast',
  'caught',
  'chosen',
  'clung',
  'come',
  'cost',
  'crept',
  'cut',
  'dealt',
  'done',
  'drawn',
  'dreamt',
  'driven',
  'drunk',
  'dug',
  'dwelt',
  'eaten',
  'fallen',
  'fed',
  'felt',
  'fled',
  'flung',
  'flown',
  'forbidden',
  'forecast',
  'foreseen',
  'forgiven',
  'forgotten',
  'forsaken',
  'fought',
  'found',
  'frozen',
  'given',
  'gone',
  'ground',
  'grown',
  'heard',
  'held',
  'hidden',
  'hit',
  'hung',
  'hurt',
  'kept',
  'knelt',
  'knit',
  'known',
  'laid',
  'lain',
  'leant',
  'leapt',
  'learnt',
  'led',
  'left',
  'lent',
  'let',
  'lit',
  'lost',
  'made',
  'meant',
  'met',
  'misled',
  'mistaken',
  'misunderstood',
  'mown',
  'overcome',
  'overdone',
  'overridden',
  'overseen',
  'overtaken',
  'overthrown',
  'paid',
  'proven',
  'put',
  'quit',
  'read',
  'rebuilt',
  'redone',
  'remade',
  'rent',
  'repaid',
  'rewritten',
  'rid',
  'ridden',
  'risen',
  'run',
  'said',
  'sawn',
  'seen',
  'sent',
  'set',
  'sewn',
  'shaken',
  'shed',
  'shone',
  'shot',
  'shown',
  'shrunk',
  'shut',
  'slain',
  'slept',
  'slid',
  'slung',
  'smelt',
  'sold',
  'sought',
  'sown',
  'spat',
  'spelt',
  'spent',
  'spilt',
  'spun',
  'split',
  'spoilt',
  'spoken',
  'spread',
  'sprung',
  'stolen',
  'stuck',
  'stung',
  'stunk',
  'stridden',
  'struck',
  'strung',
  'striven',
  'sung',
  'sunk',
  'swept',
  'swollen',
  'sworn',
  'swum',
  'swung',
  'taken',
  'taught',
  'thought',
  'thrown',
  'thrust',
  'told',
  'torn',
  'trodden',
  'undergone',
  'understood',
  'undertaken',
  'undone',
  'upheld',
  'upset',
  'withdrawn',
  'withheld',
  'withstood',
  'woken',
  'won',
  'worn',
  'wound',
  'woven',
  'written',
  'wrung',
])

/** Words ending in -ed that are not participles ("was red", "is indeed"). */
const NOT_PARTICIPLES = new Set([
  'red',
  'bed',
  'wed',
  'shed',
  'sled',
  'need',
  'indeed',
  'seed',
  'feed',
  'speed',
  'bleed',
  'breed',
  'greed',
  'deed',
  'weed',
  'reed',
  'creed',
  'hundred',
  'kindred',
  'sacred',
  'hatred',
  'naked',
  'wicked',
  'rugged',
  'ragged',
  'jagged',
  'wretched',
  'crooked',
  'aged',
  'blessed',
  'learned',
  'beloved',
  'dogged',
  'legged',
  'coed',
  'med',
  'ted',
  'zed',
  'fed',
  'led',
])

function isPastParticiple(word: string): boolean {
  const lower = word.toLowerCase()
  if (IRREGULAR_PARTICIPLES.has(lower)) return true
  if (NOT_PARTICIPLES.has(lower)) return false
  return lower.length >= 4 && lower.endsWith('ed')
}

/**
 * Passive constructions: a form of "be" or "get", optional adverbs, then a
 * past participle (`was written`, `were often ignored`, `got fired`). The
 * progressive (`was running`) never matches because `-ing` is not a
 * participle form here; adjectival participles (`was tired`) are reported,
 * as every style checker does, the reader decides.
 */
export function findPassiveSentences(text: string): readonly PassiveMatch[] {
  const matches: PassiveMatch[] = []
  for (const sentence of sentenceSpans(text)) {
    BE_FORMS.lastIndex = 0
    let be = BE_FORMS.exec(sentence.text)
    while (be !== null) {
      const found = passiveAfter(sentence.text, be.index, be[0])
      if (found) {
        matches.push({
          sentence: sentence.text,
          index: sentence.index + be.index,
          length: found.end - be.index,
          trigger: sentence.text.slice(be.index, found.end),
          byAgent: found.byAgent,
        })
        BE_FORMS.lastIndex = found.end
      }
      be = BE_FORMS.exec(sentence.text)
    }
  }
  return matches
}

function passiveAfter(
  text: string,
  start: number,
  auxiliary: string,
): { end: number; byAgent: boolean } | null {
  let cursor = start + auxiliary.length
  // An optional "n't" lets "wasn't written" through; the auxiliary regex
  // stops at the word boundary before the apostrophe.
  const word = /(?:n['’]t)?\s+([\p{L}'’]+)/uy
  let adverbs = 0
  for (;;) {
    word.lastIndex = cursor
    const next = word.exec(text)
    if (!next) return null
    const token = next[1] as string
    const end = next.index + next[0].length
    if (isPastParticiple(token)) {
      const by = /\s+by\b/uy
      by.lastIndex = end
      const agent = by.exec(text)
      return { end: agent ? end + agent[0].length : end, byAgent: agent !== null }
    }
    if (adverbs < 2 && PASSIVE_ADVERB.test(token)) {
      adverbs++
      cursor = end
      continue
    }
    return null
  }
}

// ------------------------------------------------------------ repeated words

/** Doubled words that are grammatical ("he had had enough", "I know that that is true"). */
const REPEAT_ALLOWLIST = new Set(['had had', 'that that'])

/**
 * Words repeated back to back ("the the"), case-insensitively, with only
 * whitespace (or a line break) between them.
 */
export function findRepeatedWords(text: string): readonly RepeatedWord[] {
  const repeated: RepeatedWord[] = []
  const words = wordSpans(text)
  for (let i = 1; i < words.length; i++) {
    const previous = words[i - 1] as WordSpan
    const current = words[i] as WordSpan
    if (previous.text.toLowerCase() !== current.text.toLowerCase()) continue
    const gap = text.slice(previous.index + previous.length, current.index)
    if (gap.length === 0 || !/^\s+$/u.test(gap)) continue
    if (REPEAT_ALLOWLIST.has(`${previous.text.toLowerCase()} ${current.text.toLowerCase()}`))
      continue
    // Single letters and numbers repeat legitimately ("section 2 2.1", "A A battery").
    if (previous.text.length < 2 || /^\p{N}+$/u.test(previous.text)) continue
    repeated.push({
      word: previous.text,
      index: previous.index,
      length: current.index + current.length - previous.index,
    })
  }
  return repeated
}

// ------------------------------------------------------------------ analysis

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/** Sentences longer than `maxWords` words. */
export function findLongSentences(text: string, maxWords = 25): readonly LongSentence[] {
  const long: LongSentence[] = []
  for (const span of sentenceSpans(text)) {
    const words = splitWords(span.text).length
    if (words > maxWords)
      long.push({ sentence: span.text, index: span.index, length: span.length, words })
  }
  return long
}

/** Everything at once, for a statistics panel. Paragraphs are non-blank lines. */
export function analyzeText(text: string, options: TextAnalysisOptions = {}): TextAnalysis {
  const wordList = splitWords(text)
  const words = wordList.length
  const sentences = sentenceSpans(text).length
  const paragraphs = text.split(/\n+/u).filter((line) => line.trim().length > 0).length
  const syllables = wordList.reduce((sum, word) => sum + countSyllables(word), 0)
  const ease = fleschReadingEase(words, sentences, syllables)
  return {
    characters: text.length,
    charactersNoSpaces: text.replace(/\s/gu, '').length,
    words,
    sentences,
    paragraphs,
    syllables,
    averageWordsPerSentence: round1(words / Math.max(1, sentences)),
    fleschReadingEase: round1(ease),
    fleschKincaidGrade: round1(fleschKincaidGrade(words, sentences, syllables)),
    readabilityLabel: readabilityLabel(ease),
    readingTime: readingTime(words),
    speakingTime: speakingTime(words),
    passive: findPassiveSentences(text),
    repeated: findRepeatedWords(text),
    keywords: keywordDensity(text, options.keywords),
    longSentences: findLongSentences(text, options.longSentenceWords ?? 25),
  }
}
