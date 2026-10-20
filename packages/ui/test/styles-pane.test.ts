// @vitest-environment happy-dom
import {
  type Editor,
  type EditorNode,
  Fragment,
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  documentStyle,
  pos,
} from '@trevixal/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { createNamedStyleSheet } from '../src/named-style-sheet'
import { createStylesPane } from '../src/styles-pane'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

let container: HTMLElement

beforeEach(() => {
  document.body.innerHTML = ''
  for (const sheet of document.head.querySelectorAll('style')) sheet.remove()
  container = document.createElement('div')
  document.body.appendChild(container)
})

const p = (text: string): EditorNode => schema.node('paragraph', undefined, [schema.text(text)])

function mount(...blocks: EditorNode[]): Editor {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({
    schema,
    element: host,
    doc: schema.node('doc', undefined, Fragment.from(blocks)),
  })
  editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 1))))
  return editor
}

function row(id: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(`.trevixal-styles__row[data-style-id="${id}"]`)
  if (!found) throw new Error(`no row for ${id}`)
  return found
}

async function submit(values: Record<string, string>): Promise<void> {
  const form = document.querySelector<HTMLFormElement>('.trevixal-dialog__form')
  if (!form) throw new Error('no dialog')
  for (const [name, value] of Object.entries(values)) {
    const control = form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)
    if (!control) throw new Error(`no field ${name}`)
    control.value = value
    control.dispatchEvent(new Event('change', { bubbles: true }))
  }
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await Promise.resolve()
  await Promise.resolve()
}

describe('the named style sheet', () => {
  it('draws the document’s styles for its own surface only, and follows every change', () => {
    const editor = mount(p('Body'))
    const sheet = createNamedStyleSheet(editor)
    const scope = editor.view?.dom.getAttribute('data-trevixal-style-scope')
    const style = document.head.querySelector(`style[data-trevixal-named-styles="${scope}"]`)
    expect(style?.textContent).toBe('')
    editor.commands.setStyle({ id: 'normal', props: { fontSize: 12 } })
    expect(style?.textContent).toBe(
      `.trevixal-content[data-trevixal-style-scope="${scope}"] { font-size: 12pt }`,
    )
    sheet.destroy()
    expect(style?.isConnected).toBe(false)
    expect(editor.view?.dom.hasAttribute('data-trevixal-style-scope')).toBe(false)
    editor.destroy()
  })
})

describe('the Styles pane', () => {
  it('lists every style, and marks the ones at the caret', () => {
    const editor = mount(p('Body'))
    const pane = createStylesPane(editor, { container })
    const names = [...container.querySelectorAll('.trevixal-styles__apply')].map(
      (button) => button.textContent,
    )
    expect(names).toEqual([
      'Normal',
      'Title',
      'Subtitle',
      'Heading 1',
      'Heading 2',
      'Heading 3',
      'Heading 4',
      'Heading 5',
      'Heading 6',
      'Emphasis',
      'Strong',
      'Subtle emphasis',
    ])
    const pressed = () =>
      [...container.querySelectorAll('[aria-pressed="true"]')].map((button) => button.textContent)
    expect(pressed()).toEqual(['Normal'])
    row('heading2').querySelector<HTMLButtonElement>('.trevixal-styles__apply')?.click()
    expect(editor.state.doc.child(0).type.name).toBe('heading')
    expect(pressed()).toEqual(['Heading 2'])
    pane.destroy()
    expect(container.querySelector('.trevixal-styles')).toBeNull()
    editor.destroy()
  })

  it('changes a style from Modify…, and everything in it follows', async () => {
    const editor = mount(p('Body'))
    const pane = createStylesPane(editor, { container })
    row('normal').querySelector<HTMLButtonElement>('.trevixal-styles__action')?.click()
    // A built-in style keeps its name, so there is no name to edit.
    expect(document.querySelector('.trevixal-dialog [name="name"]')).toBeNull()
    await submit({ fontFamily: 'Georgia', fontSize: '12', bold: 'on', spaceAfter: '6' })
    expect(documentStyle(editor.state.doc, 'normal')?.props).toEqual({
      fontFamily: 'Georgia',
      fontSize: 12,
      bold: true,
      spaceAfter: 6,
    })
    // The pane draws the name in its new look.
    expect(row('normal').querySelector('.trevixal-styles__apply')?.getAttribute('style')).toBe(
      'font-family: Georgia; font-weight: 700',
    )
    pane.destroy()
    editor.destroy()
  })

  it('takes a font name of several words as it is typed, unquoted', async () => {
    const editor = mount(p('Body'))
    const pane = createStylesPane(editor, { container })
    row('normal').querySelector<HTMLButtonElement>('.trevixal-styles__action')?.click()
    await submit({ fontFamily: 'Times New Roman, serif' })
    expect(documentStyle(editor.state.doc, 'normal')?.props.fontFamily).toBe(
      '"Times New Roman", serif',
    )
    pane.destroy()
    editor.destroy()
  })

  it('makes a style of the writer’s own, applies it, and deletes it', async () => {
    const editor = mount(p('Memo'))
    const pane = createStylesPane(editor, { container })
    container.querySelector<HTMLButtonElement>('.trevixal-styles__new')?.click()
    await submit({ name: 'Memo text', kind: 'paragraph', italic: 'on' })
    expect(editor.state.doc.child(0).attrs.paragraphStyle).toBe('memo-text')
    const memo = row('memo-text')
    expect(memo.querySelector('[aria-pressed]')?.getAttribute('aria-pressed')).toBe('true')
    memo.querySelector<HTMLButtonElement>('[aria-label="Delete Memo text"]')?.click()
    expect(container.querySelector('[data-style-id="memo-text"]')).toBeNull()
    expect(editor.state.doc.child(0).attrs.paragraphStyle).toBeNull()
    pane.destroy()
    editor.destroy()
  })
})
