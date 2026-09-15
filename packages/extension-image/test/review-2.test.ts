// @vitest-environment happy-dom
import { Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type CompressOptions,
  type ImageStorage,
  type ImageTransform,
  UploadError,
  type UploadStatus,
  createFallbackStorage,
  deleteImage,
  image,
  imageNodes,
  selectImage,
  updateImage,
  validateFile,
} from '../src'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...imageNodes() },
  marks: defaultMarks(),
})

const pngFile = (name = 'cat.png', bytes = 3) =>
  new File([new Uint8Array(bytes)], name, { type: 'image/png' })

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

/** The image inserted by {@link withImage} always lands here. */
const IMAGE_PATH = [1]

/** An editor holding one image at {@link IMAGE_PATH}, selected as a node. */
function withImage(options: Record<string, unknown> = {}, src = 'https://cdn.test/a.png') {
  const storage: ImageStorage = { upload: async () => ({ url: 'https://cdn.test/x.png' }) }
  const context = setup(storage, options)
  context.controller.insertImage({ src, alt: 'A cat' })
  context.editor.exec(selectImage(IMAGE_PATH))
  return context
}

/** A fetch that always hands back the same PNG bytes, for `transform()`. */
function stubFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    })),
  )
}

const fakeTransformer = () =>
  vi.fn(
    async (_source: Blob | string, _transform: ImageTransform) =>
      new Blob([new Uint8Array([9, 9, 9, 9])], { type: 'image/png' }),
  )

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const sourcesOf = (editor: ReturnType<typeof createEditor>): string[] =>
  editor.state.doc.content.children
    .filter((node) => node.type.name === 'image')
    .map((node) => String(node.attrs.src))

describe('multi-file uploads', () => {
  it('keeps dropped files in the order they were given', async () => {
    const storage: ImageStorage = {
      upload: async (file) => ({ url: `https://cdn.test/${file.name}` }),
    }
    const { editor, controller } = setup(storage)
    await controller.uploadFiles([pngFile('one.png'), pngFile('two.png'), pngFile('three.png')])
    expect(sourcesOf(editor)).toEqual([
      'https://cdn.test/one.png',
      'https://cdn.test/two.png',
      'https://cdn.test/three.png',
    ])
    editor.destroy()
  })
})

describe('drag-and-drop affordance', () => {
  const dragOver = (transfer: unknown, editor: ReturnType<typeof createEditor>): DragEvent => {
    const event = new Event('dragover', { bubbles: true, cancelable: true }) as DragEvent
    Object.defineProperty(event, 'dataTransfer', { value: transfer })
    editor.view?.dom.dispatchEvent(event)
    return event
  }

  it('accepts an image drag before the browser exposes the bytes', () => {
    // During dragover a browser deliberately hides `files`; only the item
    // list (kind + type) is readable. Refusing the drag here means the drop
    // never happens at all.
    const { editor } = setup({ upload: async () => ({ url: 'x' }) })
    const event = dragOver(
      { files: [], types: ['Files'], items: [{ kind: 'file', type: 'image/png' }] },
      editor,
    )
    expect(event.defaultPrevented).toBe(true)
    editor.destroy()
  })

  it('ignores a drag that carries no image', () => {
    const { editor } = setup({ upload: async () => ({ url: 'x' }) })
    const event = dragOver(
      { files: [], types: ['Files'], items: [{ kind: 'file', type: 'application/pdf' }] },
      editor,
    )
    expect(event.defaultPrevented).toBe(false)
    editor.destroy()
  })
})

describe('deleteOnRemove and history', () => {
  it('does not delete the stored object when the insertion is undone', async () => {
    const remove = vi.fn(async () => {})
    const storage: ImageStorage = {
      upload: async () => ({ url: 'https://cdn.test/undo.png', key: 'k1' }),
      delete: remove,
    }
    const { editor, controller } = setup(storage, { deleteOnRemove: true })
    await controller.uploadFiles([pngFile()])
    expect(sourcesOf(editor)).toEqual(['https://cdn.test/undo.png'])

    // Undo is not a removal: the user can put it straight back.
    while (editor.undo() && sourcesOf(editor).length > 0) {
      // keep undoing until the image is out of the document
    }
    expect(remove).not.toHaveBeenCalled()

    // …and redo has to give back an image whose bytes still exist.
    while (editor.redo()) {
      // redo everything back
    }
    expect(sourcesOf(editor)).toEqual(['https://cdn.test/undo.png'])
    expect(remove).not.toHaveBeenCalled()

    // A real deletion still cleans up.
    editor.exec(deleteImage)
    expect(remove).toHaveBeenCalledWith({ url: 'https://cdn.test/undo.png', key: 'k1' })
    editor.destroy()
  })
})

describe('fallback storage', () => {
  it('deletes through the backend that actually stored the file', async () => {
    const remove = vi.fn(async () => {})
    const failing: ImageStorage = {
      upload: async () => {
        throw new UploadError('offline')
      },
      delete: vi.fn(async () => {}),
    }
    const working: ImageStorage = {
      upload: async () => ({ url: 'data:image/png;base64,AA==', key: 'k1' }),
      delete: remove,
    }
    const storage = createFallbackStorage([failing, working])
    const result = await storage.upload(pngFile(), {})
    await storage.delete?.(result)
    expect(remove).toHaveBeenCalledWith(result)
    expect(failing.delete).not.toHaveBeenCalled()
  })

  it('cleans up through the fallback chain when an image is removed', async () => {
    const remove = vi.fn(async () => {})
    const failing: ImageStorage = {
      upload: async () => {
        throw new UploadError('offline')
      },
    }
    const working: ImageStorage = {
      upload: async () => ({ url: 'https://cdn.test/fallback.png', key: 'k2' }),
      delete: remove,
    }
    const { editor, controller } = setup(createFallbackStorage([failing, working]), {
      deleteOnRemove: true,
    })
    await controller.uploadFiles([pngFile()])
    editor.exec(deleteImage)
    await settle()
    expect(remove).toHaveBeenCalledWith({ url: 'https://cdn.test/fallback.png', key: 'k2' })
    editor.destroy()
  })
})

describe('compression and the size limit', () => {
  it('still compresses a file that only the compressor could bring under the limit', async () => {
    const compressor = vi.fn(async (file: File, _options: CompressOptions) => file)
    const { editor, controller } = setup(
      { upload: async () => ({ url: 'https://cdn.test/x.png' }) },
      { compressor, maxBytes: 100_000 },
    )
    await controller.uploadFiles([pngFile('big.png', 120_000)])
    // The default `minBytes` (150 kB) is above the upload limit, so without
    // clamping the compressor is handed a file it will refuse to touch.
    expect(compressor).toHaveBeenCalledTimes(1)
    const settings = compressor.mock.calls[0]?.[1]
    expect(settings?.minBytes).toBeLessThanOrEqual(100_000)
    editor.destroy()
  })
})

describe('crop and rotate dimensions', () => {
  it('scales an explicit size down with the crop rectangle', async () => {
    stubFetch()
    const { editor, controller } = withImage({ transformer: fakeTransformer() })
    editor.exec(updateImage({ width: '400px', height: '300px' }, IMAGE_PATH))
    await controller.transform({ crop: { x: 0, y: 0, width: 0.5, height: 1 } }, IMAGE_PATH)
    const node = editor.state.doc.child(1)
    // Half the pixels drawn into the same 400px box would blow the image up.
    expect(node.attrs.width).toBe('200px')
    expect(node.attrs.height).toBe('300px')
    editor.destroy()
  })

  it('scales with the crop and then swaps for a quarter turn', async () => {
    stubFetch()
    const { editor, controller } = withImage({ transformer: fakeTransformer() })
    editor.exec(updateImage({ width: '400px', height: '300px' }, IMAGE_PATH))
    await controller.transform(
      { crop: { x: 0, y: 0, width: 1, height: 0.5 }, rotate: 90 },
      IMAGE_PATH,
    )
    const node = editor.state.doc.child(1)
    // Half the height survives the crop (150px), and the quarter turn then
    // hands that to the width.
    expect(node.attrs.width).toBe('150px')
    expect(node.attrs.height).toBe('400px')
    editor.destroy()
  })

  it('leaves a percentage width alone when cropping', async () => {
    stubFetch()
    const { editor, controller } = withImage({ transformer: fakeTransformer() })
    editor.exec(updateImage({ width: '50%', height: null }, IMAGE_PATH))
    await controller.transform({ crop: { x: 0, y: 0, width: 0.5, height: 0.5 } }, IMAGE_PATH)
    expect(editor.state.doc.child(1).attrs.width).toBe('50%')
    editor.destroy()
  })
})

describe('re-uploaded file names', () => {
  it('does not turn a data URL into a file name', async () => {
    stubFetch()
    const names: string[] = []
    const storage: ImageStorage = {
      upload: async (file) => {
        names.push(file.name)
        return { url: 'https://cdn.test/rotated.png' }
      },
    }
    const { editor, controller } = withImage(
      { storage, transformer: fakeTransformer() },
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
    )
    await controller.transform({ rotate: 90 }, IMAGE_PATH)
    expect(names).toEqual(['image.png'])
    editor.destroy()
  })
})

describe('accept patterns', () => {
  it('accepts the wildcard MIME patterns a file input takes', () => {
    expect(validateFile(pngFile(), { accept: ['image/*'] })).toBeNull()
    expect(
      validateFile(new File(['x'], 'a.pdf', { type: 'application/pdf' }), {
        accept: ['image/*'],
      }),
    ).toContain('Unsupported')
  })

  it('lets the catch-all pattern through', () => {
    // `*/*` is what a host says when it means "whatever the picker offers".
    expect(validateFile(pngFile(), { accept: ['*/*'] })).toBeNull()
    expect(
      validateFile(new File(['x'], 'a.pdf', { type: 'application/pdf' }), { accept: ['*/*'] }),
    ).toBeNull()
    // …and a file whose type the browser could not work out at all.
    expect(validateFile(new File(['x'], 'mystery'), { accept: ['*/*'] })).toBeNull()
  })
})

describe('the stored size a crop and a quarter turn leave behind', () => {
  /** Size attrs after one transform on an image that starts at `size`. */
  async function sizeAfter(
    size: Record<string, string | null>,
    transform: ImageTransform,
  ): Promise<{ width: unknown; height: unknown }> {
    stubFetch()
    const { editor, controller } = withImage({ transformer: fakeTransformer() })
    editor.exec(updateImage(size, IMAGE_PATH))
    await controller.transform(transform, IMAGE_PATH)
    const node = editor.state.doc.child(1)
    const result = { width: node.attrs.width, height: node.attrs.height }
    editor.destroy()
    return result
  }

  it('picks the crop fraction by output axis when only one dimension is set', async () => {
    // With `height` auto the browser keeps the aspect ratio, so nothing is
    // stretched, but the footprint still has to be right. After a quarter
    // turn the source's y axis is what the reader sees as width, so a crop
    // that halves y halves the stored width...
    await expect(
      sizeAfter(
        { width: '400px', height: null },
        {
          crop: { x: 0, y: 0, width: 1, height: 0.5 },
          rotate: 90,
        },
      ),
    ).resolves.toEqual({ width: '200px', height: null })

    // ...and a crop that halves x does not touch it at all, because x became
    // the height. Scaling by the x fraction here shrank the box along the one
    // axis the crop had left alone.
    await expect(
      sizeAfter(
        { width: '400px', height: null },
        {
          crop: { x: 0, y: 0, width: 0.5, height: 1 },
          rotate: 90,
        },
      ),
    ).resolves.toEqual({ width: '400px', height: null })

    // A lone height is the mirror image.
    await expect(
      sizeAfter(
        { width: null, height: '300px' },
        {
          crop: { x: 0, y: 0, width: 0.5, height: 1 },
          rotate: 270,
        },
      ),
    ).resolves.toEqual({ width: null, height: '150px' })
  })

  it('still scales each source axis and swaps when both are set', async () => {
    // The both-set path is unchanged: x scales the width, y the height, and
    // the quarter turn then exchanges the pair.
    await expect(
      sizeAfter(
        { width: '400px', height: '300px' },
        {
          crop: { x: 0, y: 0, width: 1, height: 0.5 },
          rotate: 90,
        },
      ),
    ).resolves.toEqual({ width: '150px', height: '400px' })
  })

  it('scales a length whose unit is upper case', async () => {
    // `safeLength` validates the unit case-insensitively but hands the string
    // back as written, so `400PX` is a valid pixel length that a naive
    // `endsWith('px')` skips, leaving the original stretch bug intact.
    await expect(
      sizeAfter(
        { width: '400PX', height: '300PX' },
        {
          crop: { x: 0, y: 0, width: 0.5, height: 0.5 },
        },
      ),
    ).resolves.toEqual({ width: '200px', height: '150px' })
  })

  it('does not move a percentage width onto the height', async () => {
    // A `%` width means "this much of the column"; a `%` height resolves
    // against an auto-height container and is effectively dropped, so a
    // quarter turn must not swap one onto the other.
    await expect(sizeAfter({ width: '50%', height: '400px' }, { rotate: 90 })).resolves.toEqual({
      width: '50%',
      height: '400px',
    })
  })
})

describe('accept entries a file input also takes', () => {
  it('honours extension entries', () => {
    // `pickFiles` hands `accept` straight to the input, so a host configuring
    // `.png` gets a picker that offers exactly the files this then refused.
    expect(validateFile(pngFile(), { accept: ['.png'] })).toBeNull()
    expect(validateFile(pngFile('cat.PNG'), { accept: ['.png'] })).toBeNull()
    expect(validateFile(pngFile('cat.gif'), { accept: ['.png', '.jpg'] })).toContain('Unsupported')
    // An extension entry still decides for a file the browser typed as nothing.
    expect(validateFile(new File(['x'], 'mystery.png'), { accept: ['.png'] })).toBeNull()
  })

  it('ignores MIME parameters on the file type', () => {
    const file = new File([new Uint8Array(3)], 'cat.png', { type: 'image/png; charset=binary' })
    expect(validateFile(file, { accept: ['image/png'] })).toBeNull()
    expect(validateFile(file, { accept: ['image/*'] })).toBeNull()
  })

  it('does not treat a type with no slash as a group', () => {
    // `candidate.indexOf('/')` is -1 here; slicing to it drops the last
    // character and made `pn/*` admit a file typed `png`.
    expect(validateFile(new File(['x'], 'a.png', { type: 'png' }), { accept: ['pn/*'] })).toContain(
      'Unsupported',
    )
  })
})
