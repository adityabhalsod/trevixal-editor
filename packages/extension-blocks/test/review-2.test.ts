import {
  type Command,
  type EditorNode,
  EditorState,
  Fragment,
  type Path,
  ReplaceNodesStep,
  Schema,
  TextSelection,
  defaultMarks,
  defaultNodes,
  pos,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import {
  insertAccordion,
  setAccordionItemOpen,
  setAccordionItemOpenAt,
  toggleAccordionExclusive,
} from '../src/accordion'
import { insertCitation, renumberCitations, splitReferenceItem } from '../src/citations'
import { insertCallout, insertFootnote, insertPageBreak, liftOutOfContainer } from '../src/commands'
import { enterFromTitle, escapeContainerOnEnter } from '../src/keymap'
import { blockNodes } from '../src/schema'
import { activateTab, addTab, insertTabs, moveTab, removeTab } from '../src/tabs'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...blockNodes() },
  marks: defaultMarks(),
})

function p(text = ''): EditorNode {
  return schema.node('paragraph', undefined, text ? [schema.text(text)] : [])
}

function docOf(...blocks: EditorNode[]): EditorNode {
  return schema.node('doc', undefined, Fragment.from(blocks))
}

function column(...blocks: EditorNode[]): EditorNode {
  return schema.node('column', { width: null }, Fragment.from(blocks))
}

function columns(count: number, ...cols: EditorNode[]): EditorNode {
  return schema.node('columnBlock', { count }, Fragment.from(cols))
}

function toggle(...body: EditorNode[]): EditorNode {
  return schema.node(
    'toggleBlock',
    { open: true },
    Fragment.from([
      schema.node('toggleSummary', undefined, [schema.text('More')]),
      schema.node('toggleContent', undefined, Fragment.from(body)),
    ]),
  )
}

function tabsOf(...titles: string[]): EditorNode {
  const items = titles.map((title, i) =>
    schema.node(
      'tabItem',
      { active: i === 0 },
      Fragment.from([
        schema.node('tabTitle', undefined, [schema.text(title)]),
        schema.node('tabContent', undefined, Fragment.of(p())),
      ]),
    ),
  )
  return schema.node('tabsBlock', undefined, Fragment.from(items))
}

function referenceList(...ids: string[]): EditorNode {
  const items = ids.map((id) => schema.node('referenceItem', { id }, [schema.text(`Source ${id}`)]))
  return schema.node('referenceList', undefined, Fragment.from(items))
}

function stateAt(doc: EditorNode, path: Path, offset = 0): EditorState {
  return EditorState.create({ schema, doc, selection: new TextSelection(pos(path, offset)) })
}

function moveTo(state: EditorState, path: Path, offset = 0): EditorState {
  return EditorState.create({
    schema,
    doc: state.doc,
    selection: new TextSelection(pos(path, offset)),
  })
}

function run(state: EditorState, command: Command): EditorState {
  const tr = command(state)
  expect(tr).not.toBeNull()
  return state.apply(tr as NonNullable<typeof tr>)
}

/**
 * Every node in the tree holding content its own type allows. The block nodes
 * are fixed structure (`tabTitle tabContent`, `column+`, `referenceItem+`), so
 * an edit that writes the wrong child produces a document that still renders
 * but no longer round-trips or parses back. This is what catches that.
 */
function invalidNodes(node: EditorNode, path: Path = []): string[] {
  const bad: string[] = []
  if (!node.isText && !node.type.validContent(node.content)) {
    const children = node.content.children.map((child) => child.type.name).join(' ')
    bad.push(`${node.type.name} at [${path.join(',')}] holds: ${children}`)
  }
  for (let i = 0; i < node.childCount; i++) bad.push(...invalidNodes(node.child(i), [...path, i]))
  return bad
}

function names(node: EditorNode): string[] {
  return node.content.children.map((child) => child.type.name)
}

function actives(tabs: EditorNode): number[] {
  const found: number[] = []
  for (let i = 0; i < tabs.childCount; i++) {
    if (tabs.child(i).attrs.active === true) found.push(i)
  }
  return found
}

function opens(accordion: EditorNode): number[] {
  const found: number[] = []
  for (let i = 0; i < accordion.childCount; i++) {
    if (accordion.child(i).attrs.open === true) found.push(i)
  }
  return found
}

describe('leaving a column', () => {
  it('never leaves a bare paragraph among the columns of a layout', () => {
    const state = stateAt(docOf(columns(2, column(p('a'), p()), column(p('b')))), [0, 0, 1])
    const next = run(state, liftOutOfContainer)
    expect(invalidNodes(next.doc)).toEqual([])
    expect(names(next.doc)).toEqual(['columnBlock', 'paragraph'])
  })

  it('declines rather than dissolving a column that holds a single block', () => {
    const state = stateAt(docOf(columns(2, column(p('solo')), column(p('b')))), [0, 0, 0], 4)
    expect(liftOutOfContainer(state)).toBeNull()
  })

  it('keeps enter in a freshly inserted column from destroying the column', () => {
    const state = stateAt(docOf(columns(2, column(p()), column(p()))), [0, 0, 0])
    // Nothing to lift yet: the escape hatch declines so the editor's own
    // Enter splits the paragraph, and the second Enter leaves the layout.
    expect(escapeContainerOnEnter(state)).toBeNull()
    const split = stateAt(docOf(columns(2, column(p(), p()), column(p()))), [0, 0, 1])
    const next = run(split, escapeContainerOnEnter)
    expect(invalidNodes(next.doc)).toEqual([])
    expect(next.doc.eq(docOf(columns(2, column(p()), column(p())), p()))).toBe(true)
  })
})

describe('inserting a block from a fixed slot', () => {
  it('puts a callout after the toggle rather than in place of its summary', () => {
    const next = run(stateAt(docOf(toggle(p())), [0, 0], 0), insertCallout('info'))
    expect(invalidNodes(next.doc)).toEqual([])
    expect(names(next.doc)).toEqual(['toggleBlock', 'callout'])
  })

  it('puts a callout after the tabs block rather than inside a tab item', () => {
    const next = run(stateAt(docOf(tabsOf('One', 'Two')), [0, 1, 0], 3), insertCallout('note'))
    expect(invalidNodes(next.doc)).toEqual([])
    expect(names(next.doc)).toEqual(['tabsBlock', 'callout'])
  })

  it('puts a page break after the tabs block rather than beside a tab title', () => {
    const next = run(stateAt(docOf(tabsOf('One')), [0, 0, 0], 3), insertPageBreak)
    expect(invalidNodes(next.doc)).toEqual([])
    expect(names(next.doc)).toEqual(['tabsBlock', 'pageBreak'])
  })

  it('still replaces an empty paragraph and still appends after a written one', () => {
    const replaced = run(stateAt(docOf(p()), [0]), insertCallout('info'))
    expect(names(replaced.doc)).toEqual(['callout'])
    const appended = run(stateAt(docOf(p('intro')), [0], 5), insertCallout('info'))
    expect(names(appended.doc)).toEqual(['paragraph', 'callout'])
  })

  it('never swallows an empty paragraph for a page break', () => {
    const next = run(stateAt(docOf(p()), [0]), insertPageBreak)
    expect(names(next.doc)).toEqual(['paragraph', 'pageBreak'])
  })
})

describe('enter on a title line', () => {
  it('moves into the toggle body instead of splitting the summary', () => {
    const state = stateAt(docOf(toggle(p('body'))), [0, 0], 4)
    const next = run(state, enterFromTitle)
    expect(next.doc.eq(docOf(toggle(p('body'))))).toBe(true)
    expect(next.selection.from).toEqual({ path: [0, 1, 0], offset: 0 })
  })

  it('moves into the tab panel instead of writing a second title', () => {
    const state = stateAt(docOf(tabsOf('One', 'Two')), [0, 1, 0], 3)
    const next = run(state, enterFromTitle)
    expect(invalidNodes(next.doc)).toEqual([])
    expect(next.selection.from).toEqual({ path: [0, 1, 1, 0], offset: 0 })
  })

  it('moves into the accordion body instead of splitting the title', () => {
    const seeded = run(stateAt(docOf(p()), [0]), insertAccordion(2))
    const next = run(moveTo(seeded, [0, 0, 0], 0), enterFromTitle)
    expect(invalidNodes(next.doc)).toEqual([])
    expect(next.selection.from).toEqual({ path: [0, 0, 1, 0], offset: 0 })
  })

  it('declines on an ordinary paragraph, so enter still splits', () => {
    expect(enterFromTitle(stateAt(docOf(p('plain')), [0], 2))).toBeNull()
  })
})

describe('enter inside a reference entry', () => {
  it('gives the entry it starts a fresh id instead of cloning one', () => {
    const state = stateAt(docOf(p('x'), referenceList('ref1')), [1, 0], 3)
    const next = run(state, splitReferenceItem)
    const list = next.doc.child(1)
    expect(invalidNodes(next.doc)).toEqual([])
    expect(list.childCount).toBe(2)
    expect(list.child(0).attrs.id).toBe('ref1')
    expect(list.child(1).attrs.id).toBe('ref2')
    expect(list.child(0).textContent).toBe('Sou')
    expect(list.child(1).textContent).toBe('rce ref1')
    expect(next.selection.from).toEqual({ path: [1, 1], offset: 0 })
  })

  it('starts an entry, not a paragraph, at the end of the last entry', () => {
    const list = referenceList('ref1')
    const state = stateAt(docOf(p('x'), list), [1, 0], list.child(0).textContent.length)
    const next = run(state, splitReferenceItem)
    expect(invalidNodes(next.doc)).toEqual([])
    expect(names(next.doc.child(1))).toEqual(['referenceItem', 'referenceItem'])
  })

  it('skips ids already in the list when allocating', () => {
    const state = stateAt(docOf(p('x'), referenceList('ref1', 'ref2')), [1, 1], 3)
    const next = run(state, splitReferenceItem)
    expect(next.doc.child(1).child(2).attrs.id).toBe('ref3')
  })

  it('declines outside a reference entry', () => {
    expect(splitReferenceItem(stateAt(docOf(p('plain')), [0], 2))).toBeNull()
  })
})

describe('accordion open state', () => {
  it('declines a stale item index rather than throwing', () => {
    const seeded = run(stateAt(docOf(p()), [0]), insertAccordion(2))
    expect(setAccordionItemOpenAt(seeded.tr, [0, 7], true)).toBeNull()
    expect(setAccordionItemOpenAt(seeded.tr, [0, -1], true)).toBeNull()
  })

  it('keeps an exclusive accordion down to one open item', () => {
    const seeded = run(stateAt(docOf(p()), [0]), insertAccordion(3))
    expect(opens(seeded.doc.child(0))).toEqual([0])
    const next = run(moveTo(seeded, [0, 2, 0]), setAccordionItemOpen(true))
    expect(opens(next.doc.child(0))).toEqual([2])
  })

  it('closes all but the selected item when exclusivity is turned back on', () => {
    const seeded = run(stateAt(docOf(p()), [0]), insertAccordion(3))
    const free = run(moveTo(seeded, [0, 0, 0]), toggleAccordionExclusive)
    expect(free.doc.child(0).attrs.exclusive).toBe(false)
    const both = run(moveTo(free, [0, 2, 0]), setAccordionItemOpen(true))
    expect(opens(both.doc.child(0))).toEqual([0, 2])
    const exclusive = run(both, toggleAccordionExclusive)
    expect(opens(exclusive.doc.child(0))).toEqual([2])
  })
})

describe('tabs keep exactly one active', () => {
  it('holds the invariant across add, move and remove', () => {
    let state = run(stateAt(docOf(p()), [0]), insertTabs(3))
    expect(actives(state.doc.child(0))).toEqual([0])
    state = run(state, addTab)
    expect(actives(state.doc.child(0))).toEqual([1])
    state = run(state, moveTab('right'))
    expect(actives(state.doc.child(0))).toEqual([2])
    state = run(state, removeTab)
    expect(actives(state.doc.child(0))).toHaveLength(1)
    expect(state.doc.child(0).childCount).toBe(3)
    expect(invalidNodes(state.doc)).toEqual([])
  })

  it('leaves the active tab alone when a different one is removed', () => {
    const seeded = run(stateAt(docOf(p()), [0]), insertTabs(3))
    const next = run(moveTo(seeded, [0, 2, 0]), removeTab)
    expect(actives(next.doc.child(0))).toEqual([0])
  })

  it('activates by index within the block holding the selection', () => {
    const seeded = run(stateAt(docOf(p()), [0]), insertTabs(3))
    const next = run(moveTo(seeded, [0, 0, 0]), activateTab(2))
    expect(actives(next.doc.child(0))).toEqual([2])
  })
})

describe('footnotes', () => {
  it('declines a footnote taken from inside the footnote list', () => {
    const seeded = run(stateAt(docOf(p('claim')), [0], 5), insertFootnote())
    expect(insertFootnote()(moveTo(seeded, [1, 0, 0]))).toBeNull()
  })
})

describe('citation numbering', () => {
  it('labels citations by their entry position', () => {
    let state = run(stateAt(docOf(p('a')), [0], 1), insertCitation('Source A'))
    state = run(state, insertCitation('Source B'))
    const labels = state.doc
      .child(0)
      .content.children.filter((child) => child.type.name === 'citation')
      .map((child) => child.attrs.label)
    expect(labels).toEqual(['1', '2'])
  })

  it('renumbers after an entry is deleted, marking the orphan', () => {
    let state = run(stateAt(docOf(p('a')), [0], 1), insertCitation('Source A'))
    state = run(state, insertCitation('Source B'))
    const tr = state.tr
    tr.step(new ReplaceNodesStep([1], 0, 1, Fragment.empty))
    state = moveTo(state.apply(tr), [0], 1)
    const next = run(state, renumberCitations)
    const labels = next.doc
      .child(0)
      .content.children.filter((child) => child.type.name === 'citation')
      .map((child) => child.attrs.label)
    expect(labels).toEqual(['?', '1'])
  })
})
