import {
  type Command,
  type EditorNode,
  EditorState,
  Fragment,
  type Path,
  Schema,
  TextSelection,
  defaultMarks,
  defaultNodes,
  pos,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { formatCodeBlock, minifyCodeBlock } from '../src/commands'
import { formatJSON, minifyJSON } from '../src/json'
import { formatXML, minifyXML } from '../src/xml'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

function codeBlock(text: string, language: string | null): EditorNode {
  return schema.node(
    'codeBlock',
    { language },
    text ? Fragment.of(schema.text(text)) : Fragment.empty,
  )
}

function docOf(...blocks: EditorNode[]): EditorNode {
  return schema.node('doc', undefined, Fragment.from(blocks))
}

function stateAt(doc: EditorNode, path: Path, offset = 0): EditorState {
  return EditorState.create({ schema, doc, selection: new TextSelection(pos(path, offset)) })
}

function run(state: EditorState, command: Command): EditorState {
  const tr = command(state)
  expect(tr).not.toBeNull()
  return state.apply(tr as NonNullable<typeof tr>)
}

/** The text of the first block, whatever the command did to it. */
function firstBlockText(state: EditorState): string {
  return state.doc.child(0).textContent
}

function expectOk(result: ReturnType<typeof formatJSON>): string {
  expect(result.ok).toBe(true)
  return (result as { ok: true; text: string }).text
}

function expectError(result: ReturnType<typeof formatJSON>): string {
  expect(result.ok).toBe(false)
  return (result as { ok: false; error: string }).error
}

describe('formatJSON', () => {
  it('pretty-prints a nested object with the requested indent', () => {
    const text = expectOk(formatJSON('{"a":{"b":[1,2]}}', 2))
    expect(text).toBe('{\n  "a": {\n    "b": [\n      1,\n      2\n    ]\n  }\n}')
  })

  it('defaults to a two-space indent', () => {
    expect(expectOk(formatJSON('{"a":1}'))).toBe('{\n  "a": 1\n}')
  })

  it('formatting an already formatted document changes nothing', () => {
    const once = expectOk(formatJSON('{"a":{"b":[1,2]},"c":"x"}'))
    expect(expectOk(formatJSON(once))).toBe(once)
  })

  it('preserves unicode and escapes exactly as parsed', () => {
    const text = expectOk(formatJSON('{"k":"héllo \\u00e9 \\n ✓ 😀"}'))
    expect(JSON.parse(text)).toEqual({ k: 'héllo é \n ✓ 😀' })
  })

  it('reports the parser message for malformed input', () => {
    expect(expectError(formatJSON('{"a":}')).length).toBeGreaterThan(0)
    expect(expectError(formatJSON("{'a':1}")).length).toBeGreaterThan(0)
  })

  it('rejects an empty document', () => {
    expect(expectError(formatJSON('   '))).toBe('Empty document')
  })

  it('formats top-level scalars and arrays', () => {
    expect(expectOk(formatJSON('  42 '))).toBe('42')
    expect(expectOk(formatJSON('[]'))).toBe('[]')
    expect(expectOk(formatJSON('null'))).toBe('null')
  })

  it('declines deeply nested input instead of blowing the stack', () => {
    const deep = `${'['.repeat(5000)}1${']'.repeat(5000)}`
    const error = expectError(formatJSON(deep))
    expect(error).toMatch(/nested deeper/)
  })

  it('does not treat brackets inside strings as nesting', () => {
    expect(expectOk(formatJSON('{"a":"[[[[["}'))).toBe('{\n  "a": "[[[[["\n}')
  })

  it('minifies back to a single line, round-tripping with format', () => {
    const source = '{"a":[1,2],"b":"x"}'
    expect(expectOk(minifyJSON(expectOk(formatJSON(source))))).toBe(source)
  })
})

describe('formatXML', () => {
  it('re-indents nested elements', () => {
    const text = expectOk(formatXML('<a><b><c>hi</c></b></a>', 2))
    expect(text).toBe('<a>\n  <b>\n    <c>\n      hi\n    </c>\n  </b>\n</a>')
  })

  it('keeps declarations, comments and CDATA verbatim', () => {
    const source = '<?xml version="1.0"?><r><!-- note --><![CDATA[ <raw> ]]></r>'
    const text = expectOk(formatXML(source))
    expect(text).toContain('<?xml version="1.0"?>')
    expect(text).toContain('<!-- note -->')
    expect(text).toContain('<![CDATA[ <raw> ]]>')
  })

  it('handles self-closing tags and attributes containing >', () => {
    const text = expectOk(formatXML('<a><b title="x > y"/></a>'))
    expect(text).toBe('<a>\n  <b title="x > y"/>\n</a>')
  })

  it('formatting an already formatted document changes nothing', () => {
    const once = expectOk(formatXML('<a><b>t</b><c/></a>'))
    expect(expectOk(formatXML(once))).toBe(once)
  })

  it('preserves unicode text', () => {
    const text = expectOk(formatXML('<a>héllo ✓ 😀</a>'))
    expect(text).toBe('<a>\n  héllo ✓ 😀\n</a>')
  })

  it('leaves the content of a pre element exactly as it was', () => {
    // Inside pre the whitespace is the data, so neither the runs of spaces
    // nor the line breaks may be re-indented away, and the closing tag is
    // left at the margin, since indenting it would append spaces to the text.
    expect(expectOk(formatXML('<x><pre>a  b</pre></x>'))).toBe('<x>\n  <pre>\na  b\n</pre>\n</x>')
    expect(expectOk(formatXML('<x><pre>a\n  b</pre></x>'))).toBe(
      '<x>\n  <pre>\na\n  b\n</pre>\n</x>',
    )
  })

  it('rejects an empty document', () => {
    expect(expectError(formatXML(' '))).toBe('Empty document')
  })

  it('reports mismatched, unclosed and unexpected tags', () => {
    expect(expectError(formatXML('<a></b>'))).toMatch(/does not match/)
    expect(expectError(formatXML('<a><b></b>'))).toMatch(/Unclosed tag/)
    expect(expectError(formatXML('</a>'))).toMatch(/Unexpected closing tag/)
    expect(expectError(formatXML('<a'))).toMatch(/Unterminated tag/)
    expect(expectError(formatXML('<a><!-- x </a>'))).toMatch(/Unterminated comment/)
  })

  it('rejects a doctype declaring an entity', () => {
    // The billion-laughs shape. Nothing here expands entities, but a document
    // carrying one must not survive a round trip into a consumer that does.
    const payload =
      '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">' +
      '<!ENTITY lol2 "&lol;&lol;&lol;">]><lolz>&lol2;</lolz>'
    expect(expectError(formatXML(payload))).toMatch(/ENTITY/)
    expect(expectError(minifyXML(payload))).toMatch(/ENTITY/)
  })

  it('rejects an external entity doctype (XXE)', () => {
    const xxe = '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>'
    expect(expectError(formatXML(xxe))).toMatch(/ENTITY/)
  })

  it('allows a plain doctype with no entity declaration', () => {
    const text = expectOk(formatXML('<!DOCTYPE html><html><body>x</body></html>'))
    expect(text).toContain('<!DOCTYPE html>')
  })

  it('declines deeply nested input instead of blowing the stack', () => {
    const depth = 5000
    const deep = `${'<a>'.repeat(depth)}x${'</a>'.repeat(depth)}`
    expect(expectError(formatXML(deep))).toMatch(/nested deeper/)
  })

  it('minifies back to a single line, round-tripping with format', () => {
    const source = '<a><b>t</b><c/></a>'
    expect(expectOk(minifyXML(expectOk(formatXML(source))))).toBe(source)
  })
})

describe('formatCodeBlock', () => {
  it('reformats a json code block in place', () => {
    const state = stateAt(docOf(codeBlock('{"a":1}', 'json')), [0], 0)
    const next = run(state, formatCodeBlock('json'))
    expect(next.doc.eq(docOf(codeBlock('{\n  "a": 1\n}', 'json')))).toBe(true)
  })

  it('reformats an xml code block in place', () => {
    const state = stateAt(docOf(codeBlock('<a><b/></a>', 'xml')), [0], 0)
    const next = run(state, formatCodeBlock('xml'))
    expect(firstBlockText(next)).toBe('<a>\n  <b/>\n</a>')
  })

  it('puts the caret at the end of the reformatted source', () => {
    const state = stateAt(docOf(codeBlock('{"a":1}', 'json')), [0], 3)
    const next = run(state, formatCodeBlock('json'))
    expect(next.selection.from).toEqual({ path: [0], offset: firstBlockText(next).length })
  })

  it('declines when the block is a different language', () => {
    const state = stateAt(docOf(codeBlock('{"a":1}', 'python')), [0], 0)
    expect(formatCodeBlock('json')(state)).toBeNull()
  })

  it('declines when the block declares no language', () => {
    const state = stateAt(docOf(codeBlock('{"a":1}', null)), [0], 0)
    expect(formatCodeBlock('json')(state)).toBeNull()
  })

  it('accepts language aliases', () => {
    const state = stateAt(docOf(codeBlock('<a><b/></a>', 'svg')), [0], 0)
    expect(formatCodeBlock('xml')(state)).not.toBeNull()
  })

  it('declines when the source does not parse', () => {
    const state = stateAt(docOf(codeBlock('{"a":}', 'json')), [0], 0)
    expect(formatCodeBlock('json')(state)).toBeNull()
  })

  it('declines when the source is already formatted', () => {
    const state = stateAt(docOf(codeBlock('{\n  "a": 1\n}', 'json')), [0], 0)
    expect(formatCodeBlock('json')(state)).toBeNull()
  })

  it('declines outside a code block', () => {
    const paragraph = schema.node('paragraph', undefined, Fragment.of(schema.text('{"a":1}')))
    const state = stateAt(docOf(paragraph), [0], 0)
    expect(formatCodeBlock('json')(state)).toBeNull()
  })

  it('declines on a doctype-with-entity payload rather than rewriting it', () => {
    const payload = '<!DOCTYPE d [<!ENTITY e "x">]><d>&e;</d>'
    const state = stateAt(docOf(codeBlock(payload, 'xml')), [0], 0)
    expect(formatCodeBlock('xml')(state)).toBeNull()
  })

  it('minifies a code block back to one line', () => {
    const state = stateAt(docOf(codeBlock('{\n  "a": 1\n}', 'json')), [0], 0)
    const next = run(state, minifyCodeBlock('json'))
    expect(firstBlockText(next)).toBe('{"a":1}')
  })
})
