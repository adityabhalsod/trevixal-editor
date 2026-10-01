// The pluggable writing assistant: rewrite, summarise, translate and
// continue, through a provider the host supplies. The editor bundles no
// model and makes no request of its own; a provider can be a language model
// behind the host's server, or rules that run in the page, as the one here
// does.

import { sentenceSpans } from './analysis'
import {
  CLICHES,
  INCLUSIVE_TERMS,
  type StyleEntry,
  TONE_PHRASES,
  findPhrases,
} from './style-checks'

/** What the assistant can be asked to do with some text. */
export type AssistAction = 'rewrite' | 'summarise' | 'translate' | 'continue'

export interface AssistRequest {
  readonly action: AssistAction
  /** The text to work on: the selection, or for `continue` the text before the caret. */
  readonly text: string
  /** For `translate`: the language to translate into, as a BCP 47 code. */
  readonly language?: string
}

export interface WritingProvider {
  /** The actions it can do; the menus offer only these. */
  readonly actions: readonly AssistAction[]
  /** Do one. Stop and reject when `signal` aborts, which is how the reader cancels. */
  assist(request: AssistRequest, options: { readonly signal: AbortSignal }): Promise<string>
}

/** A request the provider cannot answer, or refused. */
export class AssistError extends Error {
  override readonly name = 'AssistError'
}

/** How many sentences a summary keeps at most. */
const SUMMARY_SENTENCES = 3

/** Every replacement a word list offers, applied from the end so earlier offsets hold. */
function applyWordList(text: string, entries: readonly StyleEntry[]): string {
  let result = text
  for (const match of [...findPhrases(result, entries)].reverse()) {
    if (match.suggestion === undefined) continue
    result =
      result.slice(0, match.index) + match.suggestion + result.slice(match.index + match.length)
  }
  return result
}

/** A sentence's first letter in capitals, as a rewrite that removed its first word leaves it. */
const capitalise = (text: string): string =>
  text.replace(
    /(^|[.!?]\s+)(\p{Ll})/gu,
    (_all, before: string, letter: string) => before + letter.toUpperCase(),
  )

/**
 * Plainer wording, by rule: jargon for its plain word, empty intensifiers
 * out, wording that leaves people out for the everyday alternative, and the
 * spacing tidied.
 */
export function rewriteByRules(text: string): string {
  const plain = [CLICHES, TONE_PHRASES, INCLUSIVE_TERMS].reduce(applyWordList, text)
  return capitalise(
    plain
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/ +([,.;:!?])/g, '$1')
      .trim(),
  )
}

/** A summary by rule: the first sentence of each paragraph, three at most. */
export function summariseByRules(text: string): string {
  const firsts = text
    .split(/\n+/)
    .map((paragraph) => sentenceSpans(paragraph.trim())[0]?.text)
    .filter((sentence): sentence is string => Boolean(sentence))
  return firsts.slice(0, SUMMARY_SENTENCES).join(' ')
}

/**
 * A provider that runs in the page and never leaves it: rewriting and
 * summarising by rule. Translating and continuing need a model, so it does
 * not offer them.
 */
export function createRulesProvider(): WritingProvider {
  return {
    actions: ['rewrite', 'summarise'],
    async assist(request, { signal }) {
      if (signal.aborted) throw new AssistError('Cancelled.')
      if (request.action === 'rewrite') return rewriteByRules(request.text)
      if (request.action === 'summarise') return summariseByRules(request.text)
      throw new AssistError(`The built-in rules cannot ${request.action}.`)
    },
  }
}
