import {
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  parseHTML,
  pos,
} from '@trevixal/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  blockTargets,
  brokenInternalLinks,
  checkLinks,
  enableLinkTitles,
  ensureBlockId,
  linksIn,
  openLinkReport,
  slugFor,
} from '../src/link-tools'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

beforeEach(() => {
  document.body.innerHTML = ''
})

function mountEditor(html: string) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return createEditor({ schema, element: host, doc: parseHTML(schema, html, document) })
}

function docOf(html: string) {
  return parseHTML(schema, html, document)
}

/** A paste with only plain text on the clipboard, as the browser fires it. */
function pastePlain(target: HTMLElement, text: string): void {
  const event = new Event('paste', { cancelable: true, bubbles: true })
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: (mime: string) => (mime === 'text/plain' ? text : ''), setData: () => {} },
  })
  target.dispatchEvent(event)
}

describe('block targets', () => {
  it('lists each block by kind and first words, pointing into a list at its first paragraph', () => {
    const doc = docOf(
      '<h2 id="plan">The plan</h2><p>Some words here.</p><ul><li><p>First item</p></li></ul><pre><code>let x = 1</code></pre><p></p>',
    )
    const targets = blockTargets(doc)

    expect(targets.map((target) => target.label)).toEqual([
      'Heading: The plan',
      'Paragraph: Some words here.',
      'List: First item',
      'Code: let x = 1',
    ])
    expect(targets[0]?.id).toBe('plan')
    expect(targets[1]?.id).toBeNull()
    expect(targets[2]?.path).toEqual([2, 0, 0])
  })

  it('gives a block without an id one from its words, and leaves one with an id alone', () => {
    const editor = mountEditor('<h2 id="plan">The plan</h2><p>Plan</p><p>Next steps</p>')

    expect(ensureBlockId(editor.state, 0)).toEqual({ id: 'plan', tr: null })
    const next = ensureBlockId(editor.state, 2)
    expect(next?.id).toBe('next-steps')
    if (next?.tr) editor.dispatch(next.tr)
    expect(editor.state.doc.child(2).attrs.id).toBe('next-steps')
    // "Plan" slugs to an id the heading already has.
    expect(ensureBlockId(editor.state, 1)?.id).toBe('plan-2')
    editor.destroy()
  })

  it('makes ids that start with a letter and never take the editor’s own prefix', () => {
    expect(slugFor('2024 results', new Set())).toBe('block-2024-results')
    expect(slugFor('', new Set())).toBe('block-link')
    expect(slugFor('tvx thing', new Set())).toBe('block-tvx-thing')
    expect(slugFor('Café au lait!', new Set())).toBe('cafe-au-lait')
  })
})

describe('checking links', () => {
  it('reads a link split by other marks as one link', () => {
    const doc = docOf(
      '<p>See <a href="https://example.com">the <strong>whole</strong> page</a>.</p>',
    )

    expect(linksIn(doc)).toEqual([
      { href: 'https://example.com', text: 'the whole page', path: [0], from: 4, to: 18 },
    ])
  })

  it('reports links to missing places, bad emails and incomplete addresses as broken', async () => {
    const doc = docOf(
      '<h2 id="intro">Intro</h2><p><a href="#intro">up</a> <a href="#gone">lost</a> <a href="mailto:nobody">mail</a> <a href="notes/a b.md">spaced</a> <a href="notes/ok.md">relative</a> <a href="https://example.com">web</a></p>',
    )
    const reports = await checkLinks(doc)

    expect(reports.map((report) => [report.text, report.status])).toEqual([
      ['up', 'ok'],
      ['lost', 'broken'],
      ['mail', 'broken'],
      ['spaced', 'broken'],
      ['relative', 'ok'],
      ['web', 'unknown'],
    ])
    expect(reports[1]?.reason).toContain('gone')
  })

  it('asks the host about each outside address once, and counts a failure as broken', async () => {
    const doc = docOf(
      '<p><a href="https://a.test">one</a> <a href="https://a.test">two</a> <a href="https://b.test">three</a></p>',
    )
    const checkURL = vi.fn(async (href: string) => {
      if (href.includes('b.test')) throw new Error('offline')
      return 'ok' as const
    })
    const reports = await checkLinks(doc, { checkURL })

    expect(checkURL).toHaveBeenCalledTimes(2)
    expect(reports.map((report) => report.status)).toEqual(['ok', 'ok', 'broken'])
  })

  it('warns an export only about links inside the document', () => {
    const doc = docOf(
      '<p><a href="#nowhere">in</a> <a href="mailto:nobody">mail</a> <a href="https://x.test">out</a></p>',
    )

    expect(brokenInternalLinks(doc).map((link) => link.text)).toEqual(['in'])
  })

  it('lists the broken links, and Go to selects one', async () => {
    const editor = mountEditor('<p>Read <a href="#gone">this part</a> first.</p>')
    openLinkReport(document, editor, await checkLinks(editor.state.doc))

    const dialog = document.querySelector('.trevixal-link-report')
    expect(dialog?.querySelector('[role="status"]')?.textContent).toBe('1 link checked, 1 broken.')
    const go = [...(dialog?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent === 'Go to',
    )
    go?.click()
    expect(document.querySelector('.trevixal-link-report')).toBeNull()
    const { from, to } = editor.state.selection
    expect([from.offset, to.offset]).toEqual([5, 14])
    editor.destroy()
  })
})

describe('pasted link titles', () => {
  it('turns a pasted address into its page’s title, still linked', async () => {
    const editor = mountEditor('<p>See </p>')
    const view = editor.view
    if (!view) throw new Error('no view')
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 4))))
    const dispose = enableLinkTitles(editor, async () => '  Example   Domain ')
    pastePlain(view.dom, 'https://example.com')
    await vi.waitFor(() => {
      expect(linksIn(editor.state.doc)[0]?.text).toBe('Example Domain')
    })
    expect(linksIn(editor.state.doc)[0]?.href).toBe('https://example.com')
    dispose()
    editor.destroy()
  })

  it('leaves a link alone when the paste linked selected words', async () => {
    const editor = mountEditor('<p>Read the docs</p>')
    const view = editor.view
    if (!view) throw new Error('no view')
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 5), pos([0], 13))))
    const fetchTitle = vi.fn(async () => 'Docs home')
    const dispose = enableLinkTitles(editor, fetchTitle)
    pastePlain(view.dom, 'https://docs.test')
    await new Promise((resolve) => setTimeout(resolve, 5))

    expect(fetchTitle).not.toHaveBeenCalled()
    expect(linksIn(editor.state.doc)[0]?.text).toBe('the docs')
    dispose()
    editor.destroy()
  })
})
