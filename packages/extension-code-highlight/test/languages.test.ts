import { describe, expect, it } from 'vitest'
import { BUNDLED_LANGUAGES, createHighlighter, findLanguage, languageDisplayName } from '../src'

const highlighter = createHighlighter()

/** The classes assigned to each piece of text, for readable assertions. */
function classify(code: string, language: string): [string, string][] {
  return highlighter
    .highlight(code, language)
    .map((token) => [code.slice(token.from, token.to), token.className.replace('tvx-tok-', '')])
}

function classOf(code: string, language: string, text: string): string | undefined {
  return classify(code, language).find(([value]) => value === text)?.[1]
}

describe('language resolution', () => {
  it('resolves names, aliases and casing', () => {
    expect(findLanguage('typescript')?.name).toBe('typescript')
    expect(findLanguage('ts')?.name).toBe('typescript')
    expect(findLanguage('TS')?.name).toBe('typescript')
    expect(findLanguage('  py  ')?.name).toBe('python')
    expect(findLanguage('golang')?.name).toBe('go')
  })

  it('returns null for anything unknown', () => {
    expect(findLanguage('brainfuck')).toBeNull()
    expect(findLanguage('')).toBeNull()
    expect(findLanguage(null)).toBeNull()
  })

  it('renders an unknown language as plain text rather than failing', () => {
    expect(highlighter.highlight('let x = 1', 'cobol')).toEqual([])
    expect(highlighter.highlight('let x = 1', null)).toEqual([])
  })
})

describe('tokenizer invariants', () => {
  const SAMPLE = `
    // a comment "with a string inside"
    const greeting = "hello \\" world";
    function add(a, b) { return a + b; /* block */ }
  `

  it('produces ordered, non-overlapping tokens inside bounds', () => {
    for (const language of BUNDLED_LANGUAGES) {
      const tokens = highlighter.highlight(SAMPLE, language.name)
      let previousEnd = 0
      for (const token of tokens) {
        expect(token.from).toBeGreaterThanOrEqual(previousEnd)
        expect(token.to).toBeGreaterThan(token.from)
        expect(token.to).toBeLessThanOrEqual(SAMPLE.length)
        previousEnd = token.to
      }
    }
  })

  it('terminates on unterminated strings and comments', () => {
    // A scanner that does not advance here would hang the editor.
    for (const language of BUNDLED_LANGUAGES) {
      expect(() => highlighter.highlight('"unterminated', language.name)).not.toThrow()
      expect(() => highlighter.highlight('/* unterminated', language.name)).not.toThrow()
      expect(() => highlighter.highlight("'''unterminated", language.name)).not.toThrow()
    }
  })

  it('handles empty input', () => {
    expect(highlighter.highlight('', 'typescript')).toEqual([])
  })
})

describe('JavaScript and TypeScript', () => {
  it('separates keywords, builtins, strings and numbers', () => {
    const code = 'const total = 42 + Math.PI // sum'
    expect(classOf(code, 'js', 'const')).toBe('keyword')
    expect(classOf(code, 'js', '42')).toBe('number')
    expect(classOf(code, 'js', 'Math')).toBe('builtin')
    expect(classOf(code, 'js', '// sum')).toBe('comment')
  })

  it('does not colour a keyword that is only part of a longer word', () => {
    // "constant" must not be highlighted because it starts with "const".
    expect(classOf('constant = 1', 'js', 'const')).toBeUndefined()
    expect(classOf('constant = 1', 'js', 'constant')).toBeUndefined()
  })

  it('keeps a comment marker inside a string as string content', () => {
    const code = 'const url = "https://example.com"'
    const tokens = classify(code, 'js')
    expect(tokens.some(([text, kind]) => kind === 'string' && text.includes('//'))).toBe(true)
    expect(tokens.some(([, kind]) => kind === 'comment')).toBe(false)
  })

  it('recognises TypeScript-only keywords', () => {
    expect(classOf('interface User {}', 'ts', 'interface')).toBe('keyword')
    expect(classOf('type Id = string', 'ts', 'type')).toBe('keyword')
    // …which plain JavaScript does not treat as keywords.
    expect(classOf('interface User {}', 'js', 'interface')).toBeUndefined()
  })

  it('marks a call target as a function', () => {
    expect(classOf('doThing(1)', 'ts', 'doThing')).toBe('function')
  })
})

describe('Python', () => {
  it('handles comments, decorators and triple-quoted strings', () => {
    expect(classOf('# note', 'py', '# note')).toBe('comment')
    expect(classOf('@decorator\ndef f(): pass', 'py', '@decorator')).toBe('function')
    expect(classOf('def f(): pass', 'py', 'def')).toBe('keyword')
    expect(classOf('x = True', 'py', 'True')).toBe('builtin')

    const doc = '"""a doc\nstring"""'
    expect(classOf(doc, 'py', doc)).toBe('string')
  })
})

describe('HTML and CSS', () => {
  it('separates tags, attributes and values', () => {
    const code = '<a href="/x" class="y">text</a>'
    expect(classOf(code, 'html', '<a')).toBe('tag')
    expect(classOf(code, 'html', 'href')).toBe('attribute')
    expect(classOf(code, 'html', '"/x"')).toBe('string')
    expect(classOf(code, 'html', '</a')).toBe('tag')
  })

  it('separates selectors, properties and values', () => {
    const code = '.card { color: #fff; width: 10px }'
    expect(classOf(code, 'css', '.card')).toBe('selector')
    expect(classOf(code, 'css', 'color')).toBe('attribute')
    expect(classOf(code, 'css', '#fff')).toBe('number')
    expect(classOf(code, 'css', '10px')).toBe('number')
  })
})

describe('JSON', () => {
  it('distinguishes keys from string values', () => {
    const code = '{"name": "trevixal", "count": 3, "ok": true}'
    expect(classOf(code, 'json', '"name"')).toBe('attribute')
    expect(classOf(code, 'json', '"trevixal"')).toBe('string')
    expect(classOf(code, 'json', '3')).toBe('number')
    expect(classOf(code, 'json', 'true')).toBe('builtin')
  })
})

describe('SQL', () => {
  it('matches keywords in either case', () => {
    expect(classOf('SELECT * FROM users', 'sql', 'SELECT')).toBe('keyword')
    expect(classOf('select * from users', 'sql', 'select')).toBe('keyword')
    expect(classOf('SELECT count(x)', 'sql', 'count')).toBe('builtin')
  })
})

describe('shell, Go, Rust, Java and Markdown', () => {
  it('colours the constructs each language is recognised by', () => {
    expect(classOf('echo $HOME', 'bash', '$HOME')).toBe('variable')
    expect(classOf('ls --all', 'bash', '--all')).toBe('attribute')
    expect(classOf('func main() {}', 'go', 'func')).toBe('keyword')
    expect(classOf('let x: i32 = 1', 'rust', 'i32')).toBe('builtin')
    expect(classOf('println!("hi")', 'rust', 'println!')).toBe('function')
    expect(classOf('@Override public void f()', 'java', '@Override')).toBe('function')
    expect(classOf('# Title', 'md', '# Title')).toBe('keyword')
    expect(classOf('**bold**', 'md', '**bold**')).toBe('builtin')
  })
})

describe('custom languages', () => {
  it('accepts an extra definition and prefers it over a bundled name', () => {
    const custom = createHighlighter({
      languages: [
        {
          name: 'toy',
          aliases: ['t'],
          rules: [{ pattern: /YES|NO/y, className: 'tvx-tok-builtin' }],
        },
      ],
    })
    expect(custom.highlight('YES', 'toy')).toEqual([
      { from: 0, to: 3, className: 'tvx-tok-builtin' },
    ])
    expect(custom.highlight('YES', 't')).toHaveLength(1)
  })

  it('falls back to a default language when a block names none', () => {
    const custom = createHighlighter({ fallback: 'typescript' })
    expect(custom.highlight('const x = 1', null).length).toBeGreaterThan(0)
  })
})

describe('display names', () => {
  it('writes each language the way the project itself does', () => {
    // Title-casing the id gives "Sql", "Html", "Css" and "Javascript", which
    // is why the name is a property of the definition rather than derived.
    const names = new Map(
      BUNDLED_LANGUAGES.map((language) => [language.name, languageDisplayName(language)]),
    )
    expect(names.get('sql')).toBe('SQL')
    expect(names.get('html')).toBe('HTML')
    expect(names.get('css')).toBe('CSS')
    expect(names.get('json')).toBe('JSON')
    expect(names.get('javascript')).toBe('JavaScript')
    expect(names.get('typescript')).toBe('TypeScript')
  })

  it('gives every bundled language a name', () => {
    for (const language of BUNDLED_LANGUAGES) {
      expect(languageDisplayName(language).length).toBeGreaterThan(0)
    }
  })

  it('falls back to the id when a definition omits one', () => {
    expect(languageDisplayName({ name: 'toml', rules: [] })).toBe('toml')
  })
})
