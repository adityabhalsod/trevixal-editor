// @vitest-environment happy-dom
import {
  DEFAULT_PAGE_SETUP,
  type Editor,
  type EditorNode,
  Schema,
  createEditor,
  defaultMarks,
  defaultNodes,
  nodeFromJSON,
  setDocumentAttrs,
  storedPageSetup,
} from '@trevixal/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type DocumentExporter, exportDocument, printableHTML } from '../src/documents'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

const paragraph = (text: string): EditorNode =>
  nodeFromJSON(schema, {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })

function mount(text: string): Editor {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return createEditor({ schema, element: host, doc: paragraph(text) })
}

/** What a reader may see of "Secret plans". */
const readerCopy = (): EditorNode => paragraph('Public plans')

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('the printed page', () => {
  it('carries a watermark over the page when asked, its text escaped', () => {
    const editor = mount('Quarterly figures')
    const html = printableHTML(editor, { watermark: 'Protected <draft>' })
    expect(html).toContain(
      '<div class="trevixal-watermark" aria-hidden="true">Protected &lt;draft&gt;</div></body>',
    )
    expect(html).toContain('.trevixal-watermark {')
    expect(printableHTML(editor)).not.toContain('trevixal-watermark')
    editor.destroy()
  })

  it('sets the page as the document says: its paper, and its own watermark', () => {
    const editor = mount('Quarterly figures')
    editor.exec(
      setDocumentAttrs({
        pageSetup: storedPageSetup({
          ...DEFAULT_PAGE_SETUP,
          orientation: 'landscape',
          watermark: 'Draft',
        }),
      }),
    )
    const html = printableHTML(editor)
    expect(html).toContain('@page { size: 297mm 210mm; margin: 0; }')
    expect(html).toContain('<div class="trevixal-watermark" aria-hidden="true">Draft</div>')
    // A protected document's own watermark goes over the document's.
    expect(printableHTML(editor, { watermark: 'Protected' })).not.toContain('>Draft<')
    editor.destroy()
  })

  it('is the transformed document, down to its title', () => {
    const editor = mount('Secret plans')
    const html = printableHTML(editor, { transform: readerCopy })
    expect(html).toContain('<title>Public plans</title>')
    expect(html).not.toContain('Secret plans')
    editor.destroy()
  })
})

describe('a download', () => {
  it('is the transformed document, down to its file name', async () => {
    const editor = mount('Secret plans')
    const names: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download)
    })
    let written = ''
    const text: DocumentExporter = {
      name: 'text',
      label: 'Plain text',
      extension: 'txt',
      mime: 'text/plain',
      serialize: (doc, context) => {
        written = `${context.title}: ${doc.textContent}`
        return written
      },
    }
    await exportDocument(editor, text, document, { transform: readerCopy })
    expect(written).toBe('Public plans: Public plans')
    expect(names).toEqual(['Public plans.txt'])
    editor.destroy()
  })
})
