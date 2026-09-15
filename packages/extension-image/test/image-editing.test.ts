// @vitest-environment happy-dom
import {
  HISTORY_LABEL,
  NodeSelection,
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  pos,
} from '@trevixal/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type CompressOptions,
  DEFAULT_COMPRESS_OPTIONS,
  type ImageStorage,
  type ImageTransform,
  compressImage,
  createImageResizeHandles,
  createImageToolbar,
  image,
  imageNodes,
  selectImage,
  setImageAlign,
  setImageAlt,
  setImageCaption,
  setImageWidth,
  toggleImageCaption,
  transformImage,
  updateImage,
} from '../src'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...imageNodes() },
  marks: defaultMarks(),
})

/** The image inserted by {@link setup} always lands here: paragraph, then image. */
const IMAGE_PATH = [1]

const pngFile = (name = 'cat.png', bytes = 3) =>
  new File([new Uint8Array(bytes)], name, { type: 'image/png' })

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/** happy-dom lays nothing out, so every measured element needs a box. */
function stubRect(element: Element, rect: Rect): void {
  element.getBoundingClientRect = () =>
    ({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }) as DOMRect
}

function setup(options: Record<string, unknown> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const host = document.createElement('div')
  container.appendChild(host)
  const editor = createEditor({ schema, element: host })
  const errors: string[] = []
  const labels: unknown[] = []
  editor.onTransaction(({ transaction }) => labels.push(transaction.getMeta(HISTORY_LABEL)))
  const storage: ImageStorage = { upload: async () => ({ url: 'https://cdn.test/x.png' }) }
  const controller = image(editor, {
    storage,
    onError: (message) => errors.push(message),
    ...options,
  })
  return { editor, controller, container, host, errors, labels }
}

/** An editor holding one image at {@link IMAGE_PATH}, selected as a node. */
function withImage(options: Record<string, unknown> = {}, src = 'https://cdn.test/a.png') {
  const context = setup(options)
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

describe('compression', () => {
  it('runs the compressor with the merged options for image uploads', async () => {
    const compressor = vi.fn(async (file: File, _options: CompressOptions) => file)
    const { editor, controller } = setup({ compressor })
    await controller.uploadFiles([pngFile()])
    expect(compressor).toHaveBeenCalledTimes(1)
    expect(compressor.mock.calls[0]?.[1]).toEqual(DEFAULT_COMPRESS_OPTIONS)
    editor.destroy()
  })

  it('lets the host override single compression options', async () => {
    const compressor = vi.fn(async (file: File, _options: CompressOptions) => file)
    const { editor, controller } = setup({ compressor, compress: { quality: 0.5 } })
    await controller.uploadFiles([pngFile()])
    expect(compressor.mock.calls[0]?.[1]).toEqual({ ...DEFAULT_COMPRESS_OPTIONS, quality: 0.5 })
    editor.destroy()
  })

  it('skips compression entirely when it is turned off', async () => {
    const compressor = vi.fn(async (file: File, _options: CompressOptions) => file)
    const { editor, controller } = setup({ compressor, compress: false })
    await controller.uploadFiles([pngFile()])
    expect(compressor).not.toHaveBeenCalled()
    editor.destroy()
  })

  it('uploads the compressed bytes, not the original ones', async () => {
    const uploaded: File[] = []
    const storage: ImageStorage = {
      upload: async (file) => {
        uploaded.push(file)
        return { url: 'https://cdn.test/small.jpg' }
      },
    }
    const compressor = vi.fn(
      async () => new File([new Uint8Array(2)], 'cat.jpg', { type: 'image/jpeg' }),
    )
    const { editor, controller } = setup({ storage, compressor })
    await controller.uploadFiles([pngFile('cat.png', 1000)])
    expect(uploaded).toHaveLength(1)
    expect(uploaded[0]?.name).toBe('cat.jpg')
    expect(uploaded[0]?.size).toBe(2)
    editor.destroy()
  })

  it('falls back to the original file when the compressor throws', async () => {
    const uploaded: File[] = []
    const storage: ImageStorage = {
      upload: async (file) => {
        uploaded.push(file)
        return { url: 'https://cdn.test/x.png' }
      },
    }
    const compressor = vi.fn(async () => {
      throw new Error('no canvas here')
    })
    const { editor, controller, errors } = setup({ storage, compressor })
    await controller.uploadFiles([pngFile()])
    expect(uploaded[0]?.name).toBe('cat.png')
    expect(errors).toEqual([])
    editor.destroy()
  })

  it('hands back the very same file when nothing can be rastered', async () => {
    // happy-dom has no 2D context, which is exactly the SSR/worker-less case.
    const big = new File([new Uint8Array(200_000)], 'big.png', { type: 'image/png' })
    await expect(compressImage(big)).resolves.toBe(big)
  })

  it('leaves a file below the threshold untouched', async () => {
    const small = pngFile()
    await expect(compressImage(small)).resolves.toBe(small)
  })
})

describe('transform', () => {
  it('replaces the source and the storage key with the new upload', async () => {
    stubFetch()
    const transformer = fakeTransformer()
    const storage: ImageStorage = {
      upload: async () => ({ url: 'https://cdn.test/rotated.png', key: 'k2' }),
    }
    const { editor, controller } = withImage({ storage, transformer })
    await expect(controller.transform({ rotate: 90 }, IMAGE_PATH)).resolves.toBe(true)
    const node = editor.state.doc.child(1)
    expect(node.attrs.src).toBe('https://cdn.test/rotated.png')
    expect(node.attrs.storageKey).toBe('k2')
    expect(transformer.mock.calls[0]?.[1]).toEqual({ rotate: 90 })
    editor.destroy()
  })

  it('swaps width and height for a quarter turn when both are set', async () => {
    stubFetch()
    const { editor, controller } = withImage({ transformer: fakeTransformer() })
    editor.exec(updateImage({ width: '400px', height: '300px' }, IMAGE_PATH))
    await controller.transform({ rotate: 270 }, IMAGE_PATH)
    const node = editor.state.doc.child(1)
    expect(node.attrs.width).toBe('300px')
    expect(node.attrs.height).toBe('400px')
    editor.destroy()
  })

  it('leaves the dimensions alone for a half turn', async () => {
    stubFetch()
    const { editor, controller } = withImage({ transformer: fakeTransformer() })
    editor.exec(updateImage({ width: '400px', height: '300px' }, IMAGE_PATH))
    await controller.transform({ rotate: 180 }, IMAGE_PATH)
    const node = editor.state.doc.child(1)
    expect(node.attrs.width).toBe('400px')
    expect(node.attrs.height).toBe('300px')
    editor.destroy()
  })

  it('names the undo group after the edit that was made', async () => {
    stubFetch()
    const { editor, controller, labels } = withImage({ transformer: fakeTransformer() })
    await controller.transform({ rotate: 90 }, IMAGE_PATH)
    expect(labels.at(-1)).toBe('Rotate image')
    await controller.transform({ crop: { x: 0, y: 0, width: 0.5, height: 0.5 } }, IMAGE_PATH)
    expect(labels.at(-1)).toBe('Crop image')
    editor.destroy()
  })

  it('applies the whole edit in a single transaction', async () => {
    stubFetch()
    const { editor, controller } = withImage({ transformer: fakeTransformer() })
    let changes = 0
    editor.onTransaction(({ transaction }) => {
      if (transaction.docChanged) changes++
    })
    await controller.transform({ rotate: 90 }, IMAGE_PATH)
    expect(changes).toBe(1)
    editor.destroy()
  })

  it('deletes the object the image used to point at', async () => {
    stubFetch()
    const remove = vi.fn(async () => {})
    let next = 0
    const storage: ImageStorage = {
      upload: async () => ({ url: `https://cdn.test/${++next}.png`, key: `k${next}` }),
      delete: remove,
    }
    const { editor, controller } = setup({
      storage,
      deleteOnRemove: true,
      transformer: fakeTransformer(),
    })
    await controller.uploadFiles([pngFile()])
    await controller.transform({ rotate: 90 }, IMAGE_PATH)
    expect(remove).toHaveBeenCalledWith({ url: 'https://cdn.test/1.png', key: 'k1' })
    expect(editor.state.doc.child(1).attrs.src).toBe('https://cdn.test/2.png')
    editor.destroy()
  })

  it('maps rotateLeft and rotateRight onto quarter turns', async () => {
    stubFetch()
    const transformer = fakeTransformer()
    const { editor, controller } = withImage({ transformer })
    await controller.rotateLeft(IMAGE_PATH)
    await controller.rotateRight(IMAGE_PATH)
    const applied = transformer.mock.calls.map((call) => call[1].rotate)
    expect(applied).toEqual([270, 90])
    editor.destroy()
  })

  it('finds the image through the selection when no path is given', async () => {
    stubFetch()
    const transformer = fakeTransformer()
    const { editor, controller } = withImage({ transformer })
    await expect(controller.transform({ rotate: 90 })).resolves.toBe(true)
    expect(transformer).toHaveBeenCalledTimes(1)
    editor.destroy()
  })

  it('reports a failure instead of leaving a broken source behind', async () => {
    stubFetch()
    const transformer = vi.fn(async () => {
      throw new Error('no canvas')
    })
    const { editor, controller, errors } = withImage({ transformer })
    await expect(controller.transform({ rotate: 90 }, IMAGE_PATH)).resolves.toBe(false)
    expect(errors).toEqual(['no canvas'])
    expect(editor.state.doc.child(1).attrs.src).toBe('https://cdn.test/a.png')
    editor.destroy()
  })

  it('does nothing when there is no image to transform', async () => {
    const { editor, controller } = setup({ transformer: fakeTransformer() })
    await expect(controller.transform({ rotate: 90 })).resolves.toBe(false)
    editor.destroy()
  })

  it('says so plainly when there is no canvas to draw on', async () => {
    const source = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    await expect(transformImage(source, { rotate: 90 })).rejects.toThrow('canvas')
  })
})

describe('caption, alt and size commands', () => {
  it('wraps an image in a figure and puts the caret in the caption', () => {
    const { editor } = withImage()
    expect(editor.exec(toggleImageCaption(IMAGE_PATH))).toBe(true)
    const figure = editor.state.doc.child(1)
    expect(figure.type.name).toBe('figure')
    expect(figure.child(0).type.name).toBe('image')
    expect(figure.child(1).type.name).toBe('caption')
    expect(editor.state.selection.from.path).toEqual([1, 1])
    editor.destroy()
  })

  it('unwraps a figure back to the bare image', () => {
    const { editor } = withImage()
    editor.exec(toggleImageCaption(IMAGE_PATH))
    expect(editor.exec(toggleImageCaption())).toBe(true)
    expect(editor.state.doc.child(1).type.name).toBe('image')
    expect(editor.state.selection).toBeInstanceOf(NodeSelection)
    editor.destroy()
  })

  it('sets caption text, wrapping the image when it has no figure yet', () => {
    const { editor } = withImage()
    expect(editor.exec(setImageCaption('A very good cat', IMAGE_PATH))).toBe(true)
    const figure = editor.state.doc.child(1)
    expect(figure.type.name).toBe('figure')
    expect(figure.child(1).textContent).toBe('A very good cat')
    editor.destroy()
  })

  it('replaces the text of an existing caption', () => {
    const { editor } = withImage()
    editor.exec(setImageCaption('first', IMAGE_PATH))
    editor.exec(setImageCaption('second', [1, 0]))
    const figure = editor.state.doc.child(1)
    expect(figure.childCount).toBe(2)
    expect(figure.child(1).textContent).toBe('second')
    editor.destroy()
  })

  it('sets the alt text', () => {
    const { editor } = withImage()
    expect(editor.exec(setImageAlt('A sleeping cat', IMAGE_PATH))).toBe(true)
    expect(editor.state.doc.child(1).attrs.alt).toBe('A sleeping cat')
    editor.destroy()
  })

  it('accepts px, bare numbers and percentages as a width', () => {
    const { editor } = withImage()
    editor.exec(setImageWidth('320', IMAGE_PATH))
    expect(editor.state.doc.child(1).attrs.width).toBe('320px')
    editor.exec(setImageWidth('240px', IMAGE_PATH))
    expect(editor.state.doc.child(1).attrs.width).toBe('240px')
    editor.exec(setImageWidth('50%', IMAGE_PATH))
    expect(editor.state.doc.child(1).attrs.width).toBe('50%')
    editor.destroy()
  })

  it('drops a stale pixel height when the width becomes a percentage', () => {
    const { editor } = withImage()
    editor.exec(updateImage({ width: '400px', height: '300px' }, IMAGE_PATH))
    editor.exec(setImageWidth('50%', IMAGE_PATH))
    expect(editor.state.doc.child(1).attrs.height).toBeNull()
    editor.destroy()
  })

  it('clears the width when passed null', () => {
    const { editor } = withImage()
    editor.exec(setImageWidth('320', IMAGE_PATH))
    editor.exec(setImageWidth(null, IMAGE_PATH))
    expect(editor.state.doc.child(1).attrs.width).toBeNull()
    editor.destroy()
  })

  it('selects an image as a whole node', () => {
    const { editor, controller } = setup()
    controller.insertImage({ src: 'https://cdn.test/a.png' })
    expect(editor.exec(selectImage(IMAGE_PATH))).toBe(true)
    const selection = editor.state.selection
    expect(selection).toBeInstanceOf(NodeSelection)
    expect((selection as NodeSelection).path).toEqual(IMAGE_PATH)
    editor.destroy()
  })

  it('aligns an image that sits inside a figure', () => {
    const { editor } = withImage()
    editor.exec(toggleImageCaption(IMAGE_PATH))
    // The caret is in the caption: the align still has to reach the image.
    expect(editor.exec(setImageAlign('right'))).toBe(true)
    expect(editor.state.doc.child(1).child(0).attrs.align).toBe('right')
    editor.destroy()
  })
})

describe('image toolbar', () => {
  const openToolbar = (options: Record<string, unknown> = {}) => {
    const context = withImage(options)
    const toolbar = createImageToolbar(context.editor, context.controller, {
      container: context.container,
    })
    const img = context.host.querySelector('img')
    if (img) stubRect(img, { left: 20, top: 40, width: 400, height: 300 })
    stubRect(context.container, { left: 0, top: 0, width: 800, height: 600 })
    toolbar.refresh()
    const item = (name: string) =>
      toolbar.element.querySelector<HTMLElement>(`[data-trevixal-item="${name}"]`)
    return { ...context, toolbar, item, img }
  }

  it('appears for a selected image and hides when the caret moves away', () => {
    const { editor, toolbar } = openToolbar()
    expect(toolbar.element.hidden).toBe(false)
    // Back into the paragraph above: no image is selected any more.
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 0))))
    expect(toolbar.element.hidden).toBe(true)
    toolbar.destroy()
    editor.destroy()
  })

  it('hides while the selection is not on an image', () => {
    const { editor, container, controller } = setup()
    const toolbar = createImageToolbar(editor, controller, { container })
    expect(toolbar.element.hidden).toBe(true)
    toolbar.destroy()
    editor.destroy()
  })

  it('positions itself above the image inside the container', () => {
    const { toolbar, editor } = openToolbar()
    expect(toolbar.element.style.left).toBe('20px')
    expect(toolbar.element.style.top).toBe('32px')
    toolbar.destroy()
    editor.destroy()
  })

  it('sizes the alt field to the text it holds, between a floor and a ceiling', () => {
    const { editor, toolbar, item } = openToolbar()
    const alt = item('alt') as HTMLInputElement
    // Short text still leaves a usable field rather than collapsing to it.
    expect(alt.value).toBe('A cat')
    expect(alt.size).toBe(12)

    // An uploaded image starts out described by its file name, which is what
    // used to be clipped by a fixed width. The field now grows to hold it.
    const name = 'lord-krishna-3840x2160-8f3c1a9b.png'
    editor.exec(setImageAlt(name, IMAGE_PATH))
    expect(alt.value).toBe(name)
    expect(alt.size).toBe(name.length + 1)

    // But not without limit: one long name must not push every other control
    // off the bar.
    editor.exec(setImageAlt('x'.repeat(300), IMAGE_PATH))
    expect(alt.size).toBe(44)
    toolbar.destroy()
    editor.destroy()
  })

  it('keeps a bar wider than its room from hanging off the container', () => {
    const { editor, toolbar, img } = openToolbar()
    // An image near the right margin, and a bar too wide to start beside it.
    if (img) stubRect(img, { left: 700, top: 40, width: 90, height: 60 })
    Object.defineProperty(toolbar.element, 'offsetWidth', { value: 600, configurable: true })
    toolbar.refresh()
    // 800 wide container less a 600 wide bar: 200 is as far right as it goes.
    expect(toolbar.element.style.left).toBe('200px')
    toolbar.destroy()
    editor.destroy()
  })

  it('marks the selected image so the stylesheet can outline it', () => {
    const { toolbar, img, editor } = openToolbar()
    expect(img?.getAttribute('data-trevixal-selected')).toBe('true')
    toolbar.destroy()
    expect(img?.getAttribute('data-trevixal-selected')).toBeNull()
    editor.destroy()
  })

  it('dispatches alignment and reflects it as aria-pressed', () => {
    const { editor, toolbar, item } = openToolbar()
    item('align-right')?.click()
    expect(editor.state.doc.child(1).attrs.align).toBe('right')
    expect(item('align-right')?.getAttribute('aria-pressed')).toBe('true')
    expect(item('align-left')?.getAttribute('aria-pressed')).toBe('false')
    toolbar.destroy()
    editor.destroy()
  })

  it('applies a size preset to the image width', () => {
    const { editor, toolbar, item } = openToolbar()
    item('size-50%')?.click()
    expect(editor.state.doc.child(1).attrs.width).toBe('50%')
    toolbar.destroy()
    editor.destroy()
  })

  it('offers the size presets the host asked for', () => {
    const context = withImage()
    const toolbar = createImageToolbar(context.editor, context.controller, {
      container: context.container,
      sizes: ['200px'],
    })
    expect(toolbar.element.querySelector('[data-trevixal-item="size-200px"]')).not.toBeNull()
    expect(toolbar.element.querySelector('[data-trevixal-item="size-50%"]')).toBeNull()
    toolbar.destroy()
    context.editor.destroy()
  })

  it('commits the alt field on Enter', () => {
    const { editor, toolbar, item } = openToolbar()
    const input = item('alt') as HTMLInputElement
    expect(input.value).toBe('A cat')
    input.value = 'A cat asleep'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(editor.state.doc.child(1).attrs.alt).toBe('A cat asleep')
    toolbar.destroy()
    editor.destroy()
  })

  it('toggles a caption and shows it as pressed', () => {
    const { editor, toolbar, item } = openToolbar()
    item('caption')?.click()
    expect(editor.state.doc.child(1).type.name).toBe('figure')
    expect(item('caption')?.getAttribute('aria-pressed')).toBe('true')
    item('caption')?.click()
    expect(editor.state.doc.child(1).type.name).toBe('image')
    toolbar.destroy()
    editor.destroy()
  })

  it('deletes the image', () => {
    const { editor, toolbar, item } = openToolbar()
    item('delete')?.click()
    expect(editor.state.doc.childCount).toBe(1)
    expect(toolbar.element.hidden).toBe(true)
    toolbar.destroy()
    editor.destroy()
  })

  it('rotates through the controller', async () => {
    stubFetch()
    const transformer = fakeTransformer()
    const { editor, toolbar, item } = openToolbar({ transformer })
    item('rotate-right')?.click()
    await settle()
    expect(transformer.mock.calls[0]?.[1].rotate).toBe(90)
    toolbar.destroy()
    editor.destroy()
  })

  it('opens a crop overlay and applies the rectangle as fractions', () => {
    const { editor, toolbar, item, controller, container } = openToolbar()
    const applied = vi.spyOn(controller, 'transform').mockResolvedValue(true)
    item('crop')?.click()
    const overlay = container.querySelector('.trevixal-image-crop')
    expect(overlay).not.toBeNull()
    expect(overlay?.querySelectorAll('.trevixal-image-crop__handle')).toHaveLength(8)
    container
      .querySelector<HTMLElement>('[data-trevixal-item="crop-apply"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(applied).toHaveBeenCalledWith({ crop: { x: 0, y: 0, width: 1, height: 1 } }, IMAGE_PATH)
    expect(container.querySelector('.trevixal-image-crop')).toBeNull()
    toolbar.destroy()
    editor.destroy()
  })

  it('closes the crop overlay on cancel without transforming', () => {
    const { editor, toolbar, item, controller, container } = openToolbar()
    const applied = vi.spyOn(controller, 'transform')
    item('crop')?.click()
    container
      .querySelector<HTMLElement>('[data-trevixal-item="crop-cancel"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(container.querySelector('.trevixal-image-crop')).toBeNull()
    expect(applied).not.toHaveBeenCalled()
    toolbar.destroy()
    editor.destroy()
  })

  it('keeps the selection when a control is pressed', () => {
    const { editor, toolbar, item } = openToolbar()
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    item('align-left')?.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    toolbar.destroy()
    editor.destroy()
  })
})

describe('image resize handles', () => {
  const openHandles = (options: { minWidth?: number } = {}) => {
    const context = withImage()
    const sizes: { width: number; height: number }[] = []
    const handles = createImageResizeHandles(context.editor, {
      container: context.container,
      onResize: (size) => sizes.push(size),
      ...options,
    })
    const img = context.host.querySelector('img')
    if (img) stubRect(img, { left: 0, top: 0, width: 400, height: 300 })
    stubRect(context.container, { left: 0, top: 0, width: 800, height: 600 })
    handles.refresh()
    const grip = (corner: string) =>
      context.container.querySelector<HTMLElement>(`[data-trevixal-handle="${corner}"]`)
    return { ...context, handles, grip, sizes, img }
  }

  it('shows four corner handles for the selected image', () => {
    const { container, handles, editor } = openHandles()
    const grips = container.querySelectorAll<HTMLElement>('.trevixal-image-handles__handle')
    expect(grips).toHaveLength(4)
    expect([...grips].every((grip) => !grip.hidden)).toBe(true)
    handles.destroy()
    editor.destroy()
  })

  it('hides the handles when no image is selected', () => {
    const { editor, container, controller } = setup()
    const handles = createImageResizeHandles(editor, { container })
    const grips = container.querySelectorAll<HTMLElement>('.trevixal-image-handles__handle')
    expect([...grips].every((grip) => grip.hidden)).toBe(true)
    handles.destroy()
    controller.destroy()
    editor.destroy()
  })

  it('positions the handles on the image corners', () => {
    const { grip, handles, editor } = openHandles()
    expect(grip('nw')?.style.left).toBe('-5px')
    expect(grip('se')?.style.left).toBe('395px')
    expect(grip('se')?.style.top).toBe('295px')
    handles.destroy()
    editor.destroy()
  })

  it('commits a proportional resize on release', () => {
    const { editor, grip, handles, sizes } = openHandles()
    grip('se')?.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300 }))
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 500, clientY: 300 }))
    document.dispatchEvent(new PointerEvent('pointerup', { clientX: 500, clientY: 300 }))
    const node = editor.state.doc.child(1)
    expect(node.attrs.width).toBe('500px')
    expect(node.attrs.height).toBe('375px')
    expect(sizes.at(-1)).toEqual({ width: 500, height: 375 })
    handles.destroy()
    editor.destroy()
  })

  it('follows the pointer freely while Shift is held', () => {
    const { editor, grip, handles } = openHandles()
    grip('se')?.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300 }))
    document.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 500, clientY: 400, shiftKey: true }),
    )
    document.dispatchEvent(new PointerEvent('pointerup', { clientX: 500, clientY: 400 }))
    const node = editor.state.doc.child(1)
    expect(node.attrs.width).toBe('500px')
    expect(node.attrs.height).toBe('400px')
    handles.destroy()
    editor.destroy()
  })

  it('never grows an image past the container it sits in', () => {
    const { editor, grip, handles } = openHandles()
    grip('se')?.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300 }))
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 4000, clientY: 300 }))
    document.dispatchEvent(new PointerEvent('pointerup', { clientX: 4000, clientY: 300 }))
    expect(editor.state.doc.child(1).attrs.width).toBe('800px')
    handles.destroy()
    editor.destroy()
  })

  it('stops shrinking at the minimum width', () => {
    const { editor, grip, handles } = openHandles({ minWidth: 100 })
    grip('se')?.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300 }))
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 300 }))
    document.dispatchEvent(new PointerEvent('pointerup', { clientX: 0, clientY: 300 }))
    expect(editor.state.doc.child(1).attrs.width).toBe('100px')
    handles.destroy()
    editor.destroy()
  })

  it('leaves the document alone when the handle is only clicked', () => {
    const { editor, grip, handles } = openHandles()
    const before = editor.getJSON()
    grip('se')?.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300 }))
    document.dispatchEvent(new PointerEvent('pointerup', { clientX: 400, clientY: 300 }))
    expect(editor.getJSON()).toEqual(before)
    handles.destroy()
    editor.destroy()
  })

  it('drops its preview style once the resize is committed', () => {
    const { editor, grip, handles, img } = openHandles()
    grip('se')?.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300 }))
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 500, clientY: 300 }))
    expect(img?.style.width).toBe('500px')
    document.dispatchEvent(new PointerEvent('pointerup', { clientX: 500, clientY: 300 }))
    expect(img?.getAttribute('style')).toBeNull()
    handles.destroy()
    editor.destroy()
  })
})
