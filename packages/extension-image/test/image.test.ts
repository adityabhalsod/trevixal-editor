// @vitest-environment happy-dom
import {
  Schema,
  createEditor,
  defaultMarks,
  defaultNodes,
  parseHTML,
  serializeToHTML,
} from '@trevixal/core'
import { describe, expect, it, vi } from 'vitest'
import {
  type ImageStorage,
  UploadError,
  type UploadStatus,
  createDataURLStorage,
  createFallbackStorage,
  createFetchStorage,
  createS3PresignedStorage,
  deleteImage,
  image,
  imageNodes,
  setImageAlign,
  validateFile,
} from '../src'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...imageNodes() },
  marks: defaultMarks(),
})

const pngFile = (name = 'cat.png') =>
  new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' })

/** Resolves once every queued microtask settles. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

function setup(storage: ImageStorage, options: Record<string, unknown> = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ schema, element: host })
  const statuses: UploadStatus[] = []
  const errors: string[] = []
  const controller = image(editor, {
    storage,
    onUpload: (status) => statuses.push(status),
    onError: (message) => errors.push(message),
    ...options,
  })
  return { editor, controller, statuses, errors }
}

describe('validateFile', () => {
  it('rejects unsupported types and oversized files', () => {
    expect(validateFile(pngFile())).toBeNull()
    const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' })
    expect(validateFile(pdf)).toContain('Unsupported file type')
    expect(validateFile(pngFile(), { maxBytes: 1 })).toContain('too large')
  })

  it('honours a custom accept list', () => {
    expect(validateFile(pngFile(), { accept: ['image/webp'] })).toContain('Unsupported')
  })
})

describe('image uploads', () => {
  it('inserts a placeholder, then patches in the uploaded URL', async () => {
    const storage: ImageStorage = {
      upload: async (_file, context) => {
        context.onProgress?.(0.5)
        return { url: 'https://cdn.test/cat.png', key: 'k1' }
      },
    }
    const { editor, controller, statuses } = setup(storage)
    const uploading = controller.uploadFiles([pngFile()])

    // The placeholder exists immediately, before the upload resolves.
    const placeholder = editor.state.doc.child(1)
    expect(placeholder.type.name).toBe('image')
    expect(placeholder.attrs.uploadId).toMatch(/^upload-/)
    expect(placeholder.attrs.src).toBe('')

    await uploading
    const done = editor.state.doc.child(1)
    expect(done.attrs.src).toBe('https://cdn.test/cat.png')
    expect(done.attrs.storageKey).toBe('k1')
    expect(done.attrs.uploadId).toBeNull()
    expect(statuses.map((status) => status.state)).toEqual(['uploading', 'uploading', 'done'])
    expect(statuses.at(-2)?.progress).toBe(0.5)
    editor.destroy()
  })

  it('removes the placeholder and reports when the upload fails', async () => {
    const storage: ImageStorage = {
      upload: async () => {
        throw new UploadError('Storage is offline')
      },
    }
    const { editor, controller, errors, statuses } = setup(storage)
    await controller.uploadFiles([pngFile()])
    // Nothing left behind: the document is exactly as it started.
    expect(editor.getJSON()).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
    expect(errors).toEqual(['Storage is offline'])
    expect(statuses.at(-1)?.state).toBe('error')
    editor.destroy()
  })

  it('rejects invalid files without touching the document', async () => {
    const upload = vi.fn()
    const { editor, controller, errors } = setup({ upload })
    await controller.uploadFiles([new File(['x'], 'a.exe', { type: 'application/x-msdownload' })])
    expect(upload).not.toHaveBeenCalled()
    expect(errors[0]).toContain('Unsupported file type')
    expect(editor.state.doc.childCount).toBe(1)
    editor.destroy()
  })

  it('tracks the placeholder even when the document is edited mid-upload', async () => {
    let release = (): void => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const storage: ImageStorage = {
      upload: async () => {
        await gate
        return { url: 'https://cdn.test/late.png' }
      },
    }
    const { editor, controller } = setup(storage)
    const uploading = controller.uploadFiles([pngFile()])
    // The user types a new block *above* the placeholder while it uploads.
    editor.commands.insertText('typed while uploading')
    release()
    await uploading
    const images = editor.state.doc.content.children.filter((node) => node.type.name === 'image')
    expect(images).toHaveLength(1)
    expect(images[0]?.attrs.src).toBe('https://cdn.test/late.png')
    editor.destroy()
  })

  it('cancel aborts the upload and drops the placeholder', async () => {
    const storage: ImageStorage = {
      upload: (_file, context) =>
        new Promise((_resolve, reject) => {
          context.signal?.addEventListener('abort', () => reject(new UploadError('aborted')))
        }),
    }
    const { editor, controller, statuses } = setup(storage)
    const uploading = controller.uploadFiles([pngFile()])
    await settle()
    const id = statuses[0]?.id
    expect(id).toBeDefined()
    if (id) controller.cancel(id)
    await uploading
    expect(editor.state.doc.childCount).toBe(1)
    expect(controller.uploadsInFlight).toBe(0)
    editor.destroy()
  })

  it('uploads files dropped onto the editor', async () => {
    const storage: ImageStorage = { upload: async () => ({ url: 'https://cdn.test/drop.png' }) }
    const { editor } = setup(storage)
    const transfer = { files: [pngFile('drop.png')] } as unknown as DataTransfer
    const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent
    Object.defineProperty(event, 'dataTransfer', { value: transfer })
    editor.view?.dom.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    await settle()
    await settle()
    expect(editor.getHTML()).toContain('https://cdn.test/drop.png')
    editor.destroy()
  })

  it('deletes stored objects when the image leaves the document', async () => {
    const remove = vi.fn(async () => {})
    const storage: ImageStorage = {
      upload: async () => ({ url: 'https://cdn.test/gone.png', key: 'k9' }),
      delete: remove,
    }
    const { editor, controller } = setup(storage, { deleteOnRemove: true })
    await controller.uploadFiles([pngFile()])
    expect(editor.state.doc.childCount).toBe(2)
    editor.exec(deleteImage)
    expect(editor.state.doc.childCount).toBe(1)
    expect(remove).toHaveBeenCalledWith({ url: 'https://cdn.test/gone.png', key: 'k9' })
    editor.destroy()
  })
})

describe('image commands and serialization', () => {
  it('aligns an image and round-trips through HTML', () => {
    const editor = createEditor({ schema })
    const controller = image(editor, { storage: { upload: async () => ({ url: 'x' }) } })
    controller.insertImage({ src: 'https://cdn.test/a.png', alt: 'A cat' })
    editor.exec(setImageAlign('left'))
    const html = editor.getHTML()
    expect(html).toContain('trevixal-image--left')
    expect(html).toContain('alt="A cat"')

    const reparsed = parseHTML(schema, html, document)
    const img = reparsed.content.children.find((node) => node.type.name === 'image')
    expect(img?.attrs.align).toBe('left')
    expect(img?.attrs.alt).toBe('A cat')
    expect(serializeToHTML(reparsed)).toContain('https://cdn.test/a.png')
    editor.destroy()
  })

  it('drops images with unsafe sources on import', () => {
    const doc = parseHTML(schema, '<p>x</p><img src="javascript:alert(1)">', document)
    expect(doc.content.children.some((node) => node.type.name === 'image')).toBe(false)
  })
})

describe('storage backends', () => {
  it('posts multipart form data and maps the response', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ url: 'https://cdn.test/x.png', key: 'abc', width: 640 }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const storage = createFetchStorage({ endpoint: '/upload', fields: { folder: 'posts' } })
    const result = await storage.upload(pngFile(), {})
    expect(result).toEqual({ url: 'https://cdn.test/x.png', key: 'abc', width: 640 })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/upload')
    expect((init.body as FormData).get('folder')).toBe('posts')
    vi.unstubAllGlobals()
  })

  it('surfaces a failing status as an UploadError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500 })),
    )
    const storage = createFetchStorage({ endpoint: '/upload' })
    await expect(storage.upload(pngFile(), {})).rejects.toThrow(UploadError)
    vi.unstubAllGlobals()
  })

  it('PUTs directly to presigned storage', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const storage = createS3PresignedStorage({
      sign: async (file) => ({
        uploadUrl: `https://s3.test/put/${file.name}`,
        publicUrl: `https://cdn.test/${file.name}`,
        key: `uploads/${file.name}`,
      }),
    })
    const result = await storage.upload(pngFile(), {})
    expect(result).toEqual({ url: 'https://cdn.test/cat.png', key: 'uploads/cat.png' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://s3.test/put/cat.png')
    expect(init.method).toBe('PUT')
    vi.unstubAllGlobals()
  })

  it('falls back to the next backend when one fails', async () => {
    const failing: ImageStorage = {
      upload: async () => {
        throw new UploadError('nope')
      },
    }
    const working: ImageStorage = { upload: async () => ({ url: 'https://cdn.test/fallback.png' }) }
    const storage = createFallbackStorage([failing, working])
    await expect(storage.upload(pngFile(), {})).resolves.toEqual({
      url: 'https://cdn.test/fallback.png',
    })
  })

  it('reports when every backend fails', async () => {
    const failing: ImageStorage = {
      upload: async () => {
        throw new UploadError('nope')
      },
    }
    const storage = createFallbackStorage([failing, failing])
    await expect(storage.upload(pngFile(), {})).rejects.toThrow('Every storage backend failed')
  })
})

describe('view listener lifecycle', () => {
  it('stops handling drops after destroy', async () => {
    const upload = vi.fn(async () => ({ url: 'https://cdn.test/x.png' }))
    const { editor, controller } = setup({ upload })
    const dom = editor.view?.dom
    controller.destroy()

    const transfer = { files: [pngFile()] } as unknown as DataTransfer
    const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent
    Object.defineProperty(event, 'dataTransfer', { value: transfer })
    dom?.dispatchEvent(event)
    await settle()

    expect(upload).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
    editor.destroy()
  })

  it('ignores drops that carry no image files', () => {
    const upload = vi.fn()
    const { editor } = setup({ upload })
    const transfer = {
      files: [new File(['x'], 'notes.txt', { type: 'text/plain' })],
    } as unknown as DataTransfer
    const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent
    Object.defineProperty(event, 'dataTransfer', { value: transfer })
    editor.view?.dom.dispatchEvent(event)
    // Not our concern: the core paste/drop pipeline still gets the event.
    expect(event.defaultPrevented).toBe(false)
    expect(upload).not.toHaveBeenCalled()
    editor.destroy()
  })
})

describe('controller teardown', () => {
  it('removes in-flight placeholders when destroyed', async () => {
    const storage: ImageStorage = {
      upload: (_file, context) =>
        new Promise((_resolve, reject) => {
          context.signal?.addEventListener('abort', () => reject(new UploadError('aborted')))
        }),
    }
    const { editor, controller } = setup(storage)
    const uploading = controller.uploadFiles([pngFile()])
    await settle()
    expect(editor.state.doc.childCount).toBe(2) // paragraph + placeholder

    controller.destroy()
    await uploading
    // No half-uploaded image is left stranded in the document.
    expect(editor.state.doc.childCount).toBe(1)
    expect(editor.getHTML()).toBe('<p></p>')
    editor.destroy()
  })
})

describe('inlined sources survive serialization', () => {
  it('renders a data-URL upload instead of dropping its source', async () => {
    // Regression: the image src reused the *link* allowlist, which excludes
    // data:, so every upload through createDataURLStorage rendered src="".
    const { editor, controller } = setup(createDataURLStorage())
    await controller.uploadFiles([pngFile()])
    await settle()

    const html = editor.getHTML()
    expect(html).toContain('src="data:image/png;base64,')
    expect(html).not.toContain('src=""')
    editor.destroy()
  })

  it('still drops a data URL carrying markup on import', () => {
    // Widening `data:` for images must not admit markup or script.
    const parsed = parseHTML(schema, '<img src="data:text/html,&lt;script&gt;">', document)
    expect(parsed.content.children.some((node) => node.type.name === 'image')).toBe(false)
  })

  it('accepts an inlined image on import', () => {
    const parsed = parseHTML(schema, '<img src="data:image/png;base64,iVBORw0KGgo=">', document)
    const image = parsed.content.children.find((node) => node.type.name === 'image')
    expect(image?.attrs.src).toBe('data:image/png;base64,iVBORw0KGgo=')
  })
})
