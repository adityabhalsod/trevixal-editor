import { Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { describe, expect, it, vi } from 'vitest'
import {
  type AttachmentUploadStatus,
  type FileStorage,
  UploadError,
  acceptsFile,
  attachments,
  embedNodes,
  validateAttachment,
} from '../src'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...embedNodes() },
  marks: defaultMarks(),
})

const pdf = (name = 'report.pdf', size = 3) =>
  new File([new Uint8Array(size)], name, { type: 'application/pdf' })
const png = () => new File([new Uint8Array(3)], 'cat.png', { type: 'image/png' })

/** Resolves once every queued microtask settles. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

function setup(storage: FileStorage, options: Record<string, unknown> = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ schema, element: host })
  const statuses: AttachmentUploadStatus[] = []
  const errors: string[] = []
  const controller = attachments(editor, {
    storage,
    onUpload: (status) => statuses.push(status),
    onError: (message) => errors.push(message),
    ...options,
  })
  return { editor, controller, statuses, errors }
}

function chips(editor: ReturnType<typeof createEditor>) {
  const found: Record<string, unknown>[] = []
  const walk = (node: import('@trevixal/core').EditorNode): void => {
    if (node.type.name === 'attachment') found.push(node.attrs)
    for (const child of node.content.children) walk(child)
  }
  walk(editor.state.doc)
  return found
}

describe('acceptsFile and validateAttachment', () => {
  it('takes anything but images by default', () => {
    expect(acceptsFile(pdf())).toBe(true)
    expect(acceptsFile(png())).toBe(false)
    expect(acceptsFile(new File(['x'], 'unknown', { type: '' }))).toBe(true)
  })

  it('matches MIME types, wildcards and extensions from an accept list', () => {
    expect(acceptsFile(pdf(), ['application/pdf'])).toBe(true)
    expect(acceptsFile(pdf(), ['application/*'])).toBe(true)
    expect(acceptsFile(pdf(), ['.pdf'])).toBe(true)
    expect(acceptsFile(pdf(), ['.zip', 'text/plain'])).toBe(false)
    expect(acceptsFile(png(), ['image/*'])).toBe(true)
  })

  it('reports the reason a file is refused', () => {
    const storage: FileStorage = { upload: async () => ({ url: 'x' }) }
    expect(validateAttachment(pdf(), { storage })).toBeNull()
    expect(validateAttachment(png(), { storage })).toContain('Unsupported file type')
    expect(validateAttachment(pdf('big.pdf', 2048), { storage, maxBytes: 1024 })).toBe(
      'File is too large (2 KB; limit 1 KB)',
    )
  })
})

describe('attachment uploads', () => {
  it('inserts a pending chip, then patches in the uploaded URL', async () => {
    const storage: FileStorage = {
      upload: async (_file, context) => {
        context.onProgress?.(0.5)
        return { url: 'https://cdn.test/report.pdf', key: 'k1' }
      },
    }
    const { editor, controller, statuses } = setup(storage)
    const uploading = controller.upload([pdf('report.pdf', 2048)])

    const [pending] = chips(editor)
    expect(pending).toMatchObject({
      href: '',
      name: 'report.pdf',
      size: 2048,
      type: 'application/pdf',
    })
    expect(pending?.uploadId).toMatch(/^attachment-/)
    expect(editor.getHTML()).toContain('Uploading…')

    await uploading
    const [done] = chips(editor)
    expect(done).toMatchObject({
      href: 'https://cdn.test/report.pdf',
      storageKey: 'k1',
      uploadId: null,
      name: 'report.pdf',
    })
    expect(editor.getHTML()).toContain('<span class="trevixal-attachment__size">2 KB</span>')
    expect(statuses.map((status) => status.state)).toEqual(['uploading', 'uploading', 'done'])
    expect(statuses[1]?.progress).toBe(0.5)
    editor.destroy()
  })

  it('removes the pending chip and reports when the upload fails', async () => {
    const storage: FileStorage = {
      upload: async () => {
        throw new UploadError('Storage is offline')
      },
    }
    const { editor, controller, errors, statuses } = setup(storage)
    await controller.upload([pdf()])
    expect(editor.getJSON()).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
    expect(errors).toEqual(['Storage is offline'])
    expect(statuses.at(-1)).toMatchObject({ state: 'error', error: 'Storage is offline' })
    editor.destroy()
  })

  it('rejects images and oversized files without touching the document', async () => {
    const upload = vi.fn()
    const { editor, controller, errors } = setup({ upload }, { maxBytes: 1 })
    await controller.upload([png(), pdf('big.pdf', 2)])
    expect(upload).not.toHaveBeenCalled()
    expect(errors[0]).toContain('Unsupported file type')
    expect(errors[1]).toContain('too large')
    expect(chips(editor)).toEqual([])
    editor.destroy()
  })

  it('finds the chip by upload id after the document is edited mid-upload', async () => {
    let release = (): void => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const storage: FileStorage = {
      upload: async () => {
        await gate
        return { url: 'https://cdn.test/late.pdf' }
      },
    }
    const { editor, controller } = setup(storage)
    const uploading = controller.upload([pdf()])
    // Text typed before the chip shifts its offset; the id still finds it.
    editor.commands.insertText('typed while uploading')
    release()
    await uploading
    expect(chips(editor)).toEqual([
      expect.objectContaining({ href: 'https://cdn.test/late.pdf', uploadId: null }),
    ])
    expect(editor.state.doc.textContent).toBe('typed while uploading')
    editor.destroy()
  })

  it('cancel aborts the upload and drops the pending chip', async () => {
    const storage: FileStorage = {
      upload: (_file, context) =>
        new Promise((_resolve, reject) => {
          context.signal?.addEventListener('abort', () => reject(new UploadError('aborted')))
        }),
    }
    const { editor, controller, statuses } = setup(storage)
    const uploading = controller.upload([pdf()])
    await settle()
    const id = statuses[0]?.id
    expect(id).toBeDefined()
    if (id) controller.cancel(id)
    await uploading
    expect(chips(editor)).toEqual([])
    expect(controller.uploadsInFlight).toBe(0)
    editor.destroy()
  })

  it('uploads non-image files dropped onto the editor and ignores images', async () => {
    const upload = vi.fn(async (file: File) => ({ url: `https://cdn.test/${file.name}` }))
    const { editor } = setup({ upload })
    const transfer = { files: [pdf('dropped.pdf'), png()] } as unknown as DataTransfer
    const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent
    Object.defineProperty(event, 'dataTransfer', { value: transfer })
    editor.view?.dom.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    await settle()
    await settle()
    expect(upload).toHaveBeenCalledTimes(1)
    expect(editor.getHTML()).toContain('https://cdn.test/dropped.pdf')
    editor.destroy()
  })

  it('does not bind drop when asked not to', async () => {
    const upload = vi.fn(async () => ({ url: 'https://cdn.test/x' }))
    const { editor } = setup({ upload }, { bindDrop: false })
    const transfer = { files: [pdf()] } as unknown as DataTransfer
    const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent
    Object.defineProperty(event, 'dataTransfer', { value: transfer })
    editor.view?.dom.dispatchEvent(event)
    await settle()
    expect(upload).not.toHaveBeenCalled()
    editor.destroy()
  })

  it('deletes stored objects when the chip leaves the document', async () => {
    const remove = vi.fn(async () => {})
    const storage: FileStorage = {
      upload: async () => ({ url: 'https://cdn.test/gone.pdf', key: 'k9' }),
      delete: remove,
    }
    const { editor, controller } = setup(storage, { deleteOnRemove: true })
    await controller.upload([pdf()])
    expect(chips(editor)).toHaveLength(1)
    editor.commands.selectAll()
    editor.commands.deleteSelection()
    expect(chips(editor)).toEqual([])
    expect(remove).toHaveBeenCalledWith({ url: 'https://cdn.test/gone.pdf', key: 'k9' })
    editor.destroy()
  })

  it('opens a file input from pickFiles', () => {
    const { editor, controller } = setup(
      { upload: async () => ({ url: 'x' }) },
      { accept: ['.pdf'] },
    )
    const created: HTMLInputElement[] = []
    const original = document.createElement.bind(document)
    const spy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const element = original(tag)
      if (tag === 'input') {
        created.push(element as HTMLInputElement)
        ;(element as HTMLInputElement).click = vi.fn()
      }
      return element
    })
    controller.pickFiles()
    spy.mockRestore()
    expect(created).toHaveLength(1)
    expect(created[0]?.type).toBe('file')
    expect(created[0]?.multiple).toBe(true)
    expect(created[0]?.accept).toBe('.pdf')
    expect(created[0]?.click).toHaveBeenCalled()
    editor.destroy()
  })

  it('destroy aborts in-flight uploads and detaches from the view', async () => {
    const upload = vi.fn(
      (_file: File, context: { signal?: AbortSignal }) =>
        new Promise<{ url: string }>((_resolve, reject) => {
          context.signal?.addEventListener('abort', () => reject(new UploadError('aborted')))
        }),
    )
    const { editor, controller } = setup({ upload })
    const uploading = controller.upload([pdf()])
    await settle()
    controller.destroy()
    await uploading
    expect(chips(editor)).toEqual([])
    editor.destroy()
  })
})
