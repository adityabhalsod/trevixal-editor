// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type { Command } from '../src/commands/commands'
import { listNumberingAt, setListNumbering, splitListItem } from '../src/commands/lists'
import { Fragment } from '../src/model/fragment'
import type { EditorNode } from '../src/model/node'
import { safeAssignee, safeTaskDate, taskMetaText } from '../src/schema/basic'
import { documentSettingsAttrs, parseDocumentSettings } from '../src/schema/document-settings'
import {
  CUSTOM_LEVEL_STYLES,
  LIST_LEVELS,
  customListScheme,
  isStoredNumbering,
  listMarker,
  listNumberingOf,
  listSchemesCSS,
  parseListSchemes,
  storedListSchemesAttr,
} from '../src/schema/list-numbering'
import { serializeToHTML } from '../src/serialize/html'
import { serializeToHTMLDocument } from '../src/serialize/html-document'
import { parseHTML } from '../src/serialize/parse-html'
import type { EditorState } from '../src/state/editor-state'
import { cursor, p, stateWith, testSchema } from './helpers'

function doc(attrs: Record<string, unknown> | undefined, ...children: EditorNode[]): EditorNode {
  return testSchema.node('doc', attrs, Fragment.from(children))
}

function ol(attrs: Record<string, unknown> | undefined, ...items: EditorNode[]): EditorNode {
  return testSchema.node('orderedList', attrs, Fragment.from(items))
}

function ul(...items: EditorNode[]): EditorNode {
  return testSchema.node('bulletList', undefined, Fragment.from(items))
}

function li(attrs: Record<string, unknown> | undefined, ...blocks: EditorNode[]): EditorNode {
  return testSchema.node('listItem', attrs, Fragment.from(blocks))
}

function tasks(...items: EditorNode[]): EditorNode {
  return testSchema.node('taskList', undefined, Fragment.from(items))
}

function task(attrs: Record<string, unknown>, ...blocks: EditorNode[]): EditorNode {
  return testSchema.node('taskItem', { checked: false, ...attrs }, Fragment.from(blocks))
}

function roundTrip(node: EditorNode): EditorNode {
  return parseHTML(testSchema, serializeToHTML(node))
}

function run(state: EditorState, command: Command): EditorState {
  const tr = command(state)
  expect(tr).not.toBeNull()
  return state.apply(tr as NonNullable<typeof tr>)
}

/** A step-by-step scheme: `Step 3:`, then `3.a)`, then bullets. */
const STEPS = customListScheme('custom-1', 'Steps', [
  { style: 'decimal', text: 'Step %1:', start: 3, indent: 3.5 },
  { style: 'lower-alpha', text: '%1.%2)', start: 1, indent: 2 },
  { style: 'bullet', text: '–', start: 1, indent: 1.5 },
])

describe('task due dates and assignees', () => {
  it('keeps a real ISO date and nothing else', () => {
    expect(safeTaskDate('2026-10-01')).toBe('2026-10-01')
    expect(safeTaskDate(' 2026-10-01 ')).toBe('2026-10-01')
    expect(safeTaskDate('2026-02-30')).toBeNull()
    expect(safeTaskDate('2026-13-01')).toBeNull()
    expect(safeTaskDate('01/10/2026')).toBeNull()
    expect(safeTaskDate(20261001)).toBeNull()
  })

  it('keeps a name on one line, trimmed and bounded', () => {
    expect(safeAssignee('  Priya  Shah ')).toBe('Priya Shah')
    expect(safeAssignee('Priya\nShah\t')).toBe('Priya Shah')
    expect(safeAssignee('   ')).toBeNull()
    expect(safeAssignee('x'.repeat(80))).toHaveLength(60)
    expect(safeAssignee(7)).toBeNull()
  })

  it('reads the chip as the assignee, then the date', () => {
    expect(taskMetaText({ assignee: 'Priya', due: '2026-10-01' })).toBe('@Priya · 2026-10-01')
    expect(taskMetaText({ assignee: 'Priya' })).toBe('@Priya')
    expect(taskMetaText({ due: '2026-10-01' })).toBe('2026-10-01')
    expect(taskMetaText({ due: 'soon' })).toBeNull()
  })

  it('writes both as attributes and as the chip text, and reads them back', () => {
    const list = tasks(task({ due: '2026-10-01', assignee: 'Priya' }, p('Draft')))
    const html = serializeToHTML(doc(undefined, list))
    expect(html).toContain('data-due="2026-10-01"')
    expect(html).toContain('data-assignee="Priya"')
    expect(html).toContain('--tvx-task-meta: &quot;@Priya · 2026-10-01&quot;')
    const item = roundTrip(doc(undefined, list)).child(0).child(0)
    expect(item.attrs).toMatchObject({ due: '2026-10-01', assignee: 'Priya', checked: false })
  })

  it('quotes a name for CSS, so it cannot end the chip early', () => {
    const list = tasks(task({ assignee: 'A "quoted" \\ name' }, p('x')))
    const style = roundTripStyle(list)
    expect(style).toBe('--tvx-task-meta: "@A \\"quoted\\" \\\\ name"')
  })

  it('drops a date that is not one on the way in', () => {
    const parsed = parseHTML(
      testSchema,
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="false" data-due="2026-02-30" data-assignee="  Sam "><p>x</p></li></ul>',
    )
    expect(parsed.child(0).child(0).attrs).toMatchObject({ due: null, assignee: 'Sam' })
  })

  it('does not carry a task’s date, assignee or fold into the one Enter splits off', () => {
    const state = stateWith(
      doc(undefined, tasks(task({ due: '2026-10-01', assignee: 'Priya' }, p('Draft')))),
      cursor([0, 0, 0], 5),
    )
    const next = run(state, splitListItem)
    expect(next.doc.child(0).child(1).attrs).toMatchObject({
      checked: false,
      due: null,
      assignee: null,
      folded: false,
    })
    expect(next.doc.child(0).child(0).attrs.assignee).toBe('Priya')
  })
})

/** The `style` a task item is written with. */
function roundTripStyle(list: EditorNode): string | null {
  const container = document.createElement('div')
  container.innerHTML = serializeToHTML(doc(undefined, list))
  return container.querySelector('li')?.getAttribute('style') ?? null
}

describe('folded list items', () => {
  it('round-trips the fold on list and task items alike', () => {
    const folded = doc(
      undefined,
      ul(li({ folded: true }, p('Venue'), ul(li(undefined, p('Hall'))))),
      tasks(task({ folded: true }, p('Plan'), p('Details'))),
    )
    const html = serializeToHTML(folded)
    expect(html.match(/data-folded=""/g)).toHaveLength(2)
    const back = roundTrip(folded)
    expect(back.child(0).child(0).attrs.folded).toBe(true)
    expect(back.child(1).child(0).attrs.folded).toBe(true)
    expect(
      roundTrip(doc(undefined, ul(li(undefined, p('a')))))
        .child(0)
        .child(0).attrs.folded,
    ).toBe(false)
  })

  it('keeps what a folded item hides when Enter splits it: the new item goes after them', () => {
    const state = stateWith(
      doc(
        undefined,
        ul(
          li({ folded: true }, p('Venue'), ul(li(undefined, p('Hall')))),
          li(undefined, p('Food')),
        ),
      ),
      cursor([0, 0, 0], 5),
    )
    const next = run(state, splitListItem)
    const list = next.doc.child(0)
    expect(list.childCount).toBe(3)
    expect(list.child(0).childCount).toBe(2)
    expect(list.child(0).child(1).textContent).toBe('Hall')
    expect(list.child(1).attrs.folded).toBe(false)
    expect(list.child(1).textContent).toBe('')
    expect(next.selection.from.path).toEqual([0, 1, 0])
  })

  it('still brings an open item’s nested list along, as before', () => {
    const state = stateWith(
      doc(undefined, ul(li(undefined, p('Venue'), ul(li(undefined, p('Hall')))))),
      cursor([0, 0, 0], 5),
    )
    const next = run(state, splitListItem)
    expect(next.doc.child(0).child(1).textContent).toBe('Hall')
  })
})

describe('defined multilevel schemes', () => {
  it('always has nine levels, filling in Word’s default for the rest', () => {
    expect(STEPS.custom).toHaveLength(LIST_LEVELS)
    expect(STEPS.custom?.[3]).toEqual({ style: 'decimal', text: '%4.', start: 1, indent: 1.5 })
    expect(STEPS.listType).toBe('orderedList')
    expect(
      customListScheme('custom-2', '', [{ style: 'bullet', text: '•', start: 1, indent: 1 }])
        .listType,
    ).toBe('bulletList')
  })

  it('numbers each level with its own text, style and the levels above', () => {
    expect(listMarker(STEPS, [3])).toBe('Step 3:')
    expect(listMarker(STEPS, [4, 2])).toBe('4.b)')
    expect(listMarker(STEPS, [4, 2, 1])).toBe('–')
    const zero = customListScheme('custom-3', 'Zero', [
      { style: 'decimal-leading-zero', text: '%1', start: 1, indent: 1 },
      { style: 'none', text: '(%2)', start: 1, indent: 1 },
    ])
    expect(listMarker(zero, [7])).toBe('07')
    expect(listMarker(zero, [12])).toBe('12')
    expect(listMarker(zero, [7, 3])).toBe('()')
  })

  it('cleans what it is given: unknown styles, deeper levels’ numbers, out-of-range values', () => {
    const scheme = customListScheme('custom-4', '  Mine  ', [
      { style: 'fancy' as never, text: 'x%2%1\u0007', start: -5, indent: 99 },
      { style: 'bullet', text: '%1★', start: 1, indent: 1.25 },
    ])
    expect(scheme.name).toBe('Mine')
    expect(scheme.custom?.[0]).toEqual({ style: 'decimal', text: 'x%1', start: 0, indent: 10 })
    expect(scheme.custom?.[1]?.text).toBe('★')
    expect(CUSTOM_LEVEL_STYLES).toContain('decimal-leading-zero')
  })

  it('reads its setting back, dropping entries that do not parse', () => {
    const stored = storedListSchemesAttr([STEPS])
    const parsed = parseListSchemes(stored)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toEqual(STEPS)
    expect(parseListSchemes('not json')).toEqual([])
    expect(
      parseListSchemes(JSON.stringify([{ id: 'default', levels: [] }, { id: 'custom-9' }])),
    ).toEqual([])
    expect(storedListSchemesAttr([])).toBeNull()
  })

  it('lets a list store a defined id, which the document resolves', () => {
    expect(isStoredNumbering('orderedList', 'custom-1')).toBe(true)
    expect(isStoredNumbering('bulletList', 'custom-1')).toBe(true)
    expect(isStoredNumbering('taskList', 'custom-1')).toBe(false)
    const list = ol({ numbering: 'custom-1' }, li(undefined, p('a')))
    const withScheme = doc({ listSchemes: storedListSchemesAttr([STEPS]) }, list)
    expect(listNumberingOf(list, withScheme)?.id).toBe('custom-1')
    // Without the definition it numbers as a list storing none does.
    expect(listNumberingOf(list, doc(undefined, list))?.id).toBe('default')
    expect(listNumberingAt(withScheme, [0, 0, 0])?.id).toBe('custom-1')
  })

  it('writes the definitions on the document and the id on its list, and reads both back', () => {
    const source = doc(
      { listSchemes: storedListSchemesAttr([STEPS]) },
      ol({ numbering: 'custom-1', start: 7 }, li(undefined, p('a'))),
    )
    const html = serializeToHTML(source)
    expect(html).toContain('data-list-schemes=')
    expect(html).toContain('data-numbering="custom-1"')
    // A defined scheme counts with its own counters, which `start` does not set.
    expect(html).toContain('counter-reset: tvx-list-1 6')
    const back = roundTrip(source)
    expect(back.attrs.listSchemes).toBe(source.attrs.listSchemes)
    expect(back.child(0).attrs).toMatchObject({ numbering: 'custom-1', start: 7 })
  })

  it('keeps a list’s own marker style beside a defined scheme’s start, and lets the style win', () => {
    const list = ol(
      { numbering: 'custom-1', start: 4, listStyle: 'upper-roman' },
      li(undefined, p('a')),
    )
    const html = serializeToHTML(doc({ listSchemes: storedListSchemesAttr([STEPS]) }, list))
    expect(html).toContain('style="list-style-type: upper-roman; counter-reset: tvx-list-1 3"')
    const css = listSchemesCSS(doc({ listSchemes: storedListSchemesAttr([STEPS]) }), '.page')
    expect(css).toContain(
      '.page :is(ol, ul)[data-numbering="custom-1"]:not([style*="list-style-type"]) { list-style-type: none }',
    )
    expect(css).toContain(
      '.page :is(ol, ul)[data-numbering="custom-1"]:not([style*="list-style-type"]) > li::before',
    )
  })

  it('draws each level with counters of its own, under the scope it is given', () => {
    const css = listSchemesCSS(doc({ listSchemes: storedListSchemesAttr([STEPS]) }), '.page')
    expect(css).toContain('.page :is(ol, ul)[data-numbering="custom-1"] {')
    expect(css).toContain('padding-inline-start: 3.5em')
    expect(css).toContain('counter-reset: tvx-list-1 2')
    expect(css).toContain('content: "Step " counter(tvx-list-1, decimal) ":"')
    expect(css).toContain(
      'content: counter(tvx-list-1, decimal) "." counter(tvx-list-2, lower-alpha) ")"',
    )
    expect(css).toContain('content: "–"')
    // A task list starts a tree of its own.
    expect(css).toContain('> li > :is(ol, ul):not([data-type])')
  })

  it('quotes marker text, so none can leave its rule or its style element', () => {
    const hostile = customListScheme('custom-5', 'x', [
      { style: 'decimal', text: '"}</style>\\', start: 1, indent: 1 },
    ])
    const source = doc({ listSchemes: storedListSchemesAttr([hostile]) }, p('x'))
    const css = listSchemesCSS(source, '.page')
    expect(css).toContain('content: "\\"}</style>\\\\";')
    const page = serializeToHTMLDocument(source)
    expect(page).not.toMatch(/"}<\/style>/)
    expect(page).toContain('<\\/style>')
  })

  it('is a document setting, carried by the settings element', () => {
    const settings = storedListSchemesAttr([STEPS]) as string
    const attrs = documentSettingsAttrs(doc({ listSchemes: settings }, p('x')))
    expect(attrs['data-list-schemes']).toBe(settings)
    const element = document.createElement('div')
    element.setAttribute('data-list-schemes', attrs['data-list-schemes'] as string)
    expect(parseDocumentSettings(element).listSchemes).toBe(settings)
  })

  it('numbers a list with a scheme the document defines, by its id', () => {
    const state = stateWith(
      doc({ listSchemes: storedListSchemesAttr([STEPS]) }, ol(undefined, li(undefined, p('a')))),
      cursor([0, 0, 0], 0),
    )
    const next = run(state, setListNumbering('custom-1'))
    expect(next.doc.child(0).attrs.numbering).toBe('custom-1')
    // One the document does not define declines.
    expect(setListNumbering('custom-2')(state)).toBeNull()
  })
})
