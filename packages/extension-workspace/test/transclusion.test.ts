import {
  type DocJSON,
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  nodeFromJSON,
  parseHTML,
  pos,
  serializeToHTML,
} from '@trevixal/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceStore, createMemoryStorage } from '../src/store'
import {
  enableTransclusions,
  includableBlocks,
  inclusionContent,
  insertTransclusion,
  transclusionNodes,
} from '../src/transclusion'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...transclusionNodes() },
  marks: defaultMarks(),
})

const paragraph = (text: string, id?: string) => ({
  type: 'paragraph',
  ...(id ? { attrs: { id } } : {}),
  content: [{ type: 'text', text }],
})

const source: DocJSON = {
  type: 'doc',
  content: [paragraph('Intro'), paragraph('The part to reuse', 'reuse'), paragraph('Outro')],
} as DocJSON

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('what an inclusion shows', () => {
  it('is the whole document, or the one block it names', () => {
    expect(inclusionContent(source, null)).toHaveLength(3)
    expect(inclusionContent(source, 'reuse')).toEqual([paragraph('The part to reuse', 'reuse')])
    expect(inclusionContent(source, 'gone')).toEqual([])
    expect(includableBlocks(source)).toEqual([{ id: 'reuse', label: 'The part to reuse' }])
  })

  it('shows an inclusion inside its source only by its bar, so two cannot nest without end', () => {
    const nested = {
      type: 'doc',
      content: [
        {
          type: 'transclusion',
          attrs: { doc: 'b', title: 'B', content: '[{"type":"paragraph"}]' },
        },
      ],
    } as DocJSON
    const [inner] = inclusionContent(nested, null)
    expect((inner?.attrs as Record<string, unknown>).content).toBe('')
  })

  it('draws its blocks through the schema and comes back from HTML', () => {
    const node = schema.nodes.transclusion?.create({
      doc: 'a',
      block: 'reuse',
      title: 'Notes',
      content: JSON.stringify([paragraph('<b>not markup</b>')]),
    })
    const html = serializeToHTML(schema.node('doc', undefined, node ? [node] : []))
    expect(html).toContain('Included from Notes')
    expect(html).toContain('&lt;b&gt;not markup&lt;/b&gt;')
    const back = parseHTML(schema, html, document).child(0)
    expect(back.attrs).toMatchObject({ doc: 'a', block: 'reuse', title: 'Notes' })
    expect(back.attrs.content).toBe(node?.attrs.content)
  })
})

describe('keeping inclusions in step', () => {
  it('puts one in, and follows its source as the source is saved', async () => {
    const store = await WorkspaceStore.open(createMemoryStorage())
    const notes = await store.create({ title: 'Notes', doc: source })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createEditor({
      schema,
      element: host,
      doc: nodeFromJSON(schema, { type: 'doc', content: [paragraph('Here')] } as never),
    })
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 4))))
    editor.exec(insertTransclusion({ id: notes.id, title: notes.title, doc: notes.doc }, 'reuse'))
    const inclusion = () => editor.state.doc.child(1)
    expect(inclusion().type.name).toBe('transclusion')
    expect(editor.view?.dom.querySelector('.trevixal-transclusion__body')?.textContent).toBe(
      'The part to reuse',
    )

    const open = vi.fn()
    const transclusions = enableTransclusions(editor, { store, open })
    await store.save(notes.id, {
      type: 'doc',
      content: [paragraph('Intro'), paragraph('The part, reworded', 'reuse')],
    } as DocJSON)
    await vi.waitFor(() => {
      expect(editor.view?.dom.querySelector('.trevixal-transclusion__body')?.textContent).toBe(
        'The part, reworded',
      )
    })
    // Following the source is nobody's edit: nothing to undo.
    expect(editor.undo()).toBe(true)
    expect(editor.state.doc.childCount).toBe(1)

    editor.redo()
    editor.view?.dom
      .querySelector<HTMLButtonElement>('.trevixal-transclusion__open')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(open).toHaveBeenCalledWith(notes.id)
    transclusions.dispose()
    editor.destroy()
  })
})
