import { describe, expect, it } from 'vitest'
import {
  ENGLISH_STOPWORDS,
  analyzeText,
  countSyllables,
  findLongSentences,
  findPassiveSentences,
  findRepeatedWords,
  fleschKincaidGrade,
  fleschReadingEase,
  keywordDensity,
  readabilityLabel,
  readingTime,
  sentenceSpans,
  speakingTime,
  splitSentences,
  splitWords,
  wordSpans,
} from '../src/analysis'

describe('countSyllables', () => {
  it('counts one syllable for short and single-vowel-group words', () => {
    for (const word of ['cat', 'the', 'a', 'strength', 'through', 'stripe']) {
      expect([word, countSyllables(word)]).toEqual([word, 1])
    }
  })

  it('counts vowel groups in longer words', () => {
    expect(countSyllables('hello')).toBe(2)
    expect(countSyllables('banana')).toBe(3)
    expect(countSyllables('beautiful')).toBe(3)
    expect(countSyllables('education')).toBe(4)
    expect(countSyllables('university')).toBe(5)
  })

  it('keeps a syllabic -le and drops a silent final -e', () => {
    expect(countSyllables('table')).toBe(2)
    expect(countSyllables('little')).toBe(2)
    expect(countSyllables('simple')).toBe(2)
    // "-ple" is a syllable, "-pe" is not.
    expect(countSyllables('escape')).toBe(2)
  })

  it('drops the -ed and -es endings that carry no syllable', () => {
    expect(countSyllables('walked')).toBe(1)
    expect(countSyllables('washes')).toBe(2)
    // A -ted / -ded ending does sound.
    expect(countSyllables('wanted')).toBe(2)
  })

  it('counts -ia, -io and -ual endings as two syllables', () => {
    expect(countSyllables('media')).toBe(3)
    expect(countSyllables('radio')).toBe(3)
    expect(countSyllables('manual')).toBe(3)
  })

  it('returns 0 for empty input and never less than 1 otherwise', () => {
    expect(countSyllables('')).toBe(0)
    expect(countSyllables('!!!')).toBe(0)
    expect(countSyllables('rhythm')).toBe(1)
    expect(countSyllables('hello!')).toBe(2)
  })

  it('is a documented heuristic, not a dictionary', () => {
    // "idea" is three syllables and "create" two; the estimate is stable,
    // which is what the readability formulas need.
    expect(countSyllables('idea')).toBe(2)
    expect(countSyllables('create')).toBe(1)
  })
})

describe('sentence splitting', () => {
  it('splits on the sentence terminators and trims the surrounding space', () => {
    expect(splitSentences('One. Two? Three! Four')).toEqual(['One.', 'Two?', 'Three!', 'Four'])
  })

  it('reports offsets that address the sentence in the source', () => {
    const text = 'One. Two more.'
    const spans = sentenceSpans(text)
    expect(spans).toHaveLength(2)
    for (const span of spans) {
      expect(text.slice(span.index, span.index + span.length)).toBe(span.text)
    }
    expect(spans[1]?.index).toBe(5)
  })

  it('does not split after a known abbreviation', () => {
    expect(splitSentences('We use tools, e.g. hammers. They work.')).toEqual([
      'We use tools, e.g. hammers.',
      'They work.',
    ])
    expect(splitSentences('Dr. Smith agreed. So did Mrs. Wu.')).toEqual([
      'Dr. Smith agreed.',
      'So did Mrs. Wu.',
    ])
  })

  it('does not split inside a decimal number', () => {
    expect(splitSentences('They cost 3.14 dollars each. Cheap.')).toEqual([
      'They cost 3.14 dollars each.',
      'Cheap.',
    ])
  })

  it('does not split on initials or dotted acronyms', () => {
    expect(splitSentences('J. K. Rowling wrote it.')).toEqual(['J. K. Rowling wrote it.'])
    expect(splitSentences('She works in Washington D.C. now.')).toEqual([
      'She works in Washington D.C. now.',
    ])
  })

  it('closes a sentence at a quoted terminator, the quote mark included', () => {
    // The following clause becomes its own span; the grammar rules know it is
    // not a capitalisation slip.
    expect(splitSentences('"Stop!" she said. He stopped.')).toEqual([
      '"Stop!"',
      'she said.',
      'He stopped.',
    ])
  })

  it('returns nothing for blank input', () => {
    expect(splitSentences('')).toEqual([])
    expect(splitSentences('   \n  ')).toEqual([])
  })
})

describe('word splitting', () => {
  it('keeps apostrophes inside a word and splits everything else', () => {
    expect(splitWords("It's a 3.14 well-known test.")).toEqual([
      "It's",
      'a',
      '3',
      '14',
      'well',
      'known',
      'test',
    ])
  })

  it('reports offsets that address the word in the source', () => {
    const text = 'alpha beta'
    const spans = wordSpans(text)
    expect(spans.map((span) => [span.text, span.index, span.length])).toEqual([
      ['alpha', 0, 5],
      ['beta', 6, 4],
    ])
    for (const span of spans) {
      expect(text.slice(span.index, span.index + span.length)).toBe(span.text)
    }
  })

  it('counts non-ASCII letters as word characters', () => {
    expect(splitWords('naïve café Straße')).toEqual(['naïve', 'café', 'Straße'])
  })
})

describe('readability', () => {
  it('scores the Flesch reading ease of a known sample', () => {
    // 100 words, 5 sentences, 150 syllables: 206.835 − 1.015·20 − 84.6·1.5.
    expect(fleschReadingEase(100, 5, 150)).toBeCloseTo(59.6, 1)
  })

  it('scores the Flesch-Kincaid grade of the same sample', () => {
    // 0.39·20 + 11.8·1.5 − 15.59.
    expect(fleschKincaidGrade(100, 5, 150)).toBeCloseTo(9.9, 1)
  })

  it('scores plain prose as easier than dense prose', () => {
    const plain = analyzeText('The cat sat on the mat. The dog ran fast.')
    const dense = analyzeText(
      'Subsequent international administrative deliberations invariably necessitate ' +
        'considerable organizational accommodation and extraordinary interdisciplinary ' +
        'communication.',
    )
    expect(plain.fleschReadingEase).toBeGreaterThan(90)
    expect(dense.fleschReadingEase).toBeLessThan(30)
    expect(plain.fleschKincaidGrade).toBeLessThan(dense.fleschKincaidGrade)
  })

  it('scores empty text as zero rather than dividing by zero', () => {
    expect(fleschReadingEase(0, 0, 0)).toBe(0)
    expect(fleschKincaidGrade(0, 0, 0)).toBe(0)
    expect(Number.isFinite(analyzeText('').fleschReadingEase)).toBe(true)
  })

  it('names the conventional bands', () => {
    expect(readabilityLabel(95)).toBe('Very easy')
    expect(readabilityLabel(85)).toBe('Easy')
    expect(readabilityLabel(75)).toBe('Fairly easy')
    expect(readabilityLabel(65)).toBe('Standard')
    expect(readabilityLabel(55)).toBe('Fairly difficult')
    expect(readabilityLabel(35)).toBe('Difficult')
    expect(readabilityLabel(10)).toBe('Very difficult')
  })
})

describe('time estimates', () => {
  it('labels anything under a minute as "< 1 min read"', () => {
    expect(readingTime(0).label).toBe('< 1 min read')
    expect(readingTime(100).label).toBe('< 1 min read')
    expect(readingTime(100).minutes).toBe(0)
    expect(readingTime(100).seconds).toBe(25)
  })

  it('rounds whole minutes up for the label but keeps the exact split', () => {
    expect(readingTime(238).label).toBe('1 min read')
    const long = readingTime(500)
    expect(long.label).toBe('3 min read')
    expect(long.minutes).toBe(2)
    expect(long.seconds).toBe(6)
  })

  it('speaks more slowly than it reads and says so', () => {
    expect(speakingTime(300).label).toBe('2 min speaking')
    expect(speakingTime(10).label).toBe('< 1 min speaking')
    expect(speakingTime(1000).minutes).toBeGreaterThan(readingTime(1000).minutes)
  })

  it('accepts a custom words-per-minute rate', () => {
    expect(readingTime(120, 60).label).toBe('2 min read')
    expect(readingTime(120, 0).label).toBe('< 1 min read')
  })
})

describe('keywordDensity', () => {
  it('ranks by count and reports each word’s share of the whole text', () => {
    const entries = keywordDensity('Editors edit text. The editor edits text and text again.')
    expect(entries[0]).toEqual({ word: 'text', count: 3, density: 0.3 })
    expect(entries.map((entry) => entry.word)).toEqual([
      'text',
      'edit',
      'editor',
      'editors',
      'edits',
    ])
  })

  it('skips stopwords, short words and bare numbers', () => {
    const words = keywordDensity('the and but cat 42 to of go cats').map((entry) => entry.word)
    expect(words).toEqual(['cat', 'cats'])
    expect(ENGLISH_STOPWORDS.has('the')).toBe(true)
  })

  it('honours limit, minLength and a custom stopword list', () => {
    const text = 'alpha alpha beta beta gamma delta'
    expect(keywordDensity(text, { limit: 2 }).map((entry) => entry.word)).toEqual(['alpha', 'beta'])
    expect(keywordDensity(text, { stopwords: ['alpha'] }).map((entry) => entry.word)).toEqual([
      'beta',
      'delta',
      'gamma',
    ])
    expect(keywordDensity('go to it', { minLength: 2, stopwords: [] }).length).toBe(3)
  })

  it('returns nothing for empty text or a non-positive limit', () => {
    expect(keywordDensity('')).toEqual([])
    expect(keywordDensity('alpha beta', { limit: 0 })).toEqual([])
  })
})

describe('findPassiveSentences', () => {
  it('flags a be-passive naming its agent', () => {
    const text = 'The report was written by the team.'
    const [match] = findPassiveSentences(text)
    expect(match?.trigger).toBe('was written by')
    expect(match?.byAgent).toBe(true)
    expect(text.slice(match?.index, (match?.index ?? 0) + (match?.length ?? 0))).toBe(
      'was written by',
    )
  })

  it('flags an agentless passive', () => {
    const [match] = findPassiveSentences('Mistakes were made.')
    expect(match?.trigger).toBe('were made')
    expect(match?.byAgent).toBe(false)
  })

  it('flags a perfect passive', () => {
    const [match] = findPassiveSentences('It has been decided.')
    expect(match?.trigger).toBe('been decided')
    expect(match?.sentence).toBe('It has been decided.')
  })

  it('flags a get-passive and reaches over adverbs', () => {
    expect(findPassiveSentences('The bug got fixed quickly.')[0]?.trigger).toBe('got fixed')
    expect(findPassiveSentences('The door was not opened.')[0]?.trigger).toBe('was not opened')
  })

  it('leaves the progressive and the active voice alone', () => {
    expect(findPassiveSentences('She was running.')).toEqual([])
    expect(findPassiveSentences('The team wrote the report.')).toEqual([])
    expect(findPassiveSentences('He is happy and they are here.')).toEqual([])
  })

  it('does not mistake a colour or a plain noun for a participle', () => {
    expect(findPassiveSentences('The barn was red.')).toEqual([])
    expect(findPassiveSentences('It is indeed a bed.')).toEqual([])
  })

  it('finds a match in each sentence of a paragraph', () => {
    const matches = findPassiveSentences('The vase was broken. Then it was replaced by Sam.')
    expect(matches.map((match) => match.trigger)).toEqual(['was broken', 'was replaced by'])
    expect(matches[1]?.byAgent).toBe(true)
  })
})

describe('findRepeatedWords', () => {
  it('flags a doubled word and spans both occurrences', () => {
    const text = 'This is is a test.'
    const [repeat] = findRepeatedWords(text)
    expect(repeat?.word).toBe('is')
    expect(text.slice(repeat?.index, (repeat?.index ?? 0) + (repeat?.length ?? 0))).toBe('is is')
  })

  it('compares case-insensitively but reports the first spelling', () => {
    const [repeat] = findRepeatedWords('The The cat.')
    expect(repeat?.word).toBe('The')
    expect(repeat?.index).toBe(0)
    expect(repeat?.length).toBe(7)
  })

  it('accepts a line break between the two words', () => {
    expect(findRepeatedWords('one one\ntwo two')).toHaveLength(2)
  })

  it('allows the grammatical doubles', () => {
    expect(findRepeatedWords('He had had enough.')).toEqual([])
    expect(findRepeatedWords('I know that that is true.')).toEqual([])
  })

  it('ignores single letters and numbers, which repeat legitimately', () => {
    expect(findRepeatedWords('Section 2 2 here.')).toEqual([])
    expect(findRepeatedWords('An A A battery.')).toEqual([])
  })

  it('needs the two words to be adjacent', () => {
    expect(findRepeatedWords('the cat the mat')).toEqual([])
    expect(findRepeatedWords('word, word')).toEqual([])
  })
})

describe('findLongSentences', () => {
  it('reports sentences over the word limit only', () => {
    const long = `${'word '.repeat(30).trim()}. Short one.`
    const found = findLongSentences(long)
    expect(found).toHaveLength(1)
    expect(found[0]?.words).toBe(30)
    expect(found[0]?.index).toBe(0)
  })

  it('honours a custom limit', () => {
    expect(findLongSentences('one two three four.', 3)).toHaveLength(1)
    expect(findLongSentences('one two three four.', 4)).toEqual([])
  })
})

describe('analyzeText', () => {
  it('reports a coherent whole for a small document', () => {
    const text = 'The cat sat on the mat. The dog ran fast.'
    const analysis = analyzeText(text)
    expect(analysis.characters).toBe(text.length)
    expect(analysis.charactersNoSpaces).toBe(text.replace(/\s/g, '').length)
    expect(analysis.words).toBe(10)
    expect(analysis.sentences).toBe(2)
    expect(analysis.paragraphs).toBe(1)
    expect(analysis.averageWordsPerSentence).toBe(5)
    expect(analysis.syllables).toBeGreaterThanOrEqual(analysis.words)
    expect(analysis.readabilityLabel).toBe(readabilityLabel(analysis.fleschReadingEase))
    expect(analysis.readingTime.label).toBe('< 1 min read')
    expect(analysis.speakingTime.label).toBe('< 1 min speaking')
    expect(analysis.passive).toEqual([])
    expect(analysis.repeated).toEqual([])
    expect(analysis.longSentences).toEqual([])
    expect(analysis.keywords.map((entry) => entry.word)).toContain('cat')
  })

  it('counts non-blank lines as paragraphs', () => {
    expect(analyzeText('One line.\n\nAnother line.\n\n\nA third.').paragraphs).toBe(3)
    expect(analyzeText('').paragraphs).toBe(0)
  })

  it('carries the findings of the individual checks', () => {
    const text = 'The report was written by the team. It it was late.'
    const analysis = analyzeText(text)
    expect(analysis.passive.map((match) => match.trigger)).toContain('was written by')
    expect(analysis.repeated.map((repeat) => repeat.word)).toEqual(['It'])
  })

  it('passes its options down to the keyword and long-sentence checks', () => {
    const text = `alpha alpha beta ${'word '.repeat(10).trim()}.`
    expect(analyzeText(text, { keywords: { limit: 1 } }).keywords).toHaveLength(1)
    expect(analyzeText(text, { longSentenceWords: 5 }).longSentences).toHaveLength(1)
    expect(analyzeText(text).longSentences).toEqual([])
  })

  it('survives empty text', () => {
    const analysis = analyzeText('')
    expect(analysis.words).toBe(0)
    expect(analysis.sentences).toBe(0)
    expect(analysis.keywords).toEqual([])
    expect(analysis.readingTime.label).toBe('< 1 min read')
  })
})
