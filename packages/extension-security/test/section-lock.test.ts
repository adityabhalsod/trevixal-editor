// @vitest-environment happy-dom
import {
  type Editor,
  type EditorNode,
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  parseHTML,
  pos,
  serializeToHTML,
} from '@trevixal/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  enableSectionLocks,
  lockSection,
  lockedSectionNodes,
  lockedSections,
  unlockSection,
} from '../src'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...lockedSectionNodes() },
  marks: defaultMarks(),
})

const p = (text: string): EditorNode =>
  schema.node('paragraph', undefined, text ? [schema.text(text)] : [])

/** Intro, a locked section holding the terms, and an outro. */
function contract(): EditorNode {
  return schema.node('doc', undefined, [
    p('Intro'),
    schema.node('lockedSection', undefined, [p('Terms'), p('Signed')]),
    p('Outro'),
  ])
}

const editors: Editor[] = []

function mount(doc: EditorNode): Editor {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ schema, element: host, doc })
  editors.push(editor)
  return editor
}

function select(editor: Editor, from: ReturnType<typeof pos>, to = from): void {
  editor.dispatch(editor.state.tr.setSelection(new TextSelection(from, to)))
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy()
  document.body.innerHTML = ''
})

describe('the locked section', () => {
  it('is not editable on the page, and comes back from its HTML', () => {
    const html = serializeToHTML(contract())
    expect(html).toContain(
      '<section class="trevixal-locked-section" data-locked-section="" contenteditable="false">',
    )
    const back = parseHTML(schema, html, document)
    expect(lockedSections(back).map((section) => section.path)).toEqual([[1]])
  })

  it('wraps the selected blocks when locked', () => {
    const editor = mount(schema.node('doc', undefined, [p('One'), p('Two'), p('Three')]))
    select(editor, pos([0], 0), pos([1], 1))
    expect(editor.exec(lockSection)).toBe(true)
    const [section] = lockedSections(editor.state.doc)
    expect(section?.path).toEqual([0])
    expect(section?.node.textContent).toBe('OneTwo')
  })
})

describe('the guard', () => {
  it('refuses typing inside a locked section, and says so', () => {
    const editor = mount(contract())
    const onBlocked = vi.fn()
    enableSectionLocks(editor, { onBlocked })
    select(editor, pos([1, 0], 5))
    editor.commands.insertText('!')
    expect(editor.state.doc.eq(contract())).toBe(true)
    expect(onBlocked).toHaveBeenCalledTimes(1)
  })

  it('refuses a deletion that runs across a locked section', () => {
    const editor = mount(contract())
    enableSectionLocks(editor)
    select(editor, pos([0], 2), pos([2], 2))
    editor.commands.deleteSelection()
    expect(lockedSections(editor.state.doc)).toHaveLength(1)
    expect(editor.state.doc.textContent).toBe('IntroTermsSignedOutro')
  })

  it('lets the rest of the document be edited', () => {
    const editor = mount(contract())
    enableSectionLocks(editor)
    select(editor, pos([2], 5))
    editor.commands.insertText(' here')
    expect(editor.state.doc.child(2).textContent).toBe('Outro here')
  })

  it('lets a section be unlocked, and another document be loaded', () => {
    const editor = mount(contract())
    enableSectionLocks(editor)
    expect(editor.exec(unlockSection([1]))).toBe(true)
    expect(lockedSections(editor.state.doc)).toHaveLength(0)
    expect(editor.state.doc.content.children.map((block) => block.textContent)).toEqual([
      'Intro',
      'Terms',
      'Signed',
      'Outro',
    ])
    editor.setContent(contract())
    editor.setContent(schema.node('doc', undefined, [p('Another')]))
    expect(editor.state.doc.textContent).toBe('Another')
  })
})
