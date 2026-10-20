// Word-list checks: language that leaves people out, a tone that hedges,
// shouts or talks down, and clichés and jargon. Each finding carries a range
// into the text and, where one word simply stands in for another, the
// replacement with the original's casing.

import { matchCase } from './grammar'

/** One finding from a word list. */
export interface StyleMatch {
  readonly index: number
  readonly length: number
  readonly message: string
  /** Replacement for the range; an empty string removes it. Absent when rewording is the fix. */
  readonly suggestion?: string
}

/** A phrase to flag, what to say about it, and its replacement when there is one. */
export interface StyleEntry {
  readonly phrase: string
  readonly message: string
  readonly suggestion?: string
}

/** Wording that excludes, with the everyday alternative. */
export const INCLUSIVE_TERMS: readonly StyleEntry[] = [
  ...(
    [
      ['chairman', 'chair'],
      ['chairmen', 'chairs'],
      ['businessman', 'businessperson'],
      ['businessmen', 'businesspeople'],
      ['salesman', 'salesperson'],
      ['salesmen', 'salespeople'],
      ['policeman', 'police officer'],
      ['policemen', 'police officers'],
      ['fireman', 'firefighter'],
      ['firemen', 'firefighters'],
      ['mailman', 'mail carrier'],
      ['stewardess', 'flight attendant'],
      ['manpower', 'workforce'],
      ['man-hours', 'person-hours'],
      ['mankind', 'humanity'],
      ['manmade', 'artificial'],
      ['man-made', 'artificial'],
      ['freshman', 'first-year student'],
      ['you guys', 'you all'],
      ['hey guys', 'hi everyone'],
    ] as const
  ).map(([phrase, suggestion]) => ({
    phrase,
    suggestion,
    message: `“${phrase}” leaves people out; “${suggestion}” includes everyone`,
  })),
  ...(
    [
      ['whitelist', 'allowlist'],
      ['whitelisted', 'allowlisted'],
      ['blacklist', 'blocklist'],
      ['blacklisted', 'blocklisted'],
      ['grandfathered', 'exempted'],
    ] as const
  ).map(([phrase, suggestion]) => ({
    phrase,
    suggestion,
    message: `“${suggestion}” says the same without the history “${phrase}” carries`,
  })),
  ...(
    [
      ['sanity check', 'quick check'],
      ['crazy', 'wild'],
      ['insane', 'extreme'],
      ['lame', 'weak'],
      ['crippled', 'impaired'],
      ['handicapped', 'disabled'],
      ['dumb', 'silly'],
      ['blind spot', 'gap'],
    ] as const
  ).map(([phrase, suggestion]) => ({
    phrase,
    suggestion,
    message: `“${phrase}” uses a disability as a figure of speech; try “${suggestion}”`,
  })),
]

/** Hedges, intensifiers and words that talk down to the reader. */
export const TONE_PHRASES: readonly StyleEntry[] = [
  ...['just', 'really', 'very', 'extremely', 'totally', 'literally', 'absolutely', 'quite'].map(
    (phrase) => ({
      phrase,
      suggestion: '',
      message: `“${phrase}” adds emphasis without meaning; the sentence stands without it`,
    }),
  ),
  ...['I think', 'I feel', 'I believe', 'sort of', 'kind of', 'a bit', 'somewhat', 'perhaps'].map(
    (phrase) => ({
      phrase,
      message: `“${phrase}” hedges: say it plainly, or say why it is uncertain`,
    }),
  ),
  ...['obviously', 'clearly', 'of course', 'simply', 'everyone knows', 'needless to say'].map(
    (phrase) => ({
      phrase,
      message: `“${phrase}” can read as talking down to anyone who did not find it obvious`,
    }),
  ),
]

/** Clichés, and jargon with its plain word. */
export const CLICHES: readonly StyleEntry[] = [
  ...[
    'at the end of the day',
    'think outside the box',
    'low-hanging fruit',
    'move the needle',
    'paradigm shift',
    'game changer',
    'in this day and age',
    'avoid it like the plague',
    'the tip of the iceberg',
    'a perfect storm',
    'needle in a haystack',
    'few and far between',
    'last but not least',
    'only time will tell',
    'crystal clear',
    'boil the ocean',
    'deep dive',
    'win-win',
    'best of breed',
    'the elephant in the room',
    'push the envelope',
    'a level playing field',
  ].map((phrase) => ({ phrase, message: `“${phrase}” is a cliché; say what it means here` })),
  ...(
    [
      ['utilize', 'use'],
      ['utilise', 'use'],
      ['leverage', 'use'],
      ['synergy', 'cooperation'],
      ['going forward', 'from now on'],
      ['at this point in time', 'now'],
      ['in order to', 'to'],
      ['due to the fact that', 'because'],
      ['touch base', 'talk'],
      ['circle back', 'return to it'],
      ['reach out', 'contact'],
      ['bandwidth', 'time'],
      ['actionable', 'practical'],
      ['ideate', 'think of'],
    ] as const
  ).map(([phrase, suggestion]) => ({
    phrase,
    suggestion,
    message: `“${phrase}” is jargon; “${suggestion}” says it plainly`,
  })),
]

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Every place a phrase from `entries` stands as whole words, in text order.
 * A removal takes the space after the phrase with it, so the sentence closes
 * up as if the phrase had never been written.
 */
export function findPhrases(text: string, entries: readonly StyleEntry[]): readonly StyleMatch[] {
  const found: StyleMatch[] = []
  for (const entry of entries) {
    const words = entry.phrase.split(' ').map(escapeRegExp).join('\\s+')
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}'’-])${words}(?![\\p{L}\\p{N}'’-])`, 'giu')
    for (const match of text.matchAll(pattern)) {
      const index = match.index ?? 0
      let length = match[0].length
      let suggestion = entry.suggestion
      if (suggestion === '' && /(?:^|[.!?]\s+)$/u.test(text.slice(0, index))) {
        // Removing the first word would leave the sentence starting in
        // lower case: rewording is the fix there.
        suggestion = undefined
      } else if (suggestion === '') {
        // The space after goes with a removed word, so none is left doubled.
        if (text[index + length] === ' ') length += 1
      } else if (suggestion !== undefined) {
        suggestion = matchCase(match[0], suggestion)
      }
      found.push({
        index,
        length,
        message: entry.message,
        ...(suggestion === undefined ? {} : { suggestion }),
      })
    }
  }
  return found.sort((a, b) => a.index - b.index)
}
