// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createEditor } from '../src/editor/editor'
import { Fragment } from '../src/model/fragment'
import { pos } from '../src/model/position'
import { ReplaceInlineStep } from '../src/state/steps/replace-inline'
import { domPointFromPosition, positionFromDOMPoint } from '../src/view/dom-point'
import { testSchema } from './helpers'

function mount() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ schema: testSchema, element: host })
  const view = editor.view
  if (!view) throw new Error('view expected')
  return { editor, view }
}

describe('decoration layers', () => {
  it('composes independent layers and clears them individually', () => {
    const { editor, view } = mount()
    editor.commands.insertText('hello world')
    view.setDecorationLayer('a', () => [{ from: 0, to: 5, className: 'layer-a' }])
    view.setDecorationLayer('b', () => [{ from: 6, to: 11, className: 'layer-b' }])
    expect(view.dom.querySelector('.layer-a')?.textContent).toBe('hello')
    expect(view.dom.querySelector('.layer-b')?.textContent).toBe('world')
    view.setDecorationLayer('a', null)
    expect(view.dom.querySelector('.layer-a')).toBeNull()
    expect(view.dom.querySelector('.layer-b')?.textContent).toBe('world')
    editor.destroy()
  })

  it('applies inline styles from decorations', () => {
    const { editor, view } = mount()
    editor.commands.insertText('color me')
    view.setDecorationLayer('sel', () => [
      { from: 0, to: 5, className: 'remote', style: 'background-color: rgb(255, 0, 0)' },
    ])
    const span = view.dom.querySelector('.remote') as HTMLElement
    expect(span.getAttribute('style')).toContain('255')
    editor.destroy()
  })

  it('renders zero-width widgets that positions skip over', () => {
    const { editor, view } = mount()
    editor.commands.insertText('abcdef')
    view.setDecorationLayer('cursor', () => [
      {
        from: 3,
        to: 3,
        className: 'remote-caret',
        widget: () => {
          const label = document.createElement('span')
          label.textContent = 'Ada'
          return label
        },
      },
    ])
    const widget = view.dom.querySelector('.remote-caret') as HTMLElement
    expect(widget.dataset.trevixalWidget).toBe('true')
    expect(widget.textContent).toBe('Ada')
    // The widget's label text must not shift DOM↔model position mapping.
    const point = domPointFromPosition(view.dom, view.renderer, pos([0], 5))
    expect(point).not.toBeNull()
    if (!point) throw new Error('unreachable')
    const roundTrip = positionFromDOMPoint(view.dom, view.renderer, point.node, point.offset)
    expect(roundTrip).toEqual(pos([0], 5))
    editor.destroy()
  })
})

describe('dispatch transforms and transaction events', () => {
  it('lets a transform rewrite the transaction before it applies', () => {
    const editor = createEditor({ schema: testSchema })
    const off = editor.addDispatchTransform((tr, state) => {
      if (!tr.docChanged) return null
      // Rewrite every edit into appending "X" instead.
      const end = state.doc.child(0).textContent.length
      return state.tr.step(
        new ReplaceInlineStep([0], end, end, Fragment.of(state.schema.text('X'))),
      )
    })
    editor.commands.insertText('typed')
    expect(editor.getText()).toBe('X')
    off()
    // Transform removed: edits land verbatim again (caret still at 0).
    editor.commands.insertText('!')
    expect(editor.getText()).toBe('!X')
    editor.destroy()
  })

  it('reports the applied (transformed) transaction to onTransaction', () => {
    const editor = createEditor({ schema: testSchema })
    const metas: boolean[] = []
    editor.addDispatchTransform((tr, state) => {
      if (!tr.docChanged) return null
      const end = state.doc.child(0).textContent.length
      return state.tr
        .setMeta('rewritten', true)
        .step(new ReplaceInlineStep([0], end, end, Fragment.of(state.schema.text('Y'))))
    })
    editor.onTransaction(({ transaction, before, state }) => {
      metas.push(Boolean(transaction.getMeta('rewritten')))
      expect(state).toBe(editor.state)
      expect(before).not.toBe(state)
    })
    editor.commands.insertText('typed')
    expect(metas).toEqual([true])
    expect(editor.getText()).toBe('Y')
    editor.destroy()
  })
})
