// @vitest-environment happy-dom
import {
  type EditorNode,
  Fragment,
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  parseHTML,
  pos,
  serializeToHTML,
} from '@trevixal/core'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  advancedBlockNodes,
  conditionMet,
  enableAdvancedBlocks,
  insertMap,
  insertMarginNote,
  insertPoll,
  parseCoordinates,
  pollOptions,
  resolveConditionals,
  setTemplateVariables,
  tileOf,
  wrapInConditional,
} from '../src/advanced'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...advancedBlockNodes() },
  marks: defaultMarks(),
})

beforeEach(() => {
  document.body.innerHTML = ''
})

const p = (text: string): EditorNode =>
  schema.node('paragraph', undefined, text ? [schema.text(text)] : [])

function mount(...blocks: EditorNode[]) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return createEditor({
    schema,
    element: host,
    doc: schema.node('doc', undefined, Fragment.from(blocks)),
  })
}

describe('the blocks come back from their HTML', () => {
  it('keeps a note’s colour, a poll’s votes, a map’s place and a condition', () => {
    const doc = schema.node('doc', undefined, [
      schema.node('marginNote', { color: 'blue' }, [p('Aside')]),
      schema.node('poll', {
        question: 'When?',
        options: JSON.stringify([
          { label: 'Tue', votes: 2 },
          { label: 'Thu', votes: 1 },
        ]),
      }),
      schema.node('mapBlock', { lat: 51.5, lng: -0.12, zoom: 12, label: 'London' }),
      schema.node('conditional', { variable: 'plan', equals: 'pro' }, [p('Pro only')]),
    ])
    const html = serializeToHTML(doc)
    expect(html).toContain('<aside class="trevixal-margin-note" data-color="blue">')
    expect(html).toContain('2 · 67%')
    expect(html).toContain('https://tile.openstreetmap.org/12/')
    const back = parseHTML(schema, html, document)
    expect(back.content.children.map((node) => node.type.name)).toEqual([
      'marginNote',
      'poll',
      'mapBlock',
      'conditional',
    ])
    expect(back.child(0).attrs.color).toBe('blue')
    expect(pollOptions(back.child(1).attrs.options)).toEqual([
      { label: 'Tue', votes: 2 },
      { label: 'Thu', votes: 1 },
    ])
    expect(back.child(2).attrs).toMatchObject({ lat: 51.5, lng: -0.12, zoom: 12, label: 'London' })
    expect(back.child(3).attrs).toEqual({ variable: 'plan', equals: 'pro' })
  })

  it('finds the tile a place falls in', () => {
    expect(tileOf(0, 0, 1)).toEqual({ x: 1, y: 1 })
    expect(parseCoordinates('51.5074, -0.1278')).toEqual({ lat: 51.5074, lng: -0.1278 })
    expect(parseCoordinates('north')).toBeNull()
  })
})

describe('using the blocks', () => {
  it('counts a vote, and moves it when another choice is made', () => {
    const editor = mount(p(''))
    editor.exec(insertPoll('When?', ['Tue', 'Thu']))
    const dispose = enableAdvancedBlocks(editor)
    const vote = (index: number) =>
      editor.view?.dom.querySelector<HTMLButtonElement>(`[data-poll-option="${index}"]`)?.click()
    vote(0)
    expect(
      pollOptions(editor.state.doc.child(0).attrs.options).map((option) => option.votes),
    ).toEqual([1, 0])
    vote(1)
    expect(
      pollOptions(editor.state.doc.child(0).attrs.options).map((option) => option.votes),
    ).toEqual([0, 1])
    dispose()
    editor.destroy()
  })

  it('zooms a map from its buttons', () => {
    const editor = mount(p(''))
    editor.exec(insertMap({ lat: 48.85, lng: 2.35, zoom: 12, label: 'Paris' }))
    const dispose = enableAdvancedBlocks(editor)
    editor.view?.dom.querySelector<HTMLButtonElement>('[data-map-zoom="1"]')?.click()
    expect(editor.state.doc.child(0).attrs.zoom).toBe(13)
    dispose()
    editor.destroy()
  })

  it('puts a margin note after the block at the caret, the caret in it', () => {
    const editor = mount(p('Text'))
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 4))))
    editor.exec(insertMarginNote('pink'))
    expect(editor.state.doc.child(1).type.name).toBe('marginNote')
    expect(editor.state.doc.child(1).attrs.color).toBe('pink')
    expect(editor.state.selection.from.path).toEqual([1, 0])
    editor.destroy()
  })
})

describe('conditional content', () => {
  it('wraps the selected blocks, and marks whether they show', () => {
    const editor = mount(p('Everyone'), p('Pro only'))
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([1], 0))))
    editor.exec(wrapInConditional('plan', 'pro'))
    const dispose = enableAdvancedBlocks(editor)
    const block = () => editor.view?.dom.querySelector<HTMLElement>('.trevixal-conditional')
    expect(block()?.dataset.conditionMet).toBe('false')
    editor.exec(setTemplateVariables({ plan: 'pro' }))
    expect(editor.state.doc.attrs.variables).toBe('{"plan":"pro"}')
    expect(block()?.dataset.conditionMet).toBe('true')
    dispose()
    editor.destroy()
  })

  it('settles in a reader’s copy: shown ones unwrapped, the rest gone', () => {
    const conditional = (variable: string, equals: string | null, text: string) =>
      schema.node('conditional', { variable, equals }, [p(text)])
    const doc = schema.node('doc', { variables: '{"plan":"pro"}' }, [
      p('Everyone'),
      conditional('plan', 'pro', 'Pro'),
      conditional('plan', 'free', 'Free'),
      conditional('region', null, 'Region'),
    ])
    expect(conditionMet(doc.child(1), { plan: 'pro' })).toBe(true)
    const resolved = resolveConditionals(doc)
    expect(resolved.content.children.map((block) => block.textContent)).toEqual(['Everyone', 'Pro'])
    expect(resolved.child(1).type.name).toBe('paragraph')
  })
})
