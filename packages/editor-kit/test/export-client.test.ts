import { describe, expect, it } from 'vitest'
import { WORKER_FORMATS, createWorkerSerializer } from '../src/export-client'

describe('the export worker client', () => {
  it('leaves formats that need the page to the main thread', () => {
    const serialize = createWorkerSerializer()
    const html = {
      name: 'html',
      label: 'Web page',
      extension: 'html',
      mime: 'text/html',
      serialize: () => '',
    }
    expect(WORKER_FORMATS.has('html')).toBe(false)
    expect(serialize(html, {} as never, { title: 'T' } as never)).toBeNull()
  })

  it('writes on the main thread where no worker can start', () => {
    const serialize = createWorkerSerializer()
    const docx = {
      name: 'docx',
      label: 'Word',
      extension: 'docx',
      mime: 'x',
      serialize: () => 'here',
    }
    // happy-dom has no module workers, so the client declines rather than fails.
    expect(serialize(docx, {} as never, { title: 'T' } as never)).toBeNull()
  })
})
