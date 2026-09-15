// @vitest-environment happy-dom
import {
  type Attrs,
  type Editor,
  type EditorNode,
  Schema,
  SetNodeAttrsStep,
  defaultMarks,
  defaultNodes,
  nodeAtPath,
  pathOfElement,
} from '@trevixal/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type TrevixalEditorElement, defineTrevixalEditor } from '../src/element'

/**
 * The interactive counter block, as a custom element inside the document.
 *
 * A web component's idea of "a component" is another custom element, so this
 * is the adapter contract's counter in the idiom that actually belongs here:
 * the node view creates `<counter-block>`, and the element's clicks are
 * ordinary editor transactions.
 */

/** The component. Holds no state: the count is read from the document. */
class CounterBlock extends HTMLElement {
  onIncrement: (() => void) | undefined
  private readonly button = document.createElement('button')

  connectedCallback(): void {
    this.button.type = 'button'
    this.button.dataset.testid = 'counter'
    this.button.addEventListener('click', () => this.onIncrement?.())
    this.replaceChildren(this.button)
    this.draw()
  }

  get count(): number {
    return Number(this.getAttribute('count') ?? 0)
  }

  set count(value: number) {
    this.setAttribute('count', String(value))
    this.draw()
  }

  private draw(): void {
    this.button.textContent = `count: ${this.count}`
  }
}

defineTrevixalEditor()
if (!customElements.get('counter-block')) customElements.define('counter-block', CounterBlock)

/** Wire one `<counter-block>` to the node it is drawn from. */
function counterView(host: () => Editor | null) {
  return (node: EditorNode) => {
    const dom = document.createElement('counter-block') as CounterBlock
    // The component owns what is inside it; no caret goes in there.
    dom.contentEditable = 'false'
    dom.count = Number(node.attrs.count)
    dom.onIncrement = () => {
      const editor = host()
      const view = editor?.view
      if (!editor || !view) return
      // Resolved on click: the node may have moved since it was drawn.
      const path = pathOfElement(view.dom, view.renderer, dom)
      if (!path) return
      const current = nodeAtPath(editor.state.doc, path)
      if (!current) return
      const attrs: Attrs = { ...current.attrs, count: Number(current.attrs.count) + 1 }
      editor.dispatch(editor.state.tr.step(new SetNodeAttrsStep(path, attrs)))
    }
    return {
      dom,
      update(next: EditorNode) {
        dom.count = Number(next.attrs.count)
        return true
      },
    }
  }
}

let element: TrevixalEditorElement

beforeEach(() => {
  document.body.innerHTML = ''
  element = document.createElement('trevixal-editor') as TrevixalEditorElement
  // A node view is only useful for a type the schema has, so the element
  // takes a schema of its own too.
  element.schema = new Schema({
    nodes: {
      ...defaultNodes(),
      counter: {
        group: 'block',
        atom: true,
        attrs: { count: { default: 0 } },
        toHTML: (node) => ({ tag: 'div', attrs: { 'data-counter': String(node.attrs.count) } }),
      },
    },
    marks: defaultMarks(),
  })
  element.nodeViews = { counter: counterView(() => element.editor) }
  document.body.appendChild(element)
  element.setJSON({
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] },
      { type: 'counter', attrs: { count: 1 } },
    ],
  })
  // Loading the document is a transaction like any other, so without this the
  // first undo rewinds the *load* rather than whatever the test just did.
  element.editor?.clearHistory()
})

afterEach(() => {
  element.remove()
  document.body.innerHTML = ''
})

const button = () => element.querySelector<HTMLButtonElement>('[data-testid="counter"]')

describe('web component node views (interactive counter block)', () => {
  it('renders the custom element inside the editing surface', () => {
    expect(button()?.textContent).toBe('count: 1')
    expect(element.querySelector('.trevixal-content')?.contains(button())).toBe(true)
  })

  it('a click changes the document, and the document redraws the component', () => {
    button()?.click()
    expect(element.getJSON()?.content?.[1]).toEqual({ type: 'counter', attrs: { count: 2 } })
    expect(button()?.textContent).toBe('count: 2')
  })

  it('the change is an ordinary edit, so undo takes it back', () => {
    button()?.click()
    expect(button()?.textContent).toBe('count: 2')
    element.editor?.undo()
    expect(button()?.textContent).toBe('count: 1')
  })

  it('survives typing elsewhere without being torn down', () => {
    const before = button()
    element.editor?.commands.insertText('x')
    expect(button()).toBe(before)
    expect(element.editor?.getText()).toContain('xhi')
  })

  it('reports the change through the element event, like any other edit', () => {
    const seen: number[] = []
    element.addEventListener('trevixal-change', (event) => {
      const detail = (event as CustomEvent<{ json: { content?: { attrs?: Attrs }[] } }>).detail
      const counter = detail.json.content?.find((child) => child.attrs?.count !== undefined)
      if (counter) seen.push(Number(counter.attrs?.count))
    })
    button()?.click()
    expect(seen).toEqual([2])
  })
})
