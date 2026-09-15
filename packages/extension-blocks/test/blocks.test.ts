import {
  type Command,
  type EditorNode,
  EditorState,
  Fragment,
  type Path,
  Schema,
  TextSelection,
  defaultMarks,
  defaultNodes,
  pos,
  serializeToHTML,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import {
  insertAnchor,
  insertBadge,
  insertButton,
  insertCallout,
  insertCard,
  insertColumns,
  insertFootnote,
  insertPageBreak,
  insertTimeline,
  insertTimelineItem,
  insertToggleBlock,
  liftOutOfContainer,
  setCalloutVariant,
  setColumnCount,
  toggleToggleOpen,
} from '../src/commands'
import { escapeContainerOnEnter } from '../src/keymap'
import {
  badgeTone,
  blockNodes,
  calloutVariant,
  clampColumnCount,
  safeAnchorId,
} from '../src/schema'

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

function callout(variant = 'info', ...blocks: EditorNode[]): EditorNode {
  return schema.node('callout', { variant, icon: null }, Fragment.from(blocks))
}

function card(...blocks: EditorNode[]): EditorNode {
  return schema.node('card', undefined, Fragment.from(blocks))
}

function column(...blocks: EditorNode[]): EditorNode {
  return schema.node('column', { width: null }, Fragment.from(blocks))
}

function columns(count: number, ...cols: EditorNode[]): EditorNode {
  return schema.node('columnBlock', { count }, Fragment.from(cols))
}

function stateAt(doc: EditorNode, path: Path, offset = 0): EditorState {
  return EditorState.create({ schema, doc, selection: new TextSelection(pos(path, offset)) })
}

function run(state: EditorState, command: Command): EditorState {
  const tr = command(state)
  expect(tr).not.toBeNull()
  return state.apply(tr as NonNullable<typeof tr>)
}

describe('callouts', () => {
  it('replaces an empty paragraph with a callout and puts the cursor inside', () => {
    const next = run(stateAt(docOf(p()), [0]), insertCallout('warning'))
    expect(next.doc.eq(docOf(callout('warning', p())))).toBe(true)
    expect(next.selection.from).toEqual({ path: [0, 0], offset: 0 })
  })

  it('inserts after a paragraph that already has text', () => {
    const next = run(stateAt(docOf(p('intro')), [0], 5), insertCallout())
    expect(next.doc.eq(docOf(p('intro'), callout('info', p())))).toBe(true)
  })

  it('falls back to info for a variant outside the allowlist', () => {
    const next = run(stateAt(docOf(p()), [0]), insertCallout('chartreuse' as 'info'))
    expect(next.doc.child(0).attrs.variant).toBe('info')
  })

  it('re-flavors the callout holding the selection', () => {
    const state = stateAt(docOf(callout('info', p('heads up'))), [0, 0], 1)
    const next = run(state, setCalloutVariant('danger'))
    expect(next.doc.child(0).attrs.variant).toBe('danger')
  })

  it('declines to set a variant outside a callout', () => {
    expect(setCalloutVariant('danger')(stateAt(docOf(p('plain')), [0]))).toBeNull()
  })

  it('declines when the callout already has the requested variant', () => {
    const state = stateAt(docOf(callout('note', p('x'))), [0, 0], 1)
    expect(setCalloutVariant('note')(state)).toBeNull()
  })

  it('renders the variant as a class and a data attribute', () => {
    const html = serializeToHTML(docOf(callout('success', p('done'))))
    expect(html).toBe(
      '<div class="trevixal-callout trevixal-callout--success" data-variant="success"><p>done</p></div>',
    )
  })

  it('renders a junk variant as info rather than emitting it', () => {
    const rogue = schema.node('callout', { variant: '"><script>', icon: null }, Fragment.of(p('x')))
    const html = serializeToHTML(docOf(rogue))
    expect(html).toContain('trevixal-callout--info')
    expect(html).not.toContain('<script>')
  })
})

describe('toggle blocks', () => {
  it('inserts an open toggle and puts the cursor in the summary', () => {
    const next = run(stateAt(docOf(p()), [0]), insertToggleBlock)
    const toggle = next.doc.child(0)
    expect(toggle.type.name).toBe('toggleBlock')
    expect(toggle.attrs.open).toBe(true)
    expect(toggle.child(0).type.name).toBe('toggleSummary')
    expect(toggle.child(1).type.name).toBe('toggleContent')
    expect(next.selection.from).toEqual({ path: [0, 0], offset: 0 })
  })

  it('folds an open toggle and unfolds it again', () => {
    const state = stateAt(docOf(p()), [0])
    const opened = run(state, insertToggleBlock)
    const folded = run(opened, toggleToggleOpen)
    expect(folded.doc.child(0).attrs.open).toBe(false)
    expect(run(folded, toggleToggleOpen).doc.child(0).attrs.open).toBe(true)
  })

  it('declines to fold when the selection is outside a toggle', () => {
    expect(toggleToggleOpen(stateAt(docOf(p('x')), [0]))).toBeNull()
  })

  it('omits the open attribute entirely when closed', () => {
    const closed = schema.node(
      'toggleBlock',
      { open: false },
      Fragment.from([
        schema.node('toggleSummary', undefined, [schema.text('More')]),
        schema.node('toggleContent', undefined, Fragment.of(p('body'))),
      ]),
    )
    const html = serializeToHTML(docOf(closed))
    expect(html).not.toContain('open=')
    expect(html).toContain('<summary class="trevixal-toggle__summary">More</summary>')
  })
})

describe('columns', () => {
  it('inserts the requested number of empty columns', () => {
    const next = run(stateAt(docOf(p()), [0]), insertColumns(3))
    expect(next.doc.eq(docOf(columns(3, column(p()), column(p()), column(p()))))).toBe(true)
    expect(next.selection.from).toEqual({ path: [0, 0, 0], offset: 0 })
  })

  it('clamps a column count above the maximum', () => {
    const next = run(stateAt(docOf(p()), [0]), insertColumns(9))
    expect(next.doc.child(0).childCount).toBe(4)
    expect(next.doc.child(0).attrs.count).toBe(4)
  })

  it('clamps a column count below the minimum', () => {
    const next = run(stateAt(docOf(p()), [0]), insertColumns(1))
    expect(next.doc.child(0).childCount).toBe(2)
  })

  it('grows a layout by appending empty columns', () => {
    const state = stateAt(docOf(columns(2, column(p('a')), column(p('b')))), [0, 0, 0], 1)
    const next = run(state, setColumnCount(3))
    expect(next.doc.child(0).childCount).toBe(3)
    expect(next.doc.child(0).attrs.count).toBe(3)
  })

  it('shrinks a layout when the columns being dropped are empty', () => {
    const state = stateAt(
      docOf(columns(3, column(p('a')), column(p('b')), column(p()))),
      [0, 0, 0],
      1,
    )
    const next = run(state, setColumnCount(2))
    expect(next.doc.eq(docOf(columns(2, column(p('a')), column(p('b')))))).toBe(true)
  })

  it('refuses to shrink away a column that still has content', () => {
    const state = stateAt(
      docOf(columns(3, column(p('a')), column(p('b')), column(p('c')))),
      [0, 0, 0],
      1,
    )
    expect(setColumnCount(2)(state)).toBeNull()
  })

  it('declines a count change outside a column layout', () => {
    expect(setColumnCount(3)(stateAt(docOf(p('x')), [0]))).toBeNull()
  })

  it('declines when the layout already has the requested count', () => {
    const state = stateAt(docOf(columns(2, column(p('a')), column(p('b')))), [0, 0, 0], 1)
    expect(setColumnCount(2)(state)).toBeNull()
  })

  it('renders a grid template matching the column count', () => {
    const html = serializeToHTML(docOf(columns(2, column(p('a')), column(p('b')))))
    expect(html).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
    expect(html).toContain('data-columns="2"')
  })

  it('renders a sanitized column width and drops an unsafe one', () => {
    const safe = schema.node('column', { width: '50%' }, Fragment.of(p('a')))
    expect(serializeToHTML(docOf(columns(2, safe, column(p('b')))))).toContain('flex-basis: 50%')
    const unsafe = schema.node('column', { width: 'url(javascript:alert(1))' }, Fragment.of(p('a')))
    const html = serializeToHTML(docOf(columns(2, unsafe, column(p('b')))))
    expect(html).not.toContain('javascript')
    expect(html).not.toContain('flex-basis')
  })
})

describe('cards and timelines', () => {
  it('inserts a card with the cursor inside', () => {
    const next = run(stateAt(docOf(p()), [0]), insertCard)
    expect(next.doc.eq(docOf(card(p())))).toBe(true)
    expect(next.selection.from).toEqual({ path: [0, 0], offset: 0 })
  })

  it('inserts a timeline seeded with one entry', () => {
    const next = run(stateAt(docOf(p()), [0]), insertTimeline)
    const timeline = next.doc.child(0)
    expect(timeline.type.name).toBe('timeline')
    expect(timeline.childCount).toBe(1)
    expect(next.selection.from).toEqual({ path: [0, 0, 0], offset: 0 })
  })

  it('appends an entry after the current one', () => {
    const seeded = run(stateAt(docOf(p()), [0]), insertTimeline)
    const next = run(seeded, insertTimelineItem)
    expect(next.doc.child(0).childCount).toBe(2)
    expect(next.selection.from).toEqual({ path: [0, 1, 0], offset: 0 })
  })

  it('declines to append an entry outside a timeline', () => {
    expect(insertTimelineItem(stateAt(docOf(p('x')), [0]))).toBeNull()
  })

  it('renders a timeline marker as a data attribute', () => {
    const item = schema.node('timelineItem', { marker: '2024' }, Fragment.of(p('shipped')))
    const html = serializeToHTML(docOf(schema.node('timeline', undefined, Fragment.of(item))))
    expect(html).toBe(
      '<ol class="trevixal-timeline" data-timeline="true">' +
        '<li class="trevixal-timeline__item" data-timeline-item="true" data-marker="2024">' +
        '<p>shipped</p></li></ol>',
    )
  })
})

describe('page breaks', () => {
  it('inserts a page break after the current block', () => {
    const next = run(stateAt(docOf(p('one')), [0], 3), insertPageBreak)
    expect(next.doc.childCount).toBe(2)
    expect(next.doc.child(1).type.name).toBe('pageBreak')
  })

  it('renders as a closed div carrying the print hook', () => {
    const next = run(stateAt(docOf(p('one')), [0], 3), insertPageBreak)
    expect(serializeToHTML(next.doc)).toContain(
      '<div class="trevixal-page-break" data-page-break="true" aria-hidden="true"></div>',
    )
  })
})

describe('badges', () => {
  it('inserts a badge at the cursor', () => {
    const next = run(stateAt(docOf(p('ship')), [0], 4), insertBadge('new', 'success'))
    const badge = next.doc.child(0).child(1)
    expect(badge.type.name).toBe('badge')
    expect(badge.attrs).toEqual({ label: 'new', tone: 'success' })
  })

  it('declines to insert a badge with no label', () => {
    expect(insertBadge('', 'info')(stateAt(docOf(p('x')), [0], 1))).toBeNull()
  })

  it('falls back to the neutral tone for an unknown one', () => {
    const next = run(stateAt(docOf(p('x')), [0], 1), insertBadge('beta', 'plaid' as 'info'))
    expect(next.doc.child(0).child(1).attrs.tone).toBe('neutral')
  })

  it('renders the label as escaped text inside the badge', () => {
    const next = run(stateAt(docOf(p('x')), [0], 1), insertBadge('<b>hi</b>', 'danger'))
    const html = serializeToHTML(next.doc)
    expect(html).toContain(
      '<span class="trevixal-badge trevixal-badge--danger" data-tone="danger">',
    )
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;')
  })
})

describe('buttons', () => {
  it('inserts a button carrying a safe href', () => {
    const next = run(
      stateAt(docOf(p('x')), [0], 1),
      insertButton('Read more', 'https://example.com'),
    )
    expect(next.doc.child(0).child(1).attrs.href).toBe('https://example.com')
  })

  it('drops a javascript: href at insert time', () => {
    const next = run(stateAt(docOf(p('x')), [0], 1), insertButton('Click', 'javascript:alert(1)'))
    expect(next.doc.child(0).child(1).attrs.href).toBeNull()
  })

  it('declines to insert a button with no label', () => {
    expect(insertButton('', 'https://example.com')(stateAt(docOf(p('x')), [0], 1))).toBeNull()
  })

  it('omits the target attribute when the stored value is unsafe', () => {
    const button = schema.node('buttonBlock', { label: 'Go', href: 'javascript:alert(1)' })
    const html = serializeToHTML(docOf(schema.node('paragraph', undefined, [button])))
    expect(html).toBe(
      '<p><span class="trevixal-button" role="button" data-button="true">Go</span></p>',
    )
  })

  it('renders a safe target as data-href', () => {
    const button = schema.node('buttonBlock', { label: 'Go', href: 'https://example.com' })
    const html = serializeToHTML(docOf(schema.node('paragraph', undefined, [button])))
    expect(html).toContain('data-href="https://example.com"')
  })
})

describe('footnotes', () => {
  it('pairs a ref with an item in a list created at the end of the document', () => {
    const next = run(stateAt(docOf(p('claim')), [0], 5), insertFootnote())
    const ref = next.doc.child(0).child(1)
    expect(ref.type.name).toBe('footnoteRef')
    expect(ref.attrs.id).toBe('1')
    const list = next.doc.child(1)
    expect(list.type.name).toBe('footnoteList')
    expect(list.child(0).attrs.id).toBe('1')
  })

  it('appends to the existing list and allocates the next free id', () => {
    const first = run(stateAt(docOf(p('claim')), [0], 5), insertFootnote())
    const second = run(stateAt(first.doc, [0], 5), insertFootnote())
    expect(second.doc.childCount).toBe(2)
    const list = second.doc.child(1)
    expect(list.childCount).toBe(2)
    expect(list.child(1).attrs.id).toBe('2')
  })

  it('accepts an explicit id and uses it for both halves', () => {
    const next = run(stateAt(docOf(p('claim')), [0], 5), insertFootnote('sources_2024'))
    expect(next.doc.child(0).child(1).attrs.id).toBe('sources_2024')
    expect(next.doc.child(1).child(0).attrs.id).toBe('sources_2024')
  })

  it('declines a duplicate explicit id rather than double-linking one item', () => {
    const first = run(stateAt(docOf(p('claim')), [0], 5), insertFootnote('a'))
    expect(insertFootnote('a')(stateAt(first.doc, [0], 5))).toBeNull()
  })

  it('declines path-traversal and script ids', () => {
    const state = stateAt(docOf(p('claim')), [0], 5)
    expect(insertFootnote('../etc/passwd')(state)).toBeNull()
    expect(insertFootnote('javascript:alert(1)')(state)).toBeNull()
    expect(insertFootnote('"><script>')(state)).toBeNull()
    expect(insertFootnote('')(state)).toBeNull()
  })

  it('renders the ref and item with matching fragment targets', () => {
    const next = run(stateAt(docOf(p('claim')), [0], 5), insertFootnote('note1'))
    const html = serializeToHTML(next.doc)
    expect(html).toContain('data-href="#fn-note1"')
    expect(html).toContain('<span class="trevixal-footnote-ref" id="fnref-note1"')
    expect(html).toContain('<li class="trevixal-footnotes__item" id="fn-note1"')
  })

  it('renders a marker with no target when the stored id is unsafe', () => {
    const ref = schema.node('footnoteRef', { id: '../etc' })
    const html = serializeToHTML(docOf(schema.node('paragraph', undefined, [ref])))
    expect(html).toBe('<p><span class="trevixal-footnote-ref"></span></p>')
  })
})

describe('anchors', () => {
  it('inserts an anchor with a safe id', () => {
    const next = run(stateAt(docOf(p('x')), [0], 1), insertAnchor('section-2'))
    expect(next.doc.child(0).child(1).attrs.id).toBe('section-2')
  })

  it('declines ids that are not fragment-safe', () => {
    const state = stateAt(docOf(p('x')), [0], 1)
    expect(insertAnchor('../up')(state)).toBeNull()
    expect(insertAnchor('a b')(state)).toBeNull()
    expect(insertAnchor('x'.repeat(65))(state)).toBeNull()
  })

  it('renders as an empty anchor carrying the id', () => {
    const next = run(stateAt(docOf(p('x')), [0], 1), insertAnchor('top'))
    expect(serializeToHTML(next.doc)).toBe('<p>x<a class="trevixal-anchor" id="top"></a></p>')
  })
})

describe('leaving a container', () => {
  it('moves the last block of a callout out after it', () => {
    const state = stateAt(docOf(callout('info', p('kept'), p())), [0, 1])
    const next = run(state, liftOutOfContainer)
    expect(next.doc.eq(docOf(callout('info', p('kept')), p()))).toBe(true)
    expect(next.selection.from).toEqual({ path: [1], offset: 0 })
  })

  it('unwraps a card whose only block is leaving', () => {
    const state = stateAt(docOf(card(p('solo'))), [0, 0], 4)
    const next = run(state, liftOutOfContainer)
    expect(next.doc.eq(docOf(p('solo')))).toBe(true)
  })

  it('leaves a column past the whole layout, which only holds columns', () => {
    const state = stateAt(docOf(columns(2, column(p('a'), p()), column(p('b')))), [0, 0, 1])
    const next = run(state, liftOutOfContainer)
    expect(next.doc.eq(docOf(columns(2, column(p('a')), column(p('b'))), p()))).toBe(true)
    expect(next.selection.from).toEqual({ path: [1], offset: 0 })
  })

  it('declines from a column that would be emptied, since a layout needs its columns', () => {
    const state = stateAt(docOf(columns(2, column(p('solo')), column(p('b')))), [0, 0, 0], 4)
    expect(liftOutOfContainer(state)).toBeNull()
  })

  it('declines from a block that is not the last in its container', () => {
    const state = stateAt(docOf(callout('info', p(), p('after'))), [0, 0])
    expect(liftOutOfContainer(state)).toBeNull()
  })

  it('declines outside any container', () => {
    expect(liftOutOfContainer(stateAt(docOf(p('plain')), [0]))).toBeNull()
  })

  it('declines inside a blockquote, which is not one of the containers', () => {
    const quote = schema.node('blockquote', undefined, Fragment.of(p()))
    expect(liftOutOfContainer(stateAt(docOf(quote), [0, 0]))).toBeNull()
  })
})

describe('the enter escape hatch', () => {
  it('leaves a callout from its empty last paragraph', () => {
    const state = stateAt(docOf(callout('info', p('note'), p())), [0, 1])
    const next = run(state, escapeContainerOnEnter)
    expect(next.doc.eq(docOf(callout('info', p('note')), p()))).toBe(true)
  })

  it('declines when the paragraph still has text, so enter splits normally', () => {
    const state = stateAt(docOf(callout('info', p('note'))), [0, 0], 4)
    expect(escapeContainerOnEnter(state)).toBeNull()
  })

  it('declines when the selection is not empty', () => {
    const doc = docOf(callout('info', p('note'), p()))
    const state = EditorState.create({
      schema,
      doc,
      selection: new TextSelection(pos([0, 0], 0), pos([0, 0], 4)),
    })
    expect(escapeContainerOnEnter(state)).toBeNull()
  })

  it('declines on an empty paragraph outside any container', () => {
    expect(escapeContainerOnEnter(stateAt(docOf(p()), [0]))).toBeNull()
  })
})

describe('attribute allowlists', () => {
  it('accepts every documented callout variant and rejects the rest', () => {
    for (const variant of ['info', 'success', 'warning', 'danger', 'note']) {
      expect(calloutVariant(variant)).toBe(variant)
    }
    expect(calloutVariant('other')).toBe('info')
    expect(calloutVariant(null)).toBe('info')
    expect(calloutVariant(7)).toBe('info')
  })

  it('accepts every documented badge tone and rejects the rest', () => {
    for (const tone of ['neutral', 'info', 'success', 'warning', 'danger']) {
      expect(badgeTone(tone)).toBe(tone)
    }
    expect(badgeTone('loud')).toBe('neutral')
    expect(badgeTone(undefined)).toBe('neutral')
  })

  it('clamps column counts into the supported range', () => {
    expect(clampColumnCount(1)).toBe(2)
    expect(clampColumnCount(3)).toBe(3)
    expect(clampColumnCount(99)).toBe(4)
    expect(clampColumnCount(2.4)).toBe(2)
    expect(clampColumnCount(Number.NaN)).toBe(2)
    expect(clampColumnCount('3')).toBe(2)
  })

  it('accepts fragment-safe ids and rejects everything else', () => {
    expect(safeAnchorId('Section_1-a')).toBe('Section_1-a')
    expect(safeAnchorId('../../etc')).toBeNull()
    expect(safeAnchorId('javascript:alert(1)')).toBeNull()
    expect(safeAnchorId('has space')).toBeNull()
    expect(safeAnchorId('#hash')).toBeNull()
    expect(safeAnchorId('')).toBeNull()
    expect(safeAnchorId(42)).toBeNull()
  })
})

describe('html round trip', () => {
  it('serializes a document using every block node', () => {
    const doc = docOf(
      callout('warning', p('careful')),
      card(p('boxed')),
      columns(2, column(p('left')), column(p('right'))),
      schema.node('pageBreak'),
    )
    const html = serializeToHTML(doc)
    expect(html).toBe(
      '<div class="trevixal-callout trevixal-callout--warning" data-variant="warning"><p>careful</p></div>' +
        '<div class="trevixal-card"><p>boxed</p></div>' +
        '<div class="trevixal-columns trevixal-columns--2" data-columns="2" ' +
        'style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr))">' +
        '<div class="trevixal-columns__column"><p>left</p></div>' +
        '<div class="trevixal-columns__column"><p>right</p></div></div>' +
        '<div class="trevixal-page-break" data-page-break="true" aria-hidden="true"></div>',
    )
  })

  it('keeps a callout icon as data rather than markup', () => {
    const withIcon = schema.node(
      'callout',
      { variant: 'note', icon: '"><img>' },
      Fragment.of(p('x')),
    )
    const html = serializeToHTML(docOf(withIcon))
    expect(html).not.toContain('<img>')
    expect(html).toContain('data-icon="&quot;&gt;&lt;img&gt;"')
  })
})
