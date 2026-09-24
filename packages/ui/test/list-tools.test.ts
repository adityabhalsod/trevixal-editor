import {
  ADD_TO_HISTORY,
  type Command,
  DEFAULT_LIST_NUMBERING,
  type Editor,
  type EditorNode,
  EditorState,
  Fragment,
  LIST_NUMBERING_SCHEMES,
  type Path,
  Schema,
  TextSelection,
  createEditor,
  customListScheme,
  defaultMarks,
  defaultNodes,
  documentListSchemes,
  pos,
  storedListSchemesAttr,
} from '@trevixal/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { createListNumberingControl, definedListNumberings } from '../src/controls'
import { repeatHeaderRowsIn } from '../src/documents'
import { editableLevels, openListSchemeDialog } from '../src/list-dialogs'
import {
  defineListNumbering,
  highlightOverdueTasks,
  localToday,
  nextListSchemeId,
  revealSelection,
  setListItemFolded,
  setTaskDetails,
  sortList,
  taskDetailsAt,
  toggleListItemFold,
} from '../src/list-tools'
import { defaultMenus } from '../src/menubar'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

function p(text: string): EditorNode {
  return schema.node('paragraph', undefined, text ? [schema.text(text)] : [])
}

function li(text: string, attrs?: Record<string, unknown>, ...rest: EditorNode[]): EditorNode {
  return schema.node('listItem', attrs, Fragment.from([p(text), ...rest]))
}

function ul(...items: EditorNode[]): EditorNode {
  return schema.node('bulletList', undefined, Fragment.from(items))
}

function ol(attrs: Record<string, unknown> | undefined, ...items: EditorNode[]): EditorNode {
  return schema.node('orderedList', attrs, Fragment.from(items))
}

function task(text: string, attrs: Record<string, unknown> = {}): EditorNode {
  return schema.node('taskItem', { checked: false, ...attrs }, Fragment.of(p(text)))
}

function tasks(...items: EditorNode[]): EditorNode {
  return schema.node('taskList', undefined, Fragment.from(items))
}

function doc(attrs: Record<string, unknown> | undefined, ...blocks: EditorNode[]): EditorNode {
  return schema.node('doc', attrs, Fragment.from(blocks))
}

function at(node: EditorNode, path: Path, offset = 0): EditorState {
  return EditorState.create({ schema, doc: node, selection: new TextSelection(pos(path, offset)) })
}

function run(state: EditorState, command: Command): EditorState {
  const tr = command(state)
  expect(tr).not.toBeNull()
  return state.apply(tr as NonNullable<typeof tr>)
}

const texts = (list: EditorNode): string[] =>
  list.content.children.map((item) => item.child(0).textContent)

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('sortList', () => {
  const unsorted = () =>
    doc(undefined, ol(undefined, li('Zeta'), li('alpha'), li(''), li('Beta 10'), li('Beta 2')))

  it('sorts A to Z by each item’s text: case aside, numbers in order, empty items last', () => {
    const next = run(at(unsorted(), [0, 0, 0]), sortList('ascending'))
    expect(texts(next.doc.child(0))).toEqual(['alpha', 'Beta 2', 'Beta 10', 'Zeta', ''])
  })

  it('sorts Z to A, empty items still last', () => {
    const next = run(at(unsorted(), [0, 0, 0]), sortList('descending'))
    expect(texts(next.doc.child(0))).toEqual(['Zeta', 'Beta 10', 'Beta 2', 'alpha', ''])
  })

  it('takes nested items along, and keeps the caret in its item', () => {
    const source = doc(undefined, ul(li('Venue', undefined, ul(li('Hall'))), li('Audio')))
    const next = run(at(source, [0, 0, 0], 3), sortList('ascending'))
    const list = next.doc.child(0)
    expect(texts(list)).toEqual(['Audio', 'Venue'])
    expect(list.child(1).child(1).child(0).textContent).toBe('Hall')
    expect(next.selection.from.path).toEqual([0, 1, 0])
    expect(next.selection.from.offset).toBe(3)
  })

  it('sorts the innermost list at the caret, and declines one already in order or outside a list', () => {
    const source = doc(undefined, ul(li('Venue', undefined, ul(li('b'), li('a'))), li('Audio')))
    const next = run(at(source, [0, 0, 1, 0, 0]), sortList('ascending'))
    expect(texts(next.doc.child(0))).toEqual(['Venue', 'Audio'])
    expect(texts(next.doc.child(0).child(0).child(1))).toEqual(['a', 'b'])
    expect(sortList('ascending')(next)).toBeNull()
    expect(sortList('ascending')(at(doc(undefined, p('x')), [0]))).toBeNull()
  })
})

describe('folding list items', () => {
  const venue = () =>
    doc(undefined, ul(li('Venue', undefined, ul(li('Hall'), li('Garden'))), li('Audio')))

  it('folds the item at the caret, outside the undo history', () => {
    const tr = toggleListItemFold(at(venue(), [0, 0, 0]))
    expect(tr?.getMeta(ADD_TO_HISTORY)).toBe(false)
    const next = at(venue(), [0, 0, 0]).apply(tr as NonNullable<typeof tr>)
    expect(next.doc.child(0).child(0).attrs.folded).toBe(true)
    expect(run(next, toggleListItemFold).doc.child(0).child(0).attrs.folded).toBe(false)
  })

  it('folds the item a caret in a leaf sits in, and takes the caret out of what it hides', () => {
    const next = run(at(venue(), [0, 0, 1, 1, 0], 2), toggleListItemFold)
    expect(next.doc.child(0).child(0).attrs.folded).toBe(true)
    expect(next.selection.from.path).toEqual([0, 0, 0])
    expect(next.selection.from.offset).toBe(5)
  })

  it('declines an item with nothing to fold', () => {
    expect(toggleListItemFold(at(venue(), [0, 1, 0]))).toBeNull()
    expect(setListItemFolded([0, 1], true)(at(venue(), [0, 1, 0]))).toBeNull()
  })

  it('unfolds whatever hides the selection', () => {
    const folded = run(at(venue(), [0, 0, 0]), toggleListItemFold)
    const hidden = folded.apply(folded.tr.setSelection(new TextSelection(pos([0, 0, 1, 0, 0], 0))))
    const tr = revealSelection(hidden)
    expect(tr?.getMeta(ADD_TO_HISTORY)).toBe(false)
    expect(
      hidden
        .apply(tr as NonNullable<typeof tr>)
        .doc.child(0)
        .child(0).attrs.folded,
    ).toBe(false)
    // A caret on the folded item's own line is in sight already.
    expect(revealSelection(folded)).toBeNull()
  })
})

describe('task details', () => {
  const plan = () => doc(undefined, tasks(task('Draft'), task('Send', { due: '2026-09-01' })))

  it('sets and reads a due date and an assignee, and clears them with empty text', () => {
    const next = run(
      at(plan(), [0, 0, 0]),
      setTaskDetails({ due: '2026-10-01', assignee: ' Priya ' }),
    )
    expect(taskDetailsAt(next)).toEqual({ due: '2026-10-01', assignee: 'Priya' })
    const cleared = run(next, setTaskDetails({ due: '', assignee: '' }))
    expect(taskDetailsAt(cleared)).toEqual({ due: null, assignee: null })
  })

  it('declines a date that is not one, no change, and outside a task', () => {
    const state = at(plan(), [0, 0, 0])
    expect(setTaskDetails({ due: '2026-02-31', assignee: null })(state)).toBeNull()
    expect(setTaskDetails({ due: null, assignee: null })(state)).toBeNull()
    const outside = at(doc(undefined, ul(li('x'))), [0, 0, 0])
    expect(taskDetailsAt(outside)).toBeNull()
    expect(setTaskDetails({ due: '2026-10-01', assignee: null })(outside)).toBeNull()
  })

  it('marks an unfinished task past its date, in the view only', () => {
    const element = document.createElement('div')
    document.body.appendChild(element)
    const editor = createEditor({
      schema,
      element,
      doc: doc(
        undefined,
        tasks(
          task('Late', { due: '2026-09-01' }),
          task('Done late', { due: '2026-09-01', checked: true }),
          task('Later', { due: '2026-12-01' }),
        ),
      ),
    })
    const stop = highlightOverdueTasks(editor, () => '2026-09-24')
    const marks = () =>
      [...element.querySelectorAll('li[data-type="taskItem"]')].map((item) =>
        item.hasAttribute('data-overdue'),
      )
    expect(marks()).toEqual([true, false, false])
    expect(editor.getHTML()).not.toContain('data-overdue')
    stop()
    editor.destroy()
  })

  it('reads today as a task’s date is written', () => {
    expect(localToday(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('defining a multilevel scheme', () => {
  const steps = (id = 'custom-1') =>
    customListScheme(id, 'Steps', [{ style: 'decimal', text: 'Step %1:', start: 1, indent: 3 }])

  it('saves the scheme to the document and numbers the list with it, as one step', () => {
    const next = run(
      at(doc(undefined, ol(undefined, li('a'))), [0, 0, 0]),
      defineListNumbering(steps()),
    )
    expect(documentListSchemes(next.doc).map((scheme) => scheme.id)).toEqual(['custom-1'])
    expect(next.doc.child(0).attrs.numbering).toBe('custom-1')
  })

  it('replaces a scheme of the same id in place, keeping the others', () => {
    const other = steps('custom-2')
    const source = doc(
      { listSchemes: storedListSchemesAttr([steps(), other]) },
      ol({ numbering: 'custom-1' }, li('a')),
    )
    const changed = customListScheme('custom-1', 'Renamed', [
      { style: 'upper-roman', text: '%1.', start: 1, indent: 2 },
    ])
    const next = run(at(source, [0, 0, 0]), defineListNumbering(changed))
    const schemes = documentListSchemes(next.doc)
    expect(schemes.map((scheme) => scheme.name)).toEqual(['Renamed', 'Steps'])
  })

  it('makes a list of the selected paragraph when there is none', () => {
    const next = run(at(doc(undefined, p('alone')), [0]), defineListNumbering(steps()))
    expect(next.doc.child(0).type.name).toBe('orderedList')
    expect(next.doc.child(0).attrs.numbering).toBe('custom-1')
  })

  it('numbers new schemes past the highest the document has', () => {
    expect(nextListSchemeId(doc(undefined, p('x')))).toBe('custom-1')
    const source = doc({ listSchemes: storedListSchemesAttr([steps('custom-4')]) }, p('x'))
    expect(nextListSchemeId(source)).toBe('custom-5')
  })

  it('starts the dialog from a built-in scheme written out level by level', () => {
    const outline = LIST_NUMBERING_SCHEMES.find((scheme) => scheme.id === 'outline')
    const parenthesis = LIST_NUMBERING_SCHEMES.find((scheme) => scheme.id === 'parenthesis')
    const symbols = LIST_NUMBERING_SCHEMES.find((scheme) => scheme.id === 'symbols')
    if (!outline || !parenthesis || !symbols) throw new Error('missing a built-in scheme')
    expect(editableLevels(outline)[2]).toMatchObject({ style: 'decimal', text: '%1.%2.%3.' })
    expect(editableLevels(parenthesis)[1]).toMatchObject({ style: 'lower-alpha', text: '%2)' })
    expect(editableLevels(symbols)[0]).toMatchObject({ style: 'bullet', text: '❖' })
    expect(editableLevels(DEFAULT_LIST_NUMBERING)).toHaveLength(9)
  })

  it('edits nine levels in its dialog, previews them, and resolves with the scheme', async () => {
    const opened = openListSchemeDialog({
      document,
      scheme: DEFAULT_LIST_NUMBERING,
      newId: 'custom-3',
    })
    const dialog = document.querySelector('.trevixal-listscheme') as HTMLElement
    expect(dialog.querySelectorAll('tbody tr')).toHaveLength(9)
    const marker = dialog.querySelector<HTMLInputElement>('input[aria-label="Level 1 marker"]')
    if (!marker) throw new Error('no marker field')
    marker.value = '(%1)'
    marker.dispatchEvent(new Event('input', { bubbles: true }))
    expect(dialog.querySelector('.trevixal-listscheme__marker')?.textContent).toBe('(1)')
    // A level switched to a bullet takes a symbol for its marker.
    const style = dialog.querySelector<HTMLSelectElement>(
      'select[aria-label="Level 2 number style"]',
    )
    if (!style) throw new Error('no style field')
    style.value = 'bullet'
    style.dispatchEvent(new Event('change', { bubbles: true }))
    expect(
      dialog.querySelector<HTMLInputElement>('input[aria-label="Level 2 marker"]')?.value,
    ).toBe('•')
    dialog.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }))
    const scheme = await opened
    expect(scheme?.id).toBe('custom-3')
    expect(scheme?.name).toBe('Custom 3')
    expect(scheme?.custom?.[0]?.text).toBe('(%1)')
    expect(scheme?.custom?.[1]).toMatchObject({ style: 'bullet', text: '•' })
    expect(document.querySelector('.trevixal-listscheme')).toBeNull()
  })

  it('shows the document’s own schemes in the gallery, and a way to define one', () => {
    const editor: Editor = createEditor({
      schema,
      doc: doc(
        { listSchemes: storedListSchemesAttr([steps()]) },
        ol({ numbering: 'custom-1' }, li('a')),
      ),
    })
    expect(definedListNumberings(editor.state.doc)).toEqual([
      { value: 'custom-1', label: 'Steps', markers: ['Step 1:', 'a.', 'i.'] },
    ])
    let defined = 0
    const control = createListNumberingControl({
      document,
      options: [],
      definedOptions: () => definedListNumberings(editor.state.doc),
      onDefine: () => {
        defined++
      },
      valueOf: () => 'custom-1',
      onSelect: () => undefined,
    })
    document.body.appendChild(control.element)
    control.refresh(editor.getSnapshot())
    control.element.querySelector<HTMLButtonElement>('.trevixal-dropdown__trigger')?.click()
    const tile = control.element.querySelector<HTMLButtonElement>(
      '.trevixal-listgallery__grid--defined .trevixal-listgallery__tile',
    )
    expect(tile?.dataset.value).toBe('custom-1')
    expect(tile?.getAttribute('aria-pressed')).toBe('true')
    control.element.querySelector<HTMLButtonElement>('.trevixal-listgallery__define')?.click()
    expect(defined).toBe(1)
    control.destroy()
  })
})

describe('the menus', () => {
  it('offer the new list and table entries', () => {
    const names = (items: readonly { name: string; items?: readonly unknown[] }[]): string[] =>
      items.flatMap((item) => [
        item.name,
        ...names((item.items ?? []) as { name: string; items?: readonly unknown[] }[]),
      ])
    const all = names(defaultMenus())
    for (const name of [
      'defineListNumbering',
      'sortListAscending',
      'sortListDescending',
      'toggleListFold',
      'taskDetails',
      'tableCaption',
      'freezeHeaderRow',
      'freezeFirstColumn',
      'cellAlignTop',
      'cellAlignMiddle',
      'cellAlignBottom',
      'cellPaddingNone',
      'cellPaddingNarrow',
      'cellPaddingNormal',
      'cellPaddingWide',
    ]) {
      expect(all).toContain(name)
    }
  })
})

describe('repeatHeaderRowsIn', () => {
  it('moves each table’s header row into a `thead`, so a print repeats it on every page', () => {
    const root = document.createElement('div')
    root.innerHTML =
      '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>' +
      '<table><tr><td>no</td><td>header</td></tr></table>'
    repeatHeaderRowsIn(root)
    const [first, second] = [...root.querySelectorAll('table')]
    expect(first?.querySelector('thead > tr')?.textContent).toBe('AB')
    expect(first?.querySelectorAll('tr')).toHaveLength(2)
    expect(first?.firstElementChild?.tagName).toBe('THEAD')
    expect(second?.querySelector('thead')).toBeNull()
    // Twice is the same as once.
    repeatHeaderRowsIn(root)
    expect(first?.querySelectorAll('thead')).toHaveLength(1)
  })
})
