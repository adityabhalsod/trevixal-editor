import { describe, expect, it } from 'vitest'
import { createHighlighter, detectLanguage, detectableLanguages } from '../src'

/** The detected language's id, or null. */
function guess(code: string): string | null {
  return detectLanguage(code)?.language.name ?? null
}

describe('detectLanguage', () => {
  it('recognises each bundled language from a representative snippet', () => {
    const samples: Readonly<Record<string, string>> = {
      typescript: 'export interface User {\n  readonly id: string\n  name: string\n}',
      python: 'def greet(name):\n    print(f"hello {name}")\n    return None',
      sql: 'SELECT name, count(*) AS total\nFROM users\nWHERE active = true\nGROUP BY name;',
      go: 'package main\n\nfunc main() {\n\tx := 1\n\tif err != nil {\n\t\treturn\n\t}\n}',
      rust: 'pub fn main() {\n    let mut total = 0;\n    println!("{}", total);\n}',
      java: 'public class Main {\n  public static void main(String[] a) {\n    System.out.println("x");\n  }\n}',
      html: '<!DOCTYPE html>\n<html>\n<body><div class="x">hi</div></body>\n</html>',
      css: '.card {\n  background: #fff;\n  padding: 12px;\n  display: flex;\n}',
      shell: '#!/bin/bash\nfor f in *.txt; do\n  grep -n foo "$f" | head -3\ndone',
      markdown: '# Title\n\nSome **bold** text and a [link](https://example.com).\n\n- one\n- two',
    }

    for (const [expected, code] of Object.entries(samples)) {
      expect(guess(code), `sample for ${expected}`).toBe(expected)
    }
  })

  it('recognises JSON, which shares its punctuation with everything', () => {
    expect(guess('{\n  "name": "trevixal",\n  "version": "0.0.1",\n  "private": true\n}')).toBe(
      'json',
    )
  })

  it('declines a sample too short to carry evidence', () => {
    // `{}` is valid JSON, valid JavaScript and plausible CSS. Guessing from it
    // would be noise, so nothing is reported.
    expect(guess('{}')).toBeNull()
    expect(guess('x = 1')).toBeNull()
  })

  it('declines prose rather than calling it markdown', () => {
    expect(
      guess('This is an ordinary paragraph of writing with no code in it whatsoever.'),
    ).toBeNull()
  })

  it('declines when two languages score within the margin', () => {
    // A deliberately ambiguous snippet: valid in several C-family languages
    // and distinctive of none. Reporting a winner here would be a coin flip.
    expect(guess('a = b + c;\nd = e * f;\ng = h - i;')).toBeNull()
  })

  it('respects a raised score threshold', () => {
    const code = '# Title\n\n- one\n- two'
    expect(detectLanguage(code)).not.toBeNull()
    expect(detectLanguage(code, { minimumScore: 99 })).toBeNull()
  })

  it('can be restricted to a subset of languages', () => {
    const python = 'def greet(name):\n    print(name)\n    return None'
    expect(detectLanguage(python, { languages: ['python'] })?.language.name).toBe('python')
    // Excluded entirely: the only real candidate is gone, so nothing is
    // reported rather than the next-best guess.
    expect(detectLanguage(python, { languages: ['css', 'html'] })).toBeNull()
  })

  it('reports the margin it won by', () => {
    const result = detectLanguage('SELECT id FROM users WHERE active = true;')
    expect(result?.margin).toBeGreaterThan(0)
    expect(result?.score).toBeGreaterThanOrEqual(4)
  })

  it('lists the languages it can detect', () => {
    const names = detectableLanguages()
    expect(names).toContain('python')
    expect(names).toContain('sql')
    expect(names.length).toBeGreaterThan(8)
  })
})

describe('highlighter auto-detect', () => {
  const python = 'def greet(name):\n    print(name)\n    return None'

  it('leaves an unlabelled block plain by default', () => {
    // Guessing changes what the reader sees without being asked, so it is
    // opt-in rather than the default.
    expect(createHighlighter().highlight(python, null)).toHaveLength(0)
  })

  it('detects an unlabelled block when asked to', () => {
    expect(createHighlighter({ autoDetect: true }).highlight(python, null).length).toBeGreaterThan(
      0,
    )
  })

  it('never overrides a language the block names', () => {
    const highlighter = createHighlighter({ autoDetect: true })
    // Declared SQL, actually Python: the declaration wins, because it is a
    // decision and detection is only an inference.
    const tokens = highlighter.highlight(python, 'sql')
    const asSql = createHighlighter().highlight(python, 'sql')
    expect(tokens).toEqual(asSql)
  })

  it('prefers an explicit fallback over detection', () => {
    const highlighter = createHighlighter({ autoDetect: true, fallback: 'sql' })
    expect(highlighter.highlight(python, null)).toEqual(
      createHighlighter({ fallback: 'sql' }).highlight(python, null),
    )
  })
})
