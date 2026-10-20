import {
  type DocJSON,
  type EditorNode,
  Schema,
  type SuggestionListState,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  insertText,
  nodeFromJSON,
  pos,
} from '@trevixal/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type DocumentMeta, WorkspaceStore, createMemoryStorage } from '../src/store'
import {
  backlinks,
  createBacklinksPanel,
  linkedDocuments,
  wikiLinkNodes,
  wikiLinks,
} from '../src/wiki'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...wikiLinkNodes() },
  marks: defaultMarks(),
})

function paragraph(...content: unknown[]): DocJSON {
  return { type: 'doc', content: [{ type: 'paragraph', content }] } as DocJSON
}

function linkTo(doc: string, title: string) {
  return { type: 'wikiLink', attrs: { doc, title } }
}

let clock = 1_000
let counter = 0

async function openStore(): Promise<WorkspaceStore> {
  return WorkspaceStore.open(createMemoryStorage(), {
    now: () => ++clock,
    idFactory: () => `doc-${++counter}`,
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
  clock = 1_000
  counter = 0
})

describe('wiki link node', () => {
  it('renders the linked title and reads it back from HTML', () => {
    const node = nodeFromJSON(schema, linkTo('doc-7', 'Road map'))
    const spec = schema.nodes.wikiLink?.spec.toHTML?.(node as EditorNode)

    expect(spec).toMatchObject({
      tag: 'span',
      attrs: { class: 'trevixal-wikilink', 'data-doc': 'doc-7' },
      text: 'Road map',
    })
    const host = document.createElement('div')
    host.innerHTML = '<span class="trevixal-wikilink" data-doc="doc-7"> Road map </span>'
    const rule = schema.nodes.wikiLink?.spec.parseHTML?.[0]
    expect(rule?.getAttrs?.(host.firstElementChild as HTMLElement)).toEqual({
      doc: 'doc-7',
      title: 'Road map',
    })
  })
})

describe('backlinks', () => {
  it('finds each document linked from a body, however deep', () => {
    const doc: DocJSON = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [linkTo('a', 'A')] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [linkTo('b', 'B')] }] },
          ],
        },
      ],
    } as DocJSON

    expect([...linkedDocuments(doc)]).toEqual(['a', 'b'])
  })

  it('lists the documents that link to one, latest change first', async () => {
    const store = await openStore()
    const target = await store.create({
      doc: paragraph({ type: 'text', text: 'Target' }),
      title: 'Target',
    })
    const first = await store.create({
      doc: paragraph(linkTo(target.id, 'Target')),
      title: 'First',
    })
    await store.create({ doc: paragraph({ type: 'text', text: 'none' }), title: 'Unlinked' })
    const second = await store.create({
      doc: paragraph(linkTo(target.id, 'Target')),
      title: 'Second',
    })

    expect((await backlinks(store, target.id)).map((meta) => meta.id)).toEqual([
      second.id,
      first.id,
    ])
  })

  it('keeps the panel current as documents are saved', async () => {
    const store = await openStore()
    const target = await store.create({ doc: paragraph(), title: 'Target' })
    const other = await store.create({ doc: paragraph(), title: 'Other' })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const open = vi.fn()
    const panel = createBacklinksPanel({ container, store, currentId: () => target.id, open })
    await panel.refresh()

    expect(container.querySelector('.trevixal-backlinks__empty')?.hasAttribute('hidden')).toBe(
      false,
    )
    await store.save(other.id, paragraph(linkTo(target.id, 'Target')))
    await vi.waitFor(() => {
      expect(container.querySelector('.trevixal-backlinks__item')?.textContent).toBe('Other')
    })
    container.querySelector<HTMLButtonElement>('.trevixal-backlinks__item')?.click()
    expect(open).toHaveBeenCalledWith(other.id)
    panel.destroy()
    expect(container.querySelector('.trevixal-backlinks')).toBeNull()
  })
})

describe('typing [[', () => {
  function mount(doc?: DocJSON) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    return createEditor({
      schema,
      element: host,
      ...(doc ? { doc: nodeFromJSON(schema, doc) } : {}),
    })
  }

  it('offers the other documents and puts in a link to the one picked', async () => {
    const store = await openStore()
    const here = await store.create({ doc: paragraph(), title: 'Here' })
    const plan = await store.create({ doc: paragraph(), title: 'Launch plan' })
    await store.create({ doc: paragraph(), title: 'Budget' })
    const editor = mount()
    let popup: SuggestionListState<DocumentMeta> | null = null
    const wiki = wikiLinks(editor, {
      store,
      open: () => {},
      onState: (state) => {
        popup = state
      },
      currentId: () => here.id,
    })
    editor.exec(insertText('See [[lau'))

    await vi.waitFor(() => {
      expect(popup?.items.map((meta) => meta.title)).toEqual(['Launch plan'])
    })
    wiki.select(0)
    const block = editor.state.doc.child(0)
    expect(block.child(1).type.name).toBe('wikiLink')
    expect(block.child(1).attrs).toEqual({ doc: plan.id, title: 'Launch plan' })
    // The query is gone; a space follows the link, and the caret the space.
    expect(block.childCount).toBe(3)
    expect(block.textContent).toBe('See  ')
    expect(editor.state.selection.from.offset).toBe(6)
    wiki.dispose()
    editor.destroy()
  })

  it('opens a linked document on click', async () => {
    const store = await openStore()
    const open = vi.fn()
    const editor = mount(paragraph({ type: 'text', text: 'Go ' }, linkTo('doc-9', 'Notes')))
    const wiki = wikiLinks(editor, { store, open, onState: () => {} })
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 0))))
    editor.view?.dom
      .querySelector('.trevixal-wikilink')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(open).toHaveBeenCalledWith('doc-9')
    wiki.dispose()
    editor.destroy()
  })
})
