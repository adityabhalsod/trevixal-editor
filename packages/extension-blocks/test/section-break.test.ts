// @vitest-environment happy-dom
import {
  type Command,
  type EditorNode,
  EditorState,
  Fragment,
  Schema,
  TextSelection,
  defaultMarks,
  defaultNodes,
  parseHTML,
  pos,
  serializeToHTML,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { insertSectionBreak } from '../src/commands'
import { blockNodes } from '../src/schema'

const schema = new Schema({ nodes: { ...defaultNodes(), ...blockNodes() }, marks: defaultMarks() })

function oneParagraph(): EditorState {
  const doc = schema.node(
    'doc',
    undefined,
    Fragment.from([schema.node('paragraph', undefined, [schema.text('one')])]),
  )
  return EditorState.create({ schema, doc, selection: new TextSelection(pos([0], 3)) })
}

function run(state: EditorState, command: Command): EditorNode {
  const tr = command(state)
  expect(tr).not.toBeNull()
  return state.apply(tr as NonNullable<typeof tr>).doc
}

describe('section breaks', () => {
  it('start a section with its own pages, and come back from the page', () => {
    const doc = run(
      oneParagraph(),
      insertSectionBreak({ orientation: 'landscape', columns: 2, margin: null }),
    )
    expect(doc.child(1).type.name).toBe('sectionBreak')
    const html = serializeToHTML(doc)
    expect(html).toContain('data-section-break=""')
    expect(html).toContain('data-orientation="landscape"')
    expect(html).toContain('data-columns="2"')
    expect(html).not.toContain('data-margin')
    const back = parseHTML(schema, html, document).child(1)
    expect(back.type.name).toBe('sectionBreak')
    expect(back.attrs).toEqual({ orientation: 'landscape', columns: 2, margin: null })
  })

  it('say what they change, for the reader on screen', () => {
    const doc = run(
      oneParagraph(),
      insertSectionBreak({ orientation: 'portrait', columns: null, margin: 15 }),
    )
    expect(serializeToHTML(doc)).toContain('data-label="Section break: portrait, 15 mm margins"')
  })
})
