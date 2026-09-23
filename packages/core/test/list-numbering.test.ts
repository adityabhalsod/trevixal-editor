// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type { Command } from '../src/commands/commands'
import { listNumberingAt, setListNumbering, unwrapList } from '../src/commands/lists'
import { Fragment } from '../src/model/fragment'
import type { EditorNode } from '../src/model/node'
import {
  DEFAULT_LIST_NUMBERING,
  LIST_NUMBERING_SCHEMES,
  formatListCounter,
  listMarker,
  listNumberingScheme,
  storedNumberingsFor,
} from '../src/schema/list-numbering'
import { serializeToHTML } from '../src/serialize/html'
import { parseHTML } from '../src/serialize/parse-html'
import type { EditorState } from '../src/state/editor-state'
import { blockquote, cursor, doc, p, stateWith, testSchema } from './helpers'

function ul(attrs: Record<string, unknown> | undefined, ...items: EditorNode[]): EditorNode {
  return testSchema.node('bulletList', attrs, Fragment.from(items))
}

function ol(attrs: Record<string, unknown> | undefined, ...items: EditorNode[]): EditorNode {
  return testSchema.node('orderedList', attrs, Fragment.from(items))
}

function li(...blocks: EditorNode[]): EditorNode {
  return testSchema.node('listItem', undefined, Fragment.from(blocks))
}

function tasks(...items: EditorNode[]): EditorNode {
  return testSchema.node('taskList', undefined, Fragment.from(items))
}

function task(...blocks: EditorNode[]): EditorNode {
  return testSchema.node('taskItem', { checked: false }, Fragment.from(blocks))
}

function run(state: EditorState, command: Command): EditorState {
  const tr = command(state)
  expect(tr).not.toBeNull()
  return state.apply(tr as NonNullable<typeof tr>)
}

/** Three levels: a bullet list holding a bullet list holding a numbered one. */
function threeLevels(): EditorNode {
  return doc(
    ul(
      { listStyle: 'square' },
      li(p('one'), ul({ listStyle: 'circle' }, li(p('two'), ol({ start: 4 }, li(p('three')))))),
    ),
  )
}

describe('the scheme table', () => {
  it('stores the default as nothing, so one list never has two spellings', () => {
    expect(storedNumberingsFor('orderedList').has('default')).toBe(false)
    expect([...storedNumberingsFor('orderedList')]).toEqual([
      'parenthesis',
      'outline',
      'roman-outline',
    ])
    expect([...storedNumberingsFor('bulletList')]).toEqual(['symbols'])
    expect(storedNumberingsFor('taskList').size).toBe(0)
  })

  it('has one entry per id', () => {
    const ids = LIST_NUMBERING_SCHEMES.map((scheme) => scheme.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(listNumberingScheme('nonsense')).toBeNull()
  })
})

describe('formatListCounter', () => {
  it('writes letters in bijective base 26, as CSS does', () => {
    expect(
      [1, 2, 26, 27, 28, 52, 53, 702, 703].map((n) => formatListCounter(n, 'lower-alpha')),
    ).toEqual(['a', 'b', 'z', 'aa', 'ab', 'az', 'ba', 'zz', 'aaa'])
    expect(formatListCounter(28, 'upper-alpha')).toBe('AB')
  })

  it('writes roman numerals with the subtractive pairs', () => {
    expect(
      [1, 4, 9, 14, 40, 90, 400, 1994, 3999].map((n) => formatListCounter(n, 'lower-roman')),
    ).toEqual(['i', 'iv', 'ix', 'xiv', 'xl', 'xc', 'cd', 'mcmxciv', 'mmmcmxcix'])
    expect(formatListCounter(12, 'upper-roman')).toBe('XII')
  })

  it('falls back to decimal where CSS does', () => {
    expect(formatListCounter(0, 'lower-alpha')).toBe('0')
    expect(formatListCounter(-3, 'upper-roman')).toBe('-3')
    expect(formatListCounter(4000, 'lower-roman')).toBe('4000')
    expect(formatListCounter(7, 'decimal')).toBe('7')
  })
})

describe('listMarker', () => {
  const scheme = (id: string) => listNumberingScheme(id) ?? DEFAULT_LIST_NUMBERING

  it('numbers the default 1. a. i. and round again', () => {
    expect(listMarker(DEFAULT_LIST_NUMBERING, [3])).toBe('3.')
    expect(listMarker(DEFAULT_LIST_NUMBERING, [1, 2])).toBe('b.')
    expect(listMarker(DEFAULT_LIST_NUMBERING, [1, 1, 4])).toBe('iv.')
    expect(listMarker(DEFAULT_LIST_NUMBERING, [1, 1, 1, 5])).toBe('5.')
  })

  it('closes each number with a parenthesis', () => {
    expect(listMarker(scheme('parenthesis'), [1, 3])).toBe('c)')
  })

  it('carries every ancestor in an outline, in decimal', () => {
    expect(listMarker(scheme('outline'), [2])).toBe('2.')
    expect(listMarker(scheme('outline'), [2, 1, 3])).toBe('2.1.3.')
  })

  it('walks I. A. 1. a. i. in a roman outline', () => {
    const markers = [[2], [1, 3], [1, 1, 4], [1, 1, 1, 2], [1, 1, 1, 1, 3]].map((numbers) =>
      listMarker(scheme('roman-outline'), numbers),
    )
    expect(markers).toEqual(['II.', 'C.', '4.', 'b.', 'iii.'])
  })

  it('draws the glyph for a bulleted level, whatever the number', () => {
    expect(listMarker(scheme('symbols'), [9])).toBe('❖')
    expect(listMarker(scheme('symbols'), [1, 9])).toBe('➢')
    expect(listMarker(scheme('symbols'), [1, 1, 1, 9])).toBe('❖')
  })
})

describe('the numbering attribute in HTML', () => {
  it('writes a stored scheme as data-numbering, and reads it back', () => {
    const tree = doc(ol({ numbering: 'outline' }, li(p('a'))))
    const html = serializeToHTML(tree)
    expect(html).toBe('<ol data-numbering="outline"><li><p>a</p></li></ol>')
    expect(parseHTML(testSchema, html).eq(tree)).toBe(true)
  })

  it('leaves a list without a scheme exactly as it was', () => {
    expect(serializeToHTML(doc(ol({ start: 3 }, li(p('a')))))).toBe(
      '<ol start="3"><li><p>a</p></li></ol>',
    )
    // And the JSON: a default attr is not written, so no stored document changes.
    expect(doc(ol(undefined, li(p('a')))).toJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }],
            },
          ],
        },
      ],
    })
  })

  it('drops a scheme the list type cannot store', () => {
    // An ordered scheme on a bullet list, an unknown name, and the default by
    // name: none of them is a value this attribute holds.
    const parsed = parseHTML(
      testSchema,
      '<ul data-numbering="outline"><li><p>a</p></li></ul>' +
        '<ol data-numbering="bogus"><li><p>b</p></li></ol>' +
        '<ol data-numbering="default"><li><p>c</p></li></ol>',
    )
    for (const list of parsed.content.children) expect(list.attrs.numbering).toBeNull()
    expect(serializeToHTML(doc(ul({ numbering: 'outline' }, li(p('a')))))).toBe(
      '<ul><li><p>a</p></li></ul>',
    )
  })
})

describe('setListNumbering', () => {
  it('numbers the whole tree, from any level of it', () => {
    // The caret is in the innermost list; the scheme still lands on the outermost.
    const state = stateWith(threeLevels(), cursor([0, 0, 1, 0, 1, 0, 0], 1))
    const next = run(state, setListNumbering('outline'))

    const expected = doc(
      ol(
        { numbering: 'outline' },
        li(p('one'), ol(undefined, li(p('two'), ol({ start: 4 }, li(p('three')))))),
      ),
    )
    expect(next.doc.eq(expected)).toBe(true)
  })

  it('clears each list’s own marker style, so the scheme is what shows', () => {
    const state = stateWith(threeLevels(), cursor([0, 0, 0], 0))
    const next = run(state, setListNumbering('parenthesis'))
    const outer = next.doc.child(0)
    const middle = outer.child(0).child(1)
    expect(outer.attrs.listStyle).toBeNull()
    expect(middle.attrs.listStyle).toBeNull()
    expect(middle.attrs.numbering).toBeNull()
  })

  it('stores the default as no scheme at all', () => {
    const state = stateWith(doc(ol({ numbering: 'outline' }, li(p('a')))), cursor([0, 0, 0], 0))
    const next = run(state, setListNumbering('default'))
    expect(next.doc.eq(doc(ol(undefined, li(p('a')))))).toBe(true)
  })

  it('turns a numbered tree into bullets for a bulleted scheme', () => {
    const state = stateWith(
      doc(ol({ start: 3 }, li(p('a'), ol(undefined, li(p('b')))))),
      cursor([0, 0, 0], 0),
    )
    const next = run(state, setListNumbering('symbols'))
    expect(
      next.doc.eq(doc(ul({ numbering: 'symbols' }, li(p('a'), ul(undefined, li(p('b'))))))),
    ).toBe(true)
  })

  it('keeps the selection where it was', () => {
    const state = stateWith(threeLevels(), cursor([0, 0, 1, 0, 0], 2))
    const next = run(state, setListNumbering('roman-outline'))
    expect(next.selection.from).toEqual({ path: [0, 0, 1, 0, 0], offset: 2 })
  })

  it('makes a list first when the selection is not in one', () => {
    const state = stateWith(doc(p('a')), cursor([0], 1))
    const next = run(state, setListNumbering('parenthesis'))
    expect(next.doc.eq(doc(ol({ numbering: 'parenthesis' }, li(p('a')))))).toBe(true)
    expect(next.selection.from).toEqual({ path: [0, 0, 0], offset: 1 })
  })

  it('leaves a nested task list alone', () => {
    const state = stateWith(
      doc(ul(undefined, li(p('a'), tasks(task(p('t')))))),
      cursor([0, 0, 0], 0),
    )
    const next = run(state, setListNumbering('outline'))
    expect(next.doc.eq(doc(ol({ numbering: 'outline' }, li(p('a'), tasks(task(p('t')))))))).toBe(
      true,
    )
  })

  it('declines inside a task list, rather than renumbering the tree around it', () => {
    const state = stateWith(
      doc(ul(undefined, li(p('a'), tasks(task(p('t')))))),
      cursor([0, 0, 1, 0, 0], 0),
    )
    expect(setListNumbering('outline')(state)).toBeNull()
  })

  it('declines an unknown scheme, and a tree that already looks like this', () => {
    const state = stateWith(doc(ol({ numbering: 'outline' }, li(p('a')))), cursor([0, 0, 0], 0))
    expect(setListNumbering('bogus')(state)).toBeNull()
    expect(setListNumbering('outline')(state)).toBeNull()
  })

  it('treats a list in a quote as its own tree', () => {
    const state = stateWith(
      doc(ol(undefined, li(p('a'), blockquote(ol(undefined, li(p('q'))))))),
      cursor([0, 0, 1, 0, 0, 0], 0),
    )
    const next = run(state, setListNumbering('outline'))
    // The quoted list took the scheme; the list around the quote did not.
    expect(next.doc.child(0).attrs.numbering).toBeNull()
    expect(next.doc.child(0).child(0).child(1).child(0).attrs.numbering).toBe('outline')
  })
})

describe('unwrapList', () => {
  it('takes the list apart into paragraphs', () => {
    const state = stateWith(doc(ol(undefined, li(p('a')), li(p('b')))), cursor([0, 1, 0], 1))
    const next = run(state, unwrapList)
    expect(next.doc.eq(doc(p('a'), p('b')))).toBe(true)
  })

  it('declines outside a list', () => {
    expect(unwrapList(stateWith(doc(p('a')), cursor([0], 0)))).toBeNull()
  })
})

describe('listNumberingAt', () => {
  it('reports the scheme of the tree, from any level', () => {
    const tree = doc(ol({ numbering: 'outline' }, li(p('a'), ol(undefined, li(p('b'))))))
    expect(listNumberingAt(tree, [0, 0, 1, 0, 0])?.id).toBe('outline')
  })

  it('reports the default for a numbered list with none stored', () => {
    expect(listNumberingAt(doc(ol(undefined, li(p('a')))), [0, 0, 0])).toBe(DEFAULT_LIST_NUMBERING)
  })

  it('reports nothing for plain bullets, a task list, or no list', () => {
    expect(listNumberingAt(doc(ul(undefined, li(p('a')))), [0, 0, 0])).toBeNull()
    expect(listNumberingAt(doc(tasks(task(p('t')))), [0, 0, 0])).toBeNull()
    expect(listNumberingAt(doc(p('a')), [0])).toBeNull()
  })
})
