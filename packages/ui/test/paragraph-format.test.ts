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
  dropCapOf,
  paragraphBorderOf,
  pos,
  tabStopsOf,
} from '@trevixal/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { printableHTML } from '../src/documents'
import { createEditorUI } from '../src/editor-ui'
import { type Menu, type MenuItem, defaultMenus } from '../src/menubar'
import { parseTabStopLines, tabStopLines } from '../src/paragraph-dialogs'
import { createTabLayout } from '../src/tab-layout'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

let container: HTMLElement

beforeEach(() => {
  document.body.innerHTML = ''
  container = document.createElement('div')
  document.body.appendChild(container)
})

const p = (text: string): EditorNode => schema.node('paragraph', undefined, [schema.text(text)])

function mount(...blocks: EditorNode[]): Editor {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return createEditor({
    schema,
    element: host,
    doc: schema.node('doc', undefined, Fragment.from(blocks)),
  })
}

function item(menus: readonly Menu[], name: string): MenuItem {
  const walk = (items: readonly MenuItem[]): MenuItem | undefined => {
    for (const entry of items) {
      if (entry.name === name) return entry
      const found = entry.items ? walk(entry.items) : undefined
      if (found) return found
    }
    return undefined
  }
  for (const menu of menus) {
    const found = walk(menu.items)
    if (found) return found
  }
  throw new Error(`no menu item ${name}`)
}

async function submit(values: Record<string, string>): Promise<void> {
  const form = document.querySelector<HTMLFormElement>('.trevixal-dialog__form')
  expect(form).not.toBeNull()
  for (const [name, value] of Object.entries(values)) {
    const control = form?.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)
    if (!control) throw new Error(`no field ${name}`)
    control.value = value
    control.dispatchEvent(new Event('change', { bubbles: true }))
  }
  form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await Promise.resolve()
  await Promise.resolve()
}

describe('the Format menu’s page settings', () => {
  it('turn hyphenation on and widow control off, and tick each while it is so', () => {
    const editor = mount(p('x'))
    const menus = defaultMenus()
    const hyphenation = item(menus, 'hyphenation')
    const widows = item(menus, 'widowControl')
    expect(hyphenation.isActive?.(editor.getSnapshot())).toBe(false)
    expect(widows.isActive?.(editor.getSnapshot())).toBe(true)
    hyphenation.run?.(editor)
    widows.run?.(editor)
    expect(editor.state.doc.attrs).toMatchObject({ hyphenation: true, widowControl: false })
    expect(hyphenation.isActive?.(editor.getSnapshot())).toBe(true)
    expect(widows.isActive?.(editor.getSnapshot())).toBe(false)
    editor.destroy()
  })
})

describe('drop caps from the Format menu', () => {
  it('drop, hang in the margin and take away, keeping the lines chosen', async () => {
    const editor = mount(p('Once upon a time'))
    const ui = createEditorUI(editor, { container })
    item(ui.menus, 'dropCap-drop').run?.(editor)
    expect(dropCapOf(editor.state.doc.child(0).attrs)).toEqual({ kind: 'drop', lines: 3 })
    expect(item(ui.menus, 'dropCap-drop').isActive?.(editor.getSnapshot())).toBe(true)
    item(ui.menus, 'dropCapOptions').run?.(editor)
    await submit({ kind: 'margin', lines: '4' })
    expect(dropCapOf(editor.state.doc.child(0).attrs)).toEqual({ kind: 'margin', lines: 4 })
    item(ui.menus, 'dropCap-drop').run?.(editor)
    expect(dropCapOf(editor.state.doc.child(0).attrs)).toEqual({ kind: 'drop', lines: 4 })
    item(ui.menus, 'dropCap-none').run?.(editor)
    expect(dropCapOf(editor.state.doc.child(0).attrs)).toBeNull()
    ui.destroy()
    editor.destroy()
  })
})

describe('Borders and shading…', () => {
  it('box the paragraph and fill it, then take both off again', async () => {
    const editor = mount(p('Boxed'))
    const ui = createEditorUI(editor, { container })
    item(ui.menus, 'bordersAndShading').run?.(editor)
    await submit({
      sides: 'box',
      style: 'double',
      width: '3',
      lineColor: 'custom',
      color: '#336699',
      fill: 'custom',
      shading: '#fff3c4',
    })
    const attrs = editor.state.doc.child(0).attrs
    expect(paragraphBorderOf(attrs)).toEqual({
      sides: ['top', 'right', 'bottom', 'left'],
      style: 'double',
      width: 3,
      color: '#336699',
    })
    expect(attrs.shading).toBe('#fff3c4')

    // Opened again, it starts from what the paragraph has.
    item(ui.menus, 'bordersAndShading').run?.(editor)
    const sides = document.querySelector<HTMLSelectElement>('.trevixal-dialog [name="sides"]')
    expect(sides?.value).toBe('box')
    await submit({ sides: 'none', fill: 'none' })
    expect(paragraphBorderOf(editor.state.doc.child(0).attrs)).toBeNull()
    expect(editor.state.doc.child(0).attrs.shading).toBeNull()
    ui.destroy()
    editor.destroy()
  })
})

describe('Format ▸ Text columns', () => {
  it('sets the document in one to three columns, and draws the line only with more than one', () => {
    const editor = mount(p('x'))
    const menus = defaultMenus()
    const rule = item(menus, 'textColumnsRule')
    expect(item(menus, 'textColumns-1').isActive?.(editor.getSnapshot())).toBe(true)
    expect(rule.isEnabled?.(editor.getSnapshot())).toBe(false)
    item(menus, 'textColumns-2').run?.(editor)
    expect(editor.state.doc.attrs.columns).toBe(2)
    expect(item(menus, 'textColumns-2').isActive?.(editor.getSnapshot())).toBe(true)
    expect(rule.isEnabled?.(editor.getSnapshot())).toBe(true)
    rule.run?.(editor)
    expect(rule.isActive?.(editor.getSnapshot())).toBe(true)
    expect(editor.view?.dom.getAttribute('data-columns')).toBe('2')
    expect(editor.view?.dom.hasAttribute('data-column-rule')).toBe(true)
    editor.destroy()
  })
})

describe('Format ▸ Tabs…', () => {
  it('lists stops a line each, in centimetres, and reads any unit back', () => {
    expect(
      tabStopLines([
        { position: 72, align: 'left', leader: 'none' },
        { position: 425.2, align: 'right', leader: 'dot' },
        { position: 113.39, align: 'center', leader: 'none' },
      ]),
    ).toBe('2.54 cm left\n15 cm right dot\n4 cm centre')
    expect(
      parseTabStopLines(
        '1 in center\n15cm right dot\nnothing\n36 pt decimal hyphen\n2,5\n4 cm centre',
      ),
    ).toEqual([
      { position: 72, align: 'center', leader: 'none' },
      { position: 425.2, align: 'right', leader: 'dot' },
      { position: 36, align: 'decimal', leader: 'hyphen' },
      { position: 70.87, align: 'left', leader: 'none' },
      { position: 113.39, align: 'center', leader: 'none' },
    ])
  })

  it('sets the paragraph’s stops, and clears them when the box is emptied', async () => {
    const editor = mount(p('Results'))
    const ui = createEditorUI(editor, { container })
    item(ui.menus, 'tabStops').run?.(editor)
    await submit({ stops: '15 cm right dot' })
    expect(tabStopsOf(editor.state.doc.child(0).attrs)).toEqual([
      { position: 425.2, align: 'right', leader: 'dot' },
    ])
    item(ui.menus, 'tabStops').run?.(editor)
    const stops = document.querySelector<HTMLTextAreaElement>('.trevixal-dialog [name="stops"]')
    expect(stops?.value).toBe('15 cm right dot')
    await submit({ stops: '' })
    expect(tabStopsOf(editor.state.doc.child(0).attrs)).toEqual([])
    ui.destroy()
    editor.destroy()
  })

  it('puts a tab anywhere from the Insert menu, wrapped for the layout to size', () => {
    const editor = mount(p('Results'))
    const tabs = createTabLayout(editor)
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 7))))
    item(defaultMenus(), 'insertTab').run?.(editor)
    expect(editor.state.doc.child(0).textContent).toBe('Results\t')
    const span = editor.view?.dom.querySelector('.trevixal-tab')
    expect(span?.textContent).toBe('\t')
    tabs.destroy()
    expect(editor.view?.dom.querySelector('.trevixal-tab')).toBeNull()
    editor.destroy()
  })

  it('prints a document with tabs at the width they are measured at, and leaves any other to the page', () => {
    const tabbed = mount(p('Results\t12'))
    expect(printableHTML(tabbed)).toContain('width: 170mm')
    tabbed.destroy()
    const plain = mount(p('Results'))
    expect(printableHTML(plain)).not.toContain('170mm')
    plain.destroy()
  })
})
