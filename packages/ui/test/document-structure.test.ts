// @vitest-environment happy-dom
import {
  type Command,
  type Editor,
  type EditorNode,
  Fragment,
  NodeSelection,
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  pos,
} from '@trevixal/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBlockDragHandle } from '../src/block-drag-handle'
import { createEditorUI } from '../src/editor-ui'
import { createLineNumbers, measureLines } from '../src/line-numbers'
import { type Menu, type MenuItem, defaultMenus } from '../src/menubar'
import { createReferenceNavigation, referenceTarget } from '../src/reference-navigation'
import { createSourceMode } from '../src/source-mode'
import type { BlockCommands } from '../src/toolbar'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

let container: HTMLElement

beforeEach(() => {
  document.body.innerHTML = ''
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  vi.restoreAllMocks()
})

const p = (text: string, attrs?: Record<string, unknown>): EditorNode =>
  schema.node('paragraph', attrs, text ? [schema.text(text)] : [])
const h = (level: number, text: string): EditorNode =>
  schema.node('heading', { level }, [schema.text(text)])

function mount(...blocks: EditorNode[]): Editor {
  const host = document.createElement('div')
  host.style.position = 'relative'
  document.body.appendChild(host)
  const doc = blocks.length > 0 ? schema.node('doc', undefined, Fragment.from(blocks)) : undefined
  return createEditor({ schema, element: host, ...(doc ? { doc } : {}) })
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

describe('the Format menu’s document settings', () => {
  it('numbers the headings with each scheme, labelled by its first three levels', () => {
    const editor = mount(h(1, 'One'))
    const menus = defaultMenus()
    const labels = item(menus, 'headingNumbering').items?.map((entry) => entry.label)
    expect(labels).toEqual(['None', '1. 1.1. 1.1.1.', '1. a. i.', '1) a) i)', 'I. A. 1.'])
    const outline = item(menus, 'headingNumbering-outline')
    outline.run?.(editor)
    expect(editor.state.doc.attrs.headingNumbering).toBe('outline')
    expect(outline.isActive?.(editor.getSnapshot())).toBe(true)
    item(menus, 'headingNumbering-none').run?.(editor)
    expect(editor.state.doc.attrs.headingNumbering).toBeNull()
    editor.destroy()
  })

  it('sets a paragraph’s direction, storing the document’s own as nothing', () => {
    const editor = mount(p('x'))
    const menus = defaultMenus()
    item(menus, 'textDirection-rtl').run?.(editor)
    expect(editor.state.doc.child(0).attrs.dir).toBe('rtl')
    expect(item(menus, 'textDirection-rtl').isActive?.(editor.getSnapshot())).toBe(true)
    item(menus, 'documentRightToLeft').run?.(editor)
    expect(editor.state.doc.attrs.direction).toBe('rtl')
    // In a right-to-left document, right to left is simply following it.
    item(menus, 'textDirection-rtl').run?.(editor)
    expect(editor.state.doc.child(0).attrs.dir).toBeNull()
    item(menus, 'textDirection-ltr').run?.(editor)
    expect(editor.state.doc.child(0).attrs.dir).toBe('ltr')
    expect(item(menus, 'textDirection-ltr').isActive?.(editor.getSnapshot())).toBe(true)
    editor.destroy()
  })

  it('turns line numbers on and off, and ticks them', () => {
    const editor = mount(p('x'))
    const lines = item(defaultMenus(), 'lineNumbers')
    lines.run?.(editor)
    expect(editor.state.doc.attrs.lineNumbers).toBe(true)
    expect(lines.isActive?.(editor.getSnapshot())).toBe(true)
    lines.run?.(editor)
    expect(editor.state.doc.attrs.lineNumbers).toBe(false)
    editor.destroy()
  })

  it('mirrors the chrome while the document runs right to left', () => {
    const editor = mount(p('x'))
    const ui = createEditorUI(editor, { container })
    expect(ui.element.hasAttribute('dir')).toBe(false)
    editor.commands.setDocumentDirection('rtl')
    expect(ui.element.getAttribute('dir')).toBe('rtl')
    editor.commands.setDocumentDirection('ltr')
    expect(ui.element.hasAttribute('dir')).toBe(false)
    ui.destroy()
    editor.destroy()
  })
})

describe('the Insert menu’s reference entries', () => {
  async function submit(values: Record<string, string>): Promise<void> {
    const form = document.querySelector<HTMLFormElement>('.trevixal-dialog__form')
    expect(form).not.toBeNull()
    for (const [name, value] of Object.entries(values)) {
      const control = form?.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)
      if (control) control.value = value
    }
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await Promise.resolve()
    await Promise.resolve()
  }

  it('asks for a caption’s label and text, and hands both to the command', async () => {
    const editor = mount(p('x'))
    const insertCaption = vi.fn((): Command => () => null)
    const ui = createEditorUI(editor, { container, blockCommands: { insertCaption } })
    item(ui.menus, 'insertCaption').run?.(editor)
    await submit({ kind: 'table', text: 'Sales' })
    expect(insertCaption).toHaveBeenCalledWith('table', 'Table', 'Sales')
    ui.destroy()
    editor.destroy()
  })

  it('captions the block selected when the dialog opened, wherever the browser caret went', async () => {
    const editor = mount(p('x'), schema.node('horizontalRule'))
    editor.dispatch(editor.state.tr.setSelection(new NodeSelection([1])))
    let captioned: unknown = null
    const insertCaption = vi.fn(
      (): Command => (state) => {
        captioned = state.selection
        return null
      },
    )
    const ui = createEditorUI(editor, { container, blockCommands: { insertCaption } })
    item(ui.menus, 'insertCaption').run?.(editor)
    // The browser cannot show a selected rule or image, so its caret is
    // wherever it was last: here, in the paragraph's text.
    const text = editor.view?.dom.querySelector('p')?.firstChild
    if (text) document.getSelection()?.setBaseAndExtent(text, 0, text, 0)
    await submit({ kind: 'figure', text: '' })
    expect(captioned).toBeInstanceOf(NodeSelection)
    expect((captioned as NodeSelection).path).toEqual([1])
    ui.destroy()
    editor.destroy()
  })

  it('lists what a cross-reference can point at, and inserts the chosen one', async () => {
    const editor = mount(p('x'))
    const target = {
      kind: 'figure',
      id: 'fig-1',
      path: [1, 0],
      label: 'Figure 1',
      number: '1',
      text: 'Cat',
      full: 'Figure 1: Cat',
    }
    const insertCrossReference = vi.fn((): Command => () => null)
    const blocks: BlockCommands = { referenceTargets: () => [target], insertCrossReference }
    const ui = createEditorUI(editor, { container, blockCommands: blocks })
    item(ui.menus, 'insertCrossReference').run?.(editor)
    const option = document.querySelector<HTMLSelectElement>('[name="target"] option')
    expect(option?.textContent).toBe('Figure 1: Cat')
    await submit({ target: '0', format: 'number' })
    expect(insertCrossReference).toHaveBeenCalledWith(target, 'number')
    ui.destroy()
    editor.destroy()
  })

  it('files the selected words under themselves, or under the entry given', async () => {
    const editor = mount(p('red apples'))
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 4), pos([0], 10))))
    const markIndexEntry = vi.fn((): Command => () => null)
    const ui = createEditorUI(editor, { container, blockCommands: { markIndexEntry } })
    item(ui.menus, 'markIndexEntry').run?.(editor)
    await submit({ sub: 'red' })
    expect(markIndexEntry).toHaveBeenCalledWith('apples', 'red')
    ui.destroy()
    editor.destroy()
  })
})

describe('the block menu', () => {
  /** Hover the first block and click its grip without dragging. */
  function openMenu(editor: Editor): HTMLElement {
    const handle = createBlockDragHandle(editor, {})
    const surface = editor.view?.dom as HTMLElement
    const block = surface.children[0] as HTMLElement
    vi.spyOn(block, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 20))
    surface.dispatchEvent(new PointerEvent('pointermove', { clientY: 10, bubbles: true }))
    handle.element.setPointerCapture = () => undefined
    handle.element.dispatchEvent(new PointerEvent('pointerdown', { clientY: 10, bubbles: true }))
    handle.element.dispatchEvent(new PointerEvent('pointerup', { clientY: 11, bubbles: true }))
    // This grip's own menu: a test that opens a second has two on the page.
    const menus = document.querySelectorAll<HTMLElement>('.trevixal-blockmenu')
    const menu = menus[menus.length - 1]
    expect(menu?.hidden).toBe(false)
    return menu as HTMLElement
  }

  const click = (menu: HTMLElement, label: string): void => {
    const button = [...menu.querySelectorAll<HTMLButtonElement>('button')].find(
      (entry) => entry.textContent === label,
    )
    expect(button, label).toBeDefined()
    button?.click()
  }

  it('opens on a click, and duplicates the block without its id', () => {
    const editor = mount(p('first', { id: 'intro' }), p('second'))
    const menu = openMenu(editor)
    expect([...menu.querySelectorAll('button')].map((button) => button.textContent)).toContain(
      'Copy link to block',
    )
    click(menu, 'Duplicate')
    expect(
      editor.state.doc.content.children.map((child) => [child.textContent, child.attrs.id]),
    ).toEqual([
      ['first', 'intro'],
      ['first', null],
      ['second', null],
    ])
    expect(menu.hidden).toBe(true)
    editor.destroy()
  })

  it('turns the block into a heading, and one undo turns it back', () => {
    const editor = mount(p('first'), p('second'))
    click(openMenu(editor), 'Heading 2')
    expect(editor.state.doc.child(0).type.name).toBe('heading')
    expect(editor.state.doc.child(0).attrs.level).toBe(2)
    editor.undo()
    expect(editor.state.doc.child(0).type.name).toBe('paragraph')
    editor.destroy()
  })

  it('moves and deletes the block', () => {
    const editor = mount(p('first'), p('second'))
    click(openMenu(editor), 'Move down')
    expect(editor.state.doc.content.children.map((child) => child.textContent)).toEqual([
      'second',
      'first',
    ])
    click(openMenu(editor), 'Delete')
    expect(editor.state.doc.content.children.map((child) => child.textContent)).toEqual(['first'])
    editor.destroy()
  })

  it('gives the block an id from its words, and copies a link to it', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    const editor = mount(p('The plan'))
    click(openMenu(editor), 'Copy link to block')
    expect(editor.state.doc.child(0).attrs.id).toBe('the-plan')
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/#the-plan$/))
    editor.destroy()
  })
})

describe('line numbers', () => {
  it('draw only while the document asks for them', () => {
    const editor = mount(p('x'))
    const lines = createLineNumbers(editor)
    expect(lines.element.hidden).toBe(true)
    editor.commands.setLineNumbers(true)
    lines.refresh()
    expect(lines.element.hidden).toBe(false)
    editor.commands.setLineNumbers(false)
    lines.refresh()
    expect(lines.element.hidden).toBe(true)
    lines.destroy()
    editor.destroy()
  })

  it('count every laid-out line of body text, and nothing in a table or the notes', () => {
    const root = document.createElement('div')
    root.innerHTML =
      '<p id="a">wraps over two lines</p><p id="b"></p><table><tr><td><p id="c">cell</p></td></tr></table>'
    document.body.appendChild(root)
    const line = (top: number): DOMRect => new DOMRect(0, top, 50, 18)
    vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(function (this: Range) {
      const id = (this.startContainer as Element).id
      if (id === 'a') return [line(0), line(0), line(20)] as unknown as DOMRectList
      if (id === 'c') return [line(60)] as unknown as DOMRectList
      return [] as unknown as DOMRectList
    })
    const empty = root.querySelector('#b') as HTMLElement
    vi.spyOn(empty, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 40, 50, 18))
    expect(measureLines(root).map((each) => each.top)).toEqual([0, 20, 40])
  })
})

describe('the document’s settings, through its source', () => {
  it('stay as they were when Markdown, which cannot write them, is applied', () => {
    const editor = mount(h(1, 'One'))
    editor.commands.setHeadingNumbering('outline')
    editor.commands.setDocumentDirection('rtl')
    const mode = createSourceMode(editor, { format: 'markdown' })
    mode.enter()
    const textarea = mode.element?.querySelector('textarea')
    if (!textarea) throw new Error('no textarea')
    textarea.value = '# One, fixed'
    mode.exit(true)
    expect(editor.state.doc.textContent).toBe('One, fixed')
    expect(editor.state.doc.attrs).toMatchObject({ headingNumbering: 'outline', direction: 'rtl' })
    mode.destroy()
    editor.destroy()
  })

  it('follow the HTML source, which carries them on its wrapper', async () => {
    const editor = mount(h(1, 'One'))
    editor.commands.setHeadingNumbering('outline')
    const ui = createEditorUI(editor, { container })
    item(ui.menus, 'sourceCode').run?.(editor)
    const field = document.querySelector<HTMLTextAreaElement>('.trevixal-dialog [name="html"]')
    if (!field) throw new Error('no source dialog')
    expect(field.value).toContain('data-heading-numbering="outline"')
    field.value = field.value.replace('"outline"', '"default"')
    field.form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await Promise.resolve()
    expect(editor.state.doc.attrs.headingNumbering).toBe('default')
    ui.destroy()
    editor.destroy()
  })
})

describe('following references', () => {
  it('finds a target by id, or an index entry by its mark', () => {
    const root = document.createElement('div')
    root.innerHTML = '<h2 id="results">R</h2><span data-index-term="xe-1">apples</span>'
    expect(referenceTarget(root, '#results')?.tagName).toBe('H2')
    expect(referenceTarget(root, '#xe-1')?.textContent).toBe('apples')
    expect(referenceTarget(root, '#nowhere')).toBeNull()
    // Whatever the address holds: a line break is no selector, and no error.
    expect(referenceTarget(root, '#a%0Ab')).toBeNull()
    expect(referenceTarget(root, '#%22%5D%2C*')).toBeNull()
  })

  it('goes to the target on Ctrl+click, and leaves a plain click alone', () => {
    const editor = mount(
      p('see'),
      schema.node('heading', { level: 2, id: 'results' }, [schema.text('Results')]),
    )
    const navigation = createReferenceNavigation(editor)
    const surface = editor.view?.dom as HTMLElement
    const link = document.createElement('span')
    link.setAttribute('data-href', '#results')
    surface.appendChild(link)
    link.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(editor.state.selection.from.path).toEqual([0])
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }))
    expect(editor.state.selection.from.path).toEqual([1])
    navigation.destroy()
    editor.destroy()
  })
})
