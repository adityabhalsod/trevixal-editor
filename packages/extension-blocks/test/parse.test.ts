// @vitest-environment happy-dom
import {
  type EditorNode,
  Schema,
  defaultMarks,
  defaultNodes,
  parseHTML,
  serializeToHTML,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { blockNodes } from '../src/schema'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...blockNodes() },
  marks: defaultMarks(),
})

/** Parse HTML, re-serialize it, and hand back both the doc and the output. */
function roundTrip(html: string): { doc: EditorNode; html: string } {
  const doc = parseHTML(schema, html, document)
  return { doc, html: serializeToHTML(doc) }
}

describe('parsing blocks back from html', () => {
  it('round-trips a callout with its variant intact', () => {
    const source =
      '<div class="trevixal-callout trevixal-callout--danger" data-variant="danger"><p>stop</p></div>'
    const { doc, html } = roundTrip(source)
    expect(doc.child(0).type.name).toBe('callout')
    expect(doc.child(0).attrs.variant).toBe('danger')
    expect(html).toBe(source)
  })

  it('rejects a foreign data-variant div rather than claiming it as a callout', () => {
    const { doc } = roundTrip('<div data-variant="danger"><p>not ours</p></div>')
    expect(doc.child(0).type.name).toBe('paragraph')
  })

  it('round-trips a toggle, preserving the closed state', () => {
    const { doc } = roundTrip(
      '<details class="trevixal-toggle"><summary>Title</summary>' +
        '<div class="trevixal-toggle__content"><p>body</p></div></details>',
    )
    const toggle = doc.child(0)
    expect(toggle.type.name).toBe('toggleBlock')
    expect(toggle.attrs.open).toBe(false)
    expect(toggle.child(0).type.name).toBe('toggleSummary')
    expect(toggle.child(1).type.name).toBe('toggleContent')
  })

  it('round-trips a column layout and clamps a bogus count', () => {
    const { doc } = roundTrip(
      '<div class="trevixal-columns" data-columns="99">' +
        '<div class="trevixal-columns__column"><p>a</p></div>' +
        '<div class="trevixal-columns__column"><p>b</p></div></div>',
    )
    expect(doc.child(0).type.name).toBe('columnBlock')
    expect(doc.child(0).attrs.count).toBe(4)
    expect(doc.child(0).child(0).type.name).toBe('column')
  })

  it('round-trips a card', () => {
    const { doc, html } = roundTrip('<div class="trevixal-card"><p>boxed</p></div>')
    expect(doc.child(0).type.name).toBe('card')
    expect(html).toBe('<div class="trevixal-card"><p>boxed</p></div>')
  })

  it('round-trips a timeline with its markers', () => {
    const { doc } = roundTrip(
      '<ol class="trevixal-timeline" data-timeline="true">' +
        '<li class="trevixal-timeline__item" data-timeline-item="true" data-marker="2024">' +
        '<p>shipped</p></li></ol>',
    )
    expect(doc.child(0).type.name).toBe('timeline')
    expect(doc.child(0).child(0).attrs.marker).toBe('2024')
  })

  it('leaves an ordinary ordered list alone', () => {
    const { doc } = roundTrip('<ol><li><p>one</p></li></ol>')
    expect(doc.child(0).type.name).toBe('orderedList')
  })

  it('round-trips a page break', () => {
    const { doc } = roundTrip('<p>a</p><div data-page-break="true"></div><p>b</p>')
    expect(doc.child(1).type.name).toBe('pageBreak')
  })

  it('round-trips a badge with its tone and label', () => {
    const { doc } = roundTrip(
      '<p>ship <span class="trevixal-badge trevixal-badge--success" data-tone="success">new</span></p>',
    )
    const badge = doc.child(0).child(1)
    expect(badge.type.name).toBe('badge')
    expect(badge.attrs).toEqual({ label: 'new', tone: 'success' })
  })

  it('strips an unsafe target while importing a button', () => {
    const { doc, html } = roundTrip(
      '<p><span class="trevixal-button" data-button="true" data-href="javascript:alert(1)">Go</span></p>',
    )
    expect(doc.child(0).child(0).attrs.href).toBeNull()
    expect(html).not.toContain('javascript')
  })

  it('keeps a safe target while importing a button', () => {
    const { doc } = roundTrip(
      '<p><span class="trevixal-button" data-button="true" data-href="https://example.com">Go</span></p>',
    )
    const button = doc.child(0).child(0)
    expect(button.type.name).toBe('buttonBlock')
    expect(button.attrs.href).toBe('https://example.com')
  })

  it('imports a footnote ref and its item as a matching pair', () => {
    const { doc } = roundTrip(
      '<p>claim<span class="trevixal-footnote-ref" data-footnote="n1" data-href="#fn-n1">n1</span></p>' +
        '<ol class="trevixal-footnotes" data-footnotes="true">' +
        '<li class="trevixal-footnotes__item" data-footnote="n1"><p>source</p></li></ol>',
    )
    const ref = doc.child(0).child(1)
    expect(ref.type.name).toBe('footnoteRef')
    expect(ref.attrs.id).toBe('n1')
    const list = doc.child(1)
    expect(list.type.name).toBe('footnoteList')
    expect(list.child(0).attrs.id).toBe('n1')
  })

  it('drops a footnote ref whose id is not fragment-safe', () => {
    const { doc } = roundTrip(
      '<p>claim<span class="trevixal-footnote-ref" data-footnote="../etc">x</span></p>',
    )
    // The rule rejects, so the span is unknown markup: content kept, node gone.
    expect(doc.child(0).content.children.every((child) => child.type.name !== 'footnoteRef')).toBe(
      true,
    )
  })

  it('imports an anchor and drops one with an unsafe id', () => {
    const good = roundTrip('<p><a class="trevixal-anchor" id="top"></a>x</p>')
    expect(good.doc.child(0).child(0).type.name).toBe('anchor')

    const bad = roundTrip('<p><a class="trevixal-anchor" id="../up"></a>x</p>')
    expect(bad.doc.child(0).content.children.every((child) => child.type.name !== 'anchor')).toBe(
      true,
    )
  })

  it('never lets a script inside a callout reach the document', () => {
    const { html } = roundTrip(
      '<div class="trevixal-callout" data-variant="info"><p>ok</p><script>alert(1)</script></div>',
    )
    expect(html).not.toContain('script')
    expect(html).toContain('ok')
  })
})
