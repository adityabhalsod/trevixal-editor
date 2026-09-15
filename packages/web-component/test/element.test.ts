import { beforeEach, describe, expect, it } from 'vitest'
import { TrevixalEditorElement, defineTrevixalEditor } from '../src/element'

defineTrevixalEditor()

function mount(html = '', attrs: Record<string, string> = {}): TrevixalEditorElement {
  const element = document.createElement('trevixal-editor') as TrevixalEditorElement
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value)
  element.innerHTML = html
  document.body.appendChild(element)
  return element
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('<trevixal-editor>', () => {
  it('registers once, idempotently', () => {
    expect(customElements.get('trevixal-editor')).toBe(TrevixalEditorElement)
    expect(() => defineTrevixalEditor()).not.toThrow()
  })

  it('parses and sanitizes its initial HTML content', () => {
    const element = mount('<h2>Title</h2><p>body</p><script>alert(1)</script>')
    expect(element.value).toBe('<h2>Title</h2><p>body</p>')
    expect(element.querySelector('.trevixal-content')).not.toBeNull()
  })

  it('emits trevixal-change with json and html', () => {
    const element = mount()
    const events: { json: unknown; html: string }[] = []
    element.addEventListener('trevixal-change', (event) => {
      events.push((event as CustomEvent).detail)
    })
    element.editor?.commands.insertText('hey')
    expect(events[events.length - 1]?.html).toBe('<p>hey</p>')
  })

  it('honors and toggles the readonly attribute', () => {
    const element = mount('', { readonly: '' })
    expect(element.editor?.isEditable).toBe(false)
    element.removeAttribute('readonly')
    expect(element.editor?.isEditable).toBe(true)
  })

  it('value setter replaces the document', () => {
    const element = mount('<p>old</p>')
    element.value = '<p>new <strong>content</strong></p>'
    expect(element.value).toBe('<p>new <strong>content</strong></p>')
    expect(element.editor?.canUndo).toBe(true)
  })

  it('getJSON / setJSON round-trip', () => {
    const element = mount('<p>x</p>')
    const json = element.getJSON()
    element.value = '<p>y</p>'
    if (json) element.setJSON(json)
    expect(element.value).toBe('<p>x</p>')
  })

  it('disconnect destroys the editor', () => {
    const element = mount('<p>x</p>')
    const editor = element.editor
    element.remove()
    expect(editor?.isDestroyed).toBe(true)
    expect(element.editor).toBeNull()
  })
})

describe('content the parser delivers after the element upgrades', () => {
  /** Pretend the document is still being parsed, as it is during page load. */
  const whileParsing = (run: () => void): void => {
    const original = Object.getOwnPropertyDescriptor(Document.prototype, 'readyState')
    Object.defineProperty(document, 'readyState', { configurable: true, get: () => 'loading' })
    try {
      run()
    } finally {
      Object.defineProperty(document, 'readyState', original ?? { value: 'complete' })
    }
  }

  it('adopts children that arrive after it was connected', () => {
    // An element whose definition is already loaded upgrades the moment its
    // opening tag is seen, before the parser reaches the markup between the
    // tags. Server-rendered content used to be lost outright.
    const element = document.createElement('trevixal-editor') as TrevixalEditorElement
    whileParsing(() => {
      document.body.appendChild(element)
      expect(element.editor).not.toBeNull()
      // The parser now reaches the content and appends it.
      element.insertAdjacentHTML('beforeend', '<h2>From the server</h2><p>Second</p>')
      document.dispatchEvent(new Event('DOMContentLoaded'))
    })

    expect(element.editor?.getText()).toContain('From the server')
    expect(element.querySelector('.trevixal-content h2')?.textContent).toBe('From the server')
    // Adopted, not left lying beside the surface.
    expect(element.querySelector(':scope > h2')).toBeNull()
    element.remove()
  })

  it('does not let undo rewind past the document it started with', () => {
    const element = document.createElement('trevixal-editor') as TrevixalEditorElement
    whileParsing(() => {
      document.body.appendChild(element)
      element.insertAdjacentHTML('beforeend', '<p>Initial</p>')
      document.dispatchEvent(new Event('DOMContentLoaded'))
    })
    element.editor?.commands.insertText('x')
    element.editor?.undo()
    expect(element.editor?.getText()).toContain('Initial')
    element.remove()
  })

  it('leaves an element that already had its children alone', () => {
    const element = document.createElement('trevixal-editor') as TrevixalEditorElement
    element.innerHTML = '<p>Already here</p>'
    whileParsing(() => {
      document.body.appendChild(element)
      document.dispatchEvent(new Event('DOMContentLoaded'))
    })
    expect(element.editor?.getText()).toBe('Already here')
    element.remove()
  })
})
