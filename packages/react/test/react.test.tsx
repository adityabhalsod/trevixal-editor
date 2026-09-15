import { type Editor, type EditorOptions, Schema, defaultMarks, defaultNodes } from '@trevixal/core'
import { type ComponentType, type JSX, act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EditorProvider, useCurrentEditor } from '../src/context'
import { EditorContent, type NodeViewProps } from '../src/editor-content'
import { useEditor, useEditorSnapshot } from '../src/use-editor'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const schema = new Schema({
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

let container: HTMLElement
let root: Root
let captured: Editor | null = null
let toolbarRenders = 0
let bystanderRenders = 0

function Toolbar({ editor }: { editor: Editor }): JSX.Element {
  toolbarRenders++
  const snapshot = useEditorSnapshot(editor)
  return <span data-testid="block-type">{snapshot?.blockType ?? 'none'}</span>
}

function Bystander(): JSX.Element {
  bystanderRenders++
  return <span />
}

function App(props: {
  options?: Partial<EditorOptions>
  nodeViews?: Record<string, ComponentType<NodeViewProps>>
}): JSX.Element {
  const editor = useEditor({ schema, ...props.options })
  captured = editor
  return (
    <EditorProvider editor={editor}>
      <Toolbar editor={editor} />
      <Bystander />
      <EditorContent editor={editor} nodeViews={props.nodeViews} />
    </EditorProvider>
  )
}

beforeEach(() => {
  document.body.innerHTML = ''
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  captured = null
  toolbarRenders = 0
  bystanderRenders = 0
})

afterEach(() => {
  act(() => root.unmount())
})

describe('useEditor + EditorContent', () => {
  it('mounts the contenteditable surface', () => {
    act(() => {
      root.render(<App />)
    })
    const surface = container.querySelector('.trevixal-content')
    expect(surface).not.toBeNull()
    expect(surface?.getAttribute('role')).toBe('textbox')
    expect(captured?.view).not.toBeNull()
  })

  it('typing updates the DOM without re-rendering non-subscribers', () => {
    act(() => {
      root.render(<App />)
    })
    const bystanderBefore = bystanderRenders
    const surface = container.querySelector('.trevixal-content') as HTMLElement
    act(() => {
      captured?.commands.insertText('hello')
    })
    expect(surface.textContent).toBe('hello')
    expect(container.querySelector('.trevixal-content')).toBe(surface)
    expect(bystanderRenders).toBe(bystanderBefore) // no React churn for typing
  })

  it('snapshot subscribers re-render on state changes', () => {
    act(() => {
      root.render(<App />)
    })
    expect(container.querySelector('[data-testid="block-type"]')?.textContent).toBe('paragraph')
    act(() => {
      captured?.commands.setHeading(2)
    })
    expect(container.querySelector('[data-testid="block-type"]')?.textContent).toBe('heading')
    expect(toolbarRenders).toBeGreaterThan(1)
  })

  it('unmount destroys the view and the editor', () => {
    act(() => {
      root.render(<App />)
    })
    const editor = captured as Editor
    act(() => root.unmount())
    expect(editor.isDestroyed).toBe(true)
    expect(container.querySelector('.trevixal-content')).toBeNull()
  })

  it('provides the editor through context', () => {
    let fromContext: Editor | null = null
    function Probe(): null {
      fromContext = useCurrentEditor()
      return null
    }
    function WithProbe(): JSX.Element {
      const editor = useEditor({ schema })
      captured = editor
      return (
        <EditorProvider editor={editor}>
          <Probe />
        </EditorProvider>
      )
    }
    act(() => {
      root.render(<WithProbe />)
    })
    expect(fromContext).toBe(captured)
  })
})

describe('React node views (interactive counter block)', () => {
  function Counter({ node, updateAttrs }: NodeViewProps): JSX.Element {
    return (
      <button
        type="button"
        data-testid="counter"
        onClick={() => updateAttrs({ count: (node.attrs.count as number) + 1 })}
      >
        count: {String(node.attrs.count)}
      </button>
    )
  }

  const content = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] },
      { type: 'counter', attrs: { count: 1 } },
    ],
  }

  it('renders the component inside the document via a portal', () => {
    act(() => {
      root.render(<App options={{ content }} nodeViews={{ counter: Counter }} />)
    })
    const button = container.querySelector('[data-testid="counter"]')
    expect(button?.textContent).toBe('count: 1')
    // The portal target lives inside the editor surface.
    expect(container.querySelector('.trevixal-content')?.contains(button)).toBe(true)
  })

  it('clicking the component updates the document and re-renders it', () => {
    act(() => {
      root.render(<App options={{ content }} nodeViews={{ counter: Counter }} />)
    })
    const button = container.querySelector('[data-testid="counter"]') as HTMLButtonElement
    act(() => {
      button.click()
    })
    expect(captured?.getJSON().content?.[1]).toEqual({ type: 'counter', attrs: { count: 2 } })
    expect(container.querySelector('[data-testid="counter"]')?.textContent).toBe('count: 2')
  })

  it('widget survives typing elsewhere in the document', () => {
    act(() => {
      root.render(<App options={{ content }} nodeViews={{ counter: Counter }} />)
    })
    const button = container.querySelector('[data-testid="counter"]')
    act(() => {
      captured?.commands.insertText('x')
    })
    expect(container.querySelector('[data-testid="counter"]')).toBe(button)
    expect(captured?.getText()).toContain('xhi')
  })
})
