import {
  type Editor,
  type EditorNode,
  Fragment,
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  pos,
} from '@trevixal/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NO_LIST_NUMBERING,
  createListNumberingControl,
  currentListNumbering,
  defaultListNumberings,
} from '../src/controls'
import { defaultMenus } from '../src/menubar'
import { createToolbar } from '../src/toolbar'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

function p(text: string): EditorNode {
  return schema.node('paragraph', undefined, [schema.text(text)])
}

function list(type: string, attrs?: Record<string, unknown>): EditorNode {
  const item = schema.node('listItem', undefined, Fragment.of(p('item')))
  return schema.node(type, attrs, Fragment.of(item))
}

/** An editor with a caret in the first textblock of `block`. */
function editorWith(block: EditorNode): Editor {
  const editor = createEditor({ schema, doc: schema.node('doc', undefined, Fragment.of(block)) })
  const path = block.type.name === 'paragraph' ? [0] : [0, 0, 0]
  editor.exec((state) => state.tr.setSelection(new TextSelection(pos(path, 0))))
  return editor
}

/** The tiles a gallery panel draws, by value. */
function tiles(root: ParentNode): Map<string, HTMLButtonElement> {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('.trevixal-listgallery__tile')]
  return new Map(buttons.map((tile) => [tile.dataset.value ?? '', tile]))
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('defaultListNumberings', () => {
  it('offers None and then every scheme, each previewed three levels deep', () => {
    expect(
      defaultListNumberings().map((option) => [option.value, option.markers.join(' ')]),
    ).toEqual([
      ['none', ''],
      ['default', '1. a. i.'],
      ['parenthesis', '1) a) i)'],
      ['outline', '1. 1.1. 1.1.1.'],
      ['roman-outline', 'I. A. 1.'],
      ['symbols', '❖ ➢ ▪'],
    ])
  })
})

describe('currentListNumbering', () => {
  it('is None outside a list', () => {
    const editor = editorWith(p('plain'))
    expect(currentListNumbering(editor, editor.getSnapshot())).toBe(NO_LIST_NUMBERING)
  })

  it('is the tree’s scheme inside a list, and the default for a plain numbered one', () => {
    const outline = editorWith(list('orderedList', { numbering: 'outline' }))
    expect(currentListNumbering(outline, outline.getSnapshot())).toBe('outline')
    const plain = editorWith(list('orderedList'))
    expect(currentListNumbering(plain, plain.getSnapshot())).toBe('default')
  })

  it('is nothing for plain bullets, which no entry describes', () => {
    const editor = editorWith(list('bulletList'))
    expect(currentListNumbering(editor, editor.getSnapshot())).toBeNull()
  })
})

describe('createListNumberingControl', () => {
  it('draws a tile per entry, each named for what it applies', () => {
    const control = createListNumberingControl({
      document,
      options: defaultListNumberings(),
      valueOf: () => null,
      onSelect: () => {},
    })
    document.body.appendChild(control.element)
    const drawn = tiles(control.element)
    expect([...drawn.keys()]).toEqual([
      'none',
      'default',
      'parenthesis',
      'outline',
      'roman-outline',
      'symbols',
    ])
    expect(drawn.get('outline')?.getAttribute('aria-label')).toBe('Outline numbers: 1. 1.1. 1.1.1.')
    // Three levels, each stepped in one further than the last.
    const rows = [
      ...(drawn.get('outline')?.querySelectorAll<HTMLElement>('.trevixal-listgallery__row') ?? []),
    ]
    expect(rows.map((row) => row.style.getPropertyValue('--tvx-level'))).toEqual(['0', '1', '2'])
    expect(drawn.get('none')?.textContent).toBe('None')
    control.destroy()
  })

  it('reports the tile clicked, and closes', () => {
    const onSelect = vi.fn()
    const control = createListNumberingControl({
      document,
      options: defaultListNumberings(),
      valueOf: () => null,
      onSelect,
    })
    document.body.appendChild(control.element)
    control.element.querySelector<HTMLButtonElement>('.trevixal-dropdown__trigger')?.click()
    tiles(control.element).get('parenthesis')?.click()
    expect(onSelect).toHaveBeenCalledWith('parenthesis')
    expect(control.element.querySelector('.trevixal-dropdown__panel')?.hasAttribute('hidden')).toBe(
      true,
    )
    control.destroy()
  })

  it('marks the entry describing the selection, and only that one', () => {
    let current: string | null = 'outline'
    const control = createListNumberingControl({
      document,
      options: defaultListNumberings(),
      valueOf: () => current,
      onSelect: () => {},
    })
    const snapshot = editorWith(p('x')).getSnapshot()
    control.refresh(snapshot)
    const pressed = () =>
      [...tiles(control.element)]
        .filter(([, tile]) => tile.getAttribute('aria-pressed') === 'true')
        .map(([value]) => value)
    expect(pressed()).toEqual(['outline'])
    current = null
    control.refresh(snapshot)
    expect(pressed()).toEqual([])
    control.destroy()
  })
})

describe('the gallery in the toolbar', () => {
  it('numbers the list at the selection with the tile chosen', () => {
    const editor = editorWith(list('bulletList'))
    const toolbar = createToolbar(editor, document.body)
    tiles(toolbar.element).get('roman-outline')?.click()
    const root = editor.state.doc.child(0)
    expect(root.type.name).toBe('orderedList')
    expect(root.attrs.numbering).toBe('roman-outline')
  })

  it('takes the list apart for None', () => {
    const editor = editorWith(list('orderedList', { numbering: 'outline' }))
    const toolbar = createToolbar(editor, document.body)
    tiles(toolbar.element).get(NO_LIST_NUMBERING)?.click()
    expect(editor.state.doc.child(0).type.name).toBe('paragraph')
  })

  it('marks the current scheme as the selection moves', () => {
    const editor = editorWith(list('orderedList', { numbering: 'parenthesis' }))
    const toolbar = createToolbar(editor, document.body)
    // Any update refreshes the chrome; typing is one.
    editor.commands.insertText('!')
    expect(tiles(toolbar.element).get('parenthesis')?.getAttribute('aria-pressed')).toBe('true')
  })
})

describe('the gallery in the Format menu', () => {
  it('offers every scheme under Lists, each running it', () => {
    const format = defaultMenus().find((menu) => menu.name === 'format')
    const lists = format?.items.find((item) => item.name === 'listsMenu')
    const schemes = (lists?.items ?? []).filter((entry) => entry.name.startsWith('listNumbering-'))
    expect(schemes.map((entry) => entry.name)).toEqual([
      'listNumbering-default',
      'listNumbering-parenthesis',
      'listNumbering-outline',
      'listNumbering-roman-outline',
      'listNumbering-symbols',
    ])

    const editor = editorWith(p('plain'))
    const outline = schemes.find((entry) => entry.name === 'listNumbering-outline')
    outline?.run?.(editor)
    expect(editor.state.doc.child(0).attrs.numbering).toBe('outline')
  })
})
