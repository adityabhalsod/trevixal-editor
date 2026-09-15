// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadFile, readFileBytes, readFileText, suggestFileName } from '../src/download'

describe('suggestFileName', () => {
  it('slugs a title and appends the extension', () => {
    expect(suggestFileName('Quarterly Report 2024', 'docx')).toBe('quarterly-report-2024.docx')
  })

  it('collapses punctuation and runs of separators', () => {
    expect(suggestFileName('Q3 // Q4: notes!!', 'rtf')).toBe('q3-q4-notes.rtf')
  })

  it('strips leading and trailing separators', () => {
    expect(suggestFileName('  --Hello--  ', 'txt')).toBe('hello.txt')
  })

  it('folds diacritics to ASCII', () => {
    expect(suggestFileName('Café Münster', 'docx')).toBe('cafe-munster.docx')
  })

  it('drops characters that have no ASCII form', () => {
    expect(suggestFileName('☃ ☃', 'docx')).toBe('document.docx')
    expect(suggestFileName('文書 notes', 'docx')).toBe('notes.docx')
  })

  it('caps the slug at 60 characters without a trailing hyphen', () => {
    const name = suggestFileName(`${'word '.repeat(30)}end`, 'docx')
    const slug = name.slice(0, -'.docx'.length)
    expect(slug.length).toBeLessThanOrEqual(60)
    expect(slug.endsWith('-')).toBe(false)
    expect(slug.startsWith('word-word-')).toBe(true)
  })

  it('falls back to "document" for empty, blank and missing titles', () => {
    expect(suggestFileName('', 'docx')).toBe('document.docx')
    expect(suggestFileName('   ', 'docx')).toBe('document.docx')
    expect(suggestFileName(null, 'docx')).toBe('document.docx')
    expect(suggestFileName(undefined, 'docx')).toBe('document.docx')
  })

  it('tolerates a dotted extension and omits an empty one', () => {
    expect(suggestFileName('Notes', '.docx')).toBe('notes.docx')
    expect(suggestFileName('Notes', '...rtf')).toBe('notes.rtf')
    expect(suggestFileName('Notes', '')).toBe('notes')
  })
})

describe('readFileText and readFileBytes', () => {
  it('reads a blob as UTF-8 text', async () => {
    const blob = new Blob(['héllo ☃'], { type: 'text/plain' })
    expect(await readFileText(blob)).toBe('héllo ☃')
  })

  it('reads a File as text', async () => {
    const file = new File(['line one\nline two'], 'notes.txt', { type: 'text/plain' })
    expect(await readFileText(file)).toBe('line one\nline two')
  })

  it('reads a blob as raw bytes', async () => {
    const source = new Uint8Array([0x89, 0x50, 0x00, 0xff])
    const bytes = await readFileBytes(new Blob([source]))
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect([...bytes]).toEqual([...source])
  })

  it('reads an empty blob', async () => {
    expect(await readFileText(new Blob([]))).toBe('')
    expect((await readFileBytes(new Blob([]))).length).toBe(0)
  })

  it('falls back to FileReader when the blob has no text()', async () => {
    const blob = new Blob(['fallback'], { type: 'text/plain' })
    const stripped = Object.create(blob, {
      text: { value: undefined },
      arrayBuffer: { value: undefined },
    }) as Blob
    expect(await readFileText(stripped)).toBe('fallback')
    expect([...(await readFileBytes(stripped))]).toEqual([...new TextEncoder().encode('fallback')])
  })
})

describe('downloadFile', () => {
  afterEach(async () => {
    // `downloadFile` revokes on the next tick; let that land before the stub goes.
    await new Promise((resolve) => setTimeout(resolve, 0))
    vi.unstubAllGlobals()
  })

  /** Capture the anchor the helper clicks, before it is removed again. */
  function captureClick(): { anchor: HTMLAnchorElement | null; parents: (Node | null)[] } {
    const seen: { anchor: HTMLAnchorElement | null; parents: (Node | null)[] } = {
      anchor: null,
      parents: [],
    }
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target as HTMLAnchorElement
        seen.anchor = target
        seen.parents.push(target.parentNode)
        event.preventDefault()
      },
      { once: true },
    )
    return seen
  }

  /** Replace `URL` with a subclass, so only the object-URL statics change. */
  function stubObjectURL(): { created: Blob[]; revoked: string[] } {
    const created: Blob[] = []
    const revoked: string[] = []
    class MockURL extends URL {
      static override createObjectURL(blob: Blob): string {
        created.push(blob)
        return `blob:mock/${created.length}`
      }

      static override revokeObjectURL(url: string): void {
        revoked.push(url)
      }
    }
    vi.stubGlobal('URL', MockURL)
    return { created, revoked }
  }

  it('clicks a hidden anchor carrying the file name and object URL', () => {
    const urls = stubObjectURL()
    const seen = captureClick()
    downloadFile(document, { name: 'report.docx', mime: 'application/zip', data: 'hello' })
    expect(seen.anchor).not.toBeNull()
    expect(seen.anchor?.getAttribute('download')).toBe('report.docx')
    expect(seen.anchor?.getAttribute('href')).toBe('blob:mock/1')
    expect(seen.anchor?.getAttribute('rel')).toBe('noopener')
    expect(seen.anchor?.style.display).toBe('none')
    expect(urls.created).toHaveLength(1)
  })

  it('attaches the anchor to the body for the click and removes it after', () => {
    stubObjectURL()
    const seen = captureClick()
    downloadFile(document, { name: 'a.txt', mime: 'text/plain', data: 'x' })
    expect(seen.parents[0]).toBe(document.body)
    expect(document.body.querySelector('a')).toBeNull()
  })

  it('gives the blob the requested mime type', () => {
    const urls = stubObjectURL()
    captureClick()
    downloadFile(document, { name: 'a.rtf', mime: 'application/rtf', data: '{\\rtf1}' })
    expect(urls.created[0]?.type).toBe('application/rtf')
  })

  it('wraps Uint8Array data in a blob of the same length', async () => {
    const urls = stubObjectURL()
    captureClick()
    const bytes = new Uint8Array([1, 2, 3, 4, 5])
    downloadFile(document, { name: 'a.bin', mime: 'application/octet-stream', data: bytes })
    const blob = urls.created[0] as Blob
    expect(blob.size).toBe(5)
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([1, 2, 3, 4, 5])
  })

  it('passes an existing Blob through untouched', () => {
    const urls = stubObjectURL()
    captureClick()
    const blob = new Blob(['x'], { type: 'text/plain' })
    downloadFile(document, { name: 'a.txt', mime: 'application/zip', data: blob })
    expect(urls.created[0]).toBe(blob)
  })

  it('revokes the object URL on the next tick', async () => {
    const urls = stubObjectURL()
    captureClick()
    downloadFile(document, { name: 'a.txt', mime: 'text/plain', data: 'x' })
    expect(urls.revoked).toHaveLength(0)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(urls.revoked).toEqual(['blob:mock/1'])
  })
})
