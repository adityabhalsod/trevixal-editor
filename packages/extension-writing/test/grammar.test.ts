import { describe, expect, it } from 'vitest'
import {
  GRAMMAR_RULES,
  type GrammarIssue,
  type GrammarRuleId,
  checkGrammar,
  matchCase,
  wantsAn,
} from '../src/grammar'

/** The issues of one rule, so a test can name what it is about. */
function issuesOf(text: string, rule: GrammarRuleId): readonly GrammarIssue[] {
  return checkGrammar(text).filter((issue) => issue.rule === rule)
}

/** The text an issue points at, to prove `index` and `length` line up. */
function flagged(text: string, issue: GrammarIssue): string {
  return text.slice(issue.index, issue.index + issue.length)
}

describe('checkGrammar rules', () => {
  it('flags a repeated word', () => {
    const text = 'This is is wrong.'
    const [issue] = issuesOf(text, 'repeated-word')
    expect(issue).toMatchObject({ index: 5, length: 5, suggestion: 'is' })
    expect(flagged(text, issue as GrammarIssue)).toBe('is is')
    expect(issue?.message).toBe('Repeated word "is"')
  })

  it('flags "a" before a vowel sound', () => {
    const text = 'I saw a apple.'
    const [issue] = issuesOf(text, 'article')
    expect(issue).toMatchObject({ index: 6, length: 1, suggestion: 'an' })
    expect(flagged(text, issue as GrammarIssue)).toBe('a')
    expect(issue?.message).toBe('Use "an" before "apple"')
  })

  it('flags "an" before a consonant sound', () => {
    const text = 'I saw an dog.'
    const [issue] = issuesOf(text, 'article')
    expect(issue).toMatchObject({ index: 6, length: 2, suggestion: 'a' })
    expect(flagged(text, issue as GrammarIssue)).toBe('an')
  })

  it('flags a lowercase sentence start', () => {
    const text = 'this starts small.'
    const [issue] = issuesOf(text, 'sentence-case')
    expect(issue).toMatchObject({ index: 0, length: 1, suggestion: 'T' })
    expect(flagged(text, issue as GrammarIssue)).toBe('t')
    expect(issue?.message).toBe('Sentence should start with a capital letter')
  })

  it('flags a double space', () => {
    const text = 'Two  spaces here.'
    const [issue] = issuesOf(text, 'double-space')
    expect(issue).toMatchObject({ index: 3, length: 2, suggestion: ' ' })
    expect(flagged(text, issue as GrammarIssue)).toBe('  ')
  })

  it('flags a space before punctuation', () => {
    const text = 'A space , before it.'
    const [issue] = issuesOf(text, 'space-before-punctuation')
    expect(issue).toMatchObject({ index: 7, length: 2, suggestion: ',' })
    expect(flagged(text, issue as GrammarIssue)).toBe(' ,')
    expect(issue?.message).toBe('No space before ","')
  })

  it('flags a missing space after a comma', () => {
    const text = 'Hello,world today.'
    const [issue] = issuesOf(text, 'missing-space')
    expect(issue).toMatchObject({ index: 5, length: 1, suggestion: ', ' })
    expect(flagged(text, issue as GrammarIssue)).toBe(',')
    expect(issue?.message).toBe('Missing space after ","')
  })

  it('flags a missing space after a sentence-ending period', () => {
    const text = 'End of one.Next begins.'
    const [issue] = issuesOf(text, 'missing-space')
    expect(issue).toMatchObject({ index: 10, length: 1, suggestion: '. ' })
    expect(flagged(text, issue as GrammarIssue)).toBe('.')
  })

  it('flags common misspellings with a case-preserving correction', () => {
    const text = 'I recieve teh Seperate letter.'
    expect(
      issuesOf(text, 'misspelling').map((issue) => [
        flagged(text, issue),
        issue.suggestion,
        issue.index,
        issue.length,
      ]),
    ).toEqual([
      ['recieve', 'receive', 2, 7],
      ['teh', 'the', 10, 3],
      ['Seperate', 'Separate', 14, 8],
    ])
    expect(issuesOf('Wierd', 'misspelling')[0]?.message).toBe('Possible misspelling: "Weird"')
  })

  it('flags commonly confused phrases', () => {
    const text = 'I could of gone, and its a shame.'
    const issues = issuesOf(text, 'common-error')
    expect(issues.map((issue) => [flagged(text, issue), issue.suggestion])).toEqual([
      ['could of', 'could have'],
      ['its a', "it's a"],
    ])
    expect(issues[0]?.message).toBe('Did you mean "could have"?')
  })

  it('flags "alot", "irregardless" and the comparison "then"', () => {
    expect(issuesOf('it is alot better', 'common-error')[0]?.suggestion).toBe('a lot')
    expect(issuesOf('Irregardless, we go.', 'common-error')[0]?.suggestion).toBe('Regardless')
    expect(issuesOf('More then ten.', 'common-error')[0]?.suggestion).toBe('More than')
  })

  it('sorts every issue by position and labels every rule id', () => {
    const text = 'this is is a apple  , recieve.'
    const issues = checkGrammar(text)
    const indexes = issues.map((issue) => issue.index)
    expect([...indexes].sort((a, b) => a - b)).toEqual(indexes)
    for (const issue of issues) {
      expect(GRAMMAR_RULES[issue.rule]).toBeTypeOf('string')
    }
    expect(Object.keys(GRAMMAR_RULES)).toHaveLength(8)
  })

  it('finds nothing to say about clean prose', () => {
    expect(checkGrammar('The team wrote a report. It was an honest account.')).toEqual([])
  })
})

describe('checkGrammar false positives', () => {
  it('leaves a lowercase clause after a quoted exclamation alone', () => {
    expect(issuesOf('"Stop!" she said.', 'sentence-case')).toEqual([])
  })

  it('leaves camel-cased and dotted words at a sentence start alone', () => {
    expect(issuesOf('iPhone sales rose.', 'sentence-case')).toEqual([])
    expect(issuesOf('e.g. this one.', 'sentence-case')).toEqual([])
    expect(issuesOf('i.e., that one.', 'sentence-case')).toEqual([])
    expect(issuesOf('example.com is down.', 'sentence-case')).toEqual([])
  })

  it('still asks for a capital when the sentence is one lowercase word', () => {
    expect(issuesOf('hello.', 'sentence-case')[0]).toMatchObject({ index: 0, suggestion: 'H' })
  })

  it('leaves a capital "A" that is not the article alone', () => {
    expect(issuesOf('A vitamin A deficiency appeared.', 'article')).toEqual([])
  })

  it('leaves punctuation inside a URL alone', () => {
    expect(checkGrammar('See http://example.com/a,b now.')).toEqual([])
    expect(checkGrammar('Mail me at first.last@example.com please.')).toEqual([])
  })

  it('leaves an abbreviation followed by a capital alone', () => {
    expect(issuesOf('Ask Dr. Smith about it.', 'missing-space')).toEqual([])
  })

  it('leaves leading indentation alone', () => {
    expect(issuesOf('    indented line', 'double-space')).toEqual([])
  })
})

describe('wantsAn', () => {
  it('takes "an" before a vowel sound', () => {
    for (const word of ['apple', 'elephant', 'idea', 'orange', 'umbrella']) {
      expect([word, wantsAn(word)]).toEqual([word, true])
    }
  })

  it('takes "a" before a consonant sound', () => {
    for (const word of ['dog', 'university', 'European', 'one', 'user']) {
      expect([word, wantsAn(word)]).toEqual([word, false])
    }
  })

  it('knows the silent h', () => {
    expect(wantsAn('hour')).toBe(true)
    expect(wantsAn('honest')).toBe(true)
    expect(wantsAn('house')).toBe(false)
  })

  it('reads initialisms by letter name', () => {
    expect(wantsAn('FBI')).toBe(true)
    expect(wantsAn('MRI')).toBe(true)
    expect(wantsAn('NATO')).toBe(true)
    expect(wantsAn('USB')).toBe(false)
  })

  it('reads numbers as they are spoken', () => {
    expect(wantsAn('8')).toBe(true)
    expect(wantsAn('11')).toBe(true)
    expect(wantsAn('18')).toBe(true)
    expect(wantsAn('7')).toBe(false)
    expect(wantsAn('100')).toBe(false)
  })

  it('says nothing about an empty word', () => {
    expect(wantsAn('')).toBe(false)
  })
})

describe('matchCase', () => {
  it('copies ALL CAPS, Capitalised and lowercase shapes', () => {
    expect(matchCase('TEH', 'the')).toBe('THE')
    expect(matchCase('Teh', 'the')).toBe('The')
    expect(matchCase('teh', 'the')).toBe('the')
  })

  it('leaves the replacement alone when there is nothing to copy', () => {
    expect(matchCase('', 'the')).toBe('the')
    expect(matchCase('123', 'the')).toBe('the')
    expect(matchCase('Teh', '')).toBe('')
  })
})
