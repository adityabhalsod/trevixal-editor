// @vitest-environment happy-dom
import {
  type EditorNode,
  Fragment,
  Schema,
  createEditor,
  defaultMarks,
  defaultNodes,
} from '@trevixal/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { compareDocuments, wordDiff } from '../src/compare'
import { createAutosave, createMemoryStorage, openBackupsDialog } from '../src/persistence'
import { clipWebPage } from '../src/web-clip'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

beforeEach(() => {
  document.body.innerHTML = ''
})

const p = (text: string): EditorNode =>
  schema.node('paragraph', undefined, text ? [schema.text(text)] : [])
const h1 = (text: string): EditorNode => schema.node('heading', { level: 1 }, [schema.text(text)])
const doc = (...blocks: EditorNode[]): EditorNode =>
  schema.node('doc', undefined, Fragment.from(blocks))

describe('comparing documents', () => {
  it('finds the words two versions of a block share, and the ones each has alone', () => {
    expect(wordDiff('the quick fox', 'the slow fox')).toEqual([
      { text: 'the ', kind: 'same' },
      { text: 'quick', kind: 'removed' },
      { text: 'slow', kind: 'added' },
      { text: ' fox', kind: 'same' },
    ])
  })

  it('pairs a block taken out with the one put in at its place, and counts the rest', () => {
    const rows = compareDocuments(
      doc(h1('Title'), p('one'), p('two')),
      doc(h1('Title'), p('one!'), p('three'), p('four')),
    )
    expect(rows.map((row) => [row.kind, row.before, row.after])).toEqual([
      ['same', 'Title', 'Title'],
      ['changed', 'one', 'one!'],
      ['changed', 'two', 'three'],
      ['added', null, 'four'],
    ])
    expect(rows[0]?.label).toBe('Heading 1')
  })

  it('sees a block that became a heading as changed, not the same', () => {
    const rows = compareDocuments(doc(p('Plan')), doc(h1('Plan')))
    expect(rows.map((row) => row.kind)).toEqual(['changed'])
  })
})

describe('named versions', () => {
  function mount(...blocks: EditorNode[]) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    return createEditor({ schema, element: host, doc: doc(...blocks) })
  }

  it('keeps a named version however many backups come after it', async () => {
    const editor = mount(p('first draft'))
    let clock = 1000
    const autosave = createAutosave(editor, {
      storage: createMemoryStorage(),
      backups: { keep: 2 },
      now: () => ++clock,
    })
    const version = await autosave.saveVersion('  Sent to   Sam ')
    expect(version?.name).toBe('Sent to Sam')
    for (let n = 0; n < 4; n++) await autosave.backupNow()
    const listed = await autosave.listBackups()
    expect(listed.filter((backup) => !backup.name)).toHaveLength(2)
    expect(listed.find((backup) => backup.name)?.name).toBe('Sent to Sam')
    expect(await autosave.saveVersion('   ')).toBeNull()
    autosave.destroy()
    editor.destroy()
  })

  it('compares a version with the document as it is now', async () => {
    const editor = mount(p('first draft'))
    const autosave = createAutosave(editor, { storage: createMemoryStorage() })
    await autosave.saveVersion('Draft 1')
    editor.setContent({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second draft' }] }],
    })
    void openBackupsDialog(autosave, { document, editor })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const item = document.querySelector('.trevixal-backups__item--version')
    expect(item?.textContent).toContain('Draft 1:')
    const compare = [...(item?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent === 'Compare with now',
    )
    compare?.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    const comparison = document.querySelector('.trevixal-compare')
    expect(comparison?.querySelector('[role="status"]')?.textContent).toBe(
      '1 changed, 0 added, 0 removed.',
    )
    expect(comparison?.querySelector('.trevixal-compare__cell--before del')?.textContent).toBe(
      'first',
    )
    expect(comparison?.querySelector('.trevixal-compare__cell--after ins')?.textContent).toBe(
      'second',
    )
    autosave.destroy()
    editor.destroy()
  })
})

describe('clipping a web page', () => {
  it('keeps the article, without the page around it, its addresses made whole', () => {
    const html = `<html><head><title>Field notes</title></head><body>
      <header><a href="/">Home</a></header><nav><a href="/about">About</a></nav>
      <article><h2>Owls</h2><p>Read <a href="owls.html">more</a>.</p><img src="/owl.png" alt="An owl"><script>steal()</script></article>
      <aside>Ads</aside><footer>© site</footer></body></html>`
    const clipped = clipWebPage(html, 'https://birds.test/notes/today.html', schema, document)
    const text = clipped.textContent
    expect(clipped.child(0).type.name).toBe('heading')
    expect(clipped.child(0).textContent).toBe('Field notes')
    expect(text).toContain('Owls')
    expect(text).not.toContain('About')
    expect(text).not.toContain('Ads')
    expect(text).not.toContain('steal')
    const link = clipped.child(2).content.children.find((child) => child.marks.length > 0)
    expect(link?.marks[0]?.attrs.href).toBe('https://birds.test/notes/owls.html')
    expect(clipped.child(clipped.childCount - 1).textContent).toBe('Clipped from birds.test')
  })
})

describe('a web page in one file', () => {
  it('packs its pictures and stylesheets in, and leaves what it cannot fetch', async () => {
    const { inlinePageResources } = await import('../src/documents')
    const fetcher = (async (url: string) => {
      if (url.endsWith('dot.png')) {
        return new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { 'content-type': 'image/png' },
        })
      }
      if (url.endsWith('site.css')) {
        return new Response('p { color: red }', { headers: { 'content-type': 'text/css' } })
      }
      return new Response('', { status: 404 })
    }) as typeof fetch
    const page = await inlinePageResources(
      '<link rel="stylesheet" href="https://x.test/site.css"><img src="https://x.test/dot.png"><img src="https://x.test/gone.png">',
      fetcher,
    )
    expect(page).toContain('<style>p { color: red }</style>')
    expect(page).toContain('<img src="data:image/png;base64,iVBORw==">')
    expect(page).toContain('<img src="https://x.test/gone.png">')
  })
})
