import { TextSelection, pos } from '@trevixal/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { type TrevixalEditorElement, defineTrevixalEditor } from '../src/element'

defineTrevixalEditor()

function create(html = ''): TrevixalEditorElement {
  const element = document.createElement('trevixal-editor') as TrevixalEditorElement
  element.innerHTML = html
  return element
}

function mount(html = ''): TrevixalEditorElement {
  const element = create(html)
  document.body.appendChild(element)
  return element
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('<trevixal-editor> content assignment', () => {
  it('keeps the selection when assigning the identical value', () => {
    const element = mount('<p>hello world</p><p>second</p>')
    const editor = element.editor
    if (!editor) throw new Error('no editor')
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([1], 3))))
    const before = editor.state.selection
    const same = element.value
    element.value = same
    expect(editor.state.selection.eq(before)).toBe(true)
  })

  it('still applies a genuinely new value', () => {
    const element = mount('<p>old</p>')
    element.value = '<p>new</p>'
    expect(element.value).toBe('<p>new</p>')
  })

  it('applies a value assigned before the element is connected', () => {
    const element = create()
    element.value = '<p>preset</p>'
    document.body.appendChild(element)
    expect(element.value).toBe('<p>preset</p>')
  })

  it('applies JSON assigned before the element is connected', () => {
    const element = create()
    element.setJSON({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'json' }] }],
    })
    document.body.appendChild(element)
    expect(element.value).toBe('<p>json</p>')
  })
})

describe('<trevixal-editor> connect/disconnect symmetry', () => {
  it('preserves the document when the element is moved in the DOM', () => {
    const element = mount('<p>keep me</p>')
    const target = document.createElement('section')
    document.body.appendChild(target)
    target.appendChild(element) // disconnect + reconnect
    expect(element.editor).not.toBeNull()
    expect(element.value).toBe('<p>keep me</p>')
  })

  it('re-creates a working editor after reconnection', () => {
    const element = mount('<p>a</p>')
    const first = element.editor
    element.remove()
    expect(first?.isDestroyed).toBe(true)
    document.body.appendChild(element)
    expect(element.editor).not.toBe(first)
    expect(element.editor?.isDestroyed).toBe(false)
    expect(element.querySelector('.trevixal-content')).not.toBeNull()
  })

  it('does not leak change events from a destroyed editor after disconnect', () => {
    const element = mount('<p>a</p>')
    const editor = element.editor
    let count = 0
    element.addEventListener('trevixal-change', () => count++)
    element.remove()
    expect(() => editor?.commands.insertText('x')).not.toThrow()
    expect(count).toBe(0)
  })
})

describe('<trevixal-editor> change events', () => {
  it('emits exactly one trevixal-change per document transaction', () => {
    const element = mount('<p></p>')
    let count = 0
    element.addEventListener('trevixal-change', () => count++)
    element.editor?.commands.insertText('abc')
    expect(count).toBe(1)
    element.editor?.commands.insertText('d')
    expect(count).toBe(2)
  })

  it('does not emit for a selection-only transaction', () => {
    const element = mount('<p>hello</p>')
    const editor = element.editor
    if (!editor) throw new Error('no editor')
    let count = 0
    element.addEventListener('trevixal-change', () => count++)
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 2))))
    expect(count).toBe(0)
  })
})

describe('<trevixal-editor> readonly attribute', () => {
  it('reflects the readonly attribute set before connection', () => {
    const element = create('<p>x</p>')
    element.setAttribute('readonly', '')
    document.body.appendChild(element)
    expect(element.editor?.isEditable).toBe(false)
  })

  it('propagates runtime readonly toggles to the view', () => {
    const element = mount('<p>x</p>')
    expect(element.editor?.isEditable).toBe(true)
    element.setAttribute('readonly', '')
    expect(element.editor?.isEditable).toBe(false)
    element.removeAttribute('readonly')
    expect(element.editor?.isEditable).toBe(true)
  })
})
