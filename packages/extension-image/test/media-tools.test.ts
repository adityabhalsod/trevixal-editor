// @vitest-environment happy-dom
import {
  type EditorNode,
  EditorState,
  Fragment,
  NodeSelection,
  Schema,
  createEditor,
  defaultMarks,
  defaultNodes,
  parseHTML,
  serializeToHTML,
} from '@trevixal/core'
import { describe, expect, it, vi } from 'vitest'
import {
  type DrawingData,
  drawMarkup,
  drawingSVG,
  galleryAt,
  imageNodes,
  insertDrawing,
  insertImage,
  makeGallery,
  needsAltText,
  parseDrawing,
  promptForAltText,
  sanitizeSVG,
  setGalleryColumns,
  setImageDecorative,
  unwrapGallery,
  updateDrawing,
} from '../src'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...imageNodes() },
  marks: defaultMarks(),
})

const image = (src: string, alt = ''): EditorNode => schema.node('image', { src, alt })
const p = (text = ''): EditorNode =>
  schema.node('paragraph', undefined, text ? [schema.text(text)] : [])
const docOf = (...blocks: EditorNode[]): EditorNode =>
  schema.node('doc', undefined, Fragment.from(blocks))

function selected(doc: EditorNode, path: number[]): EditorState {
  return EditorState.create({ schema, doc, selection: new NodeSelection(path) })
}

describe('galleries', () => {
  const photos = () =>
    docOf(p('before'), image('https://x.test/a.png'), image('https://x.test/b.png'), p('after'))

  it('gathers an image and the ones beside it into a gallery', () => {
    const tr = makeGallery()(selected(photos(), [1]))
    const doc = tr?.doc as EditorNode
    expect(doc.child(1).type.name).toBe('gallery')
    expect(doc.child(1).childCount).toBe(2)
    expect(doc.childCount).toBe(3)
    const html = serializeToHTML(doc)
    expect(html).toContain('class="trevixal-gallery" data-gallery="" data-columns="3"')
    expect(parseHTML(schema, html).child(1).type.name).toBe('gallery')
  })

  it('changes its columns, and lets its images out again', () => {
    const state = selected(photos(), [1])
    const galleried = state.apply(
      makeGallery()(state) as NonNullable<ReturnType<ReturnType<typeof makeGallery>>>,
    )
    const inside = galleried.apply(galleried.tr.setSelection(new NodeSelection([1, 0])))
    expect(galleryAt(inside)?.path).toEqual([1])
    const wider = inside.apply(
      setGalleryColumns(4)(inside) as NonNullable<ReturnType<ReturnType<typeof setGalleryColumns>>>,
    )
    expect(wider.doc.child(1).attrs.columns).toBe(4)
    expect(setGalleryColumns(9)(wider)).toBeNull()
    const out = wider.apply(unwrapGallery(wider) as NonNullable<ReturnType<typeof unwrapGallery>>)
    expect(out.doc.content.children.map((node) => node.type.name)).toEqual([
      'paragraph',
      'image',
      'image',
      'paragraph',
    ])
  })

  it('declines where there is no image', () => {
    const state = EditorState.create({ schema, doc: photos() })
    expect(makeGallery()(state)).toBeNull()
  })
})

describe('alt text', () => {
  it('knows which images still want it', () => {
    expect(needsAltText(image('https://x.test/a.png'))).toBe(true)
    expect(needsAltText(image('https://x.test/a.png', 'IMG_2044.JPG'))).toBe(true)
    expect(needsAltText(image('https://x.test/a.png', 'A hall set out for a talk'))).toBe(false)
    expect(
      needsAltText(schema.node('image', { src: 'https://x.test/a.png', decorative: true })),
    ).toBe(false)
  })

  it('marks an image decorative, which writes it with no alt text', () => {
    const state = selected(docOf(image('https://x.test/a.png', 'Old words')), [0])
    const next = state.apply(
      setImageDecorative(true)(state) as NonNullable<
        ReturnType<ReturnType<typeof setImageDecorative>>
      >,
    )
    const html = serializeToHTML(next.doc)
    expect(html).toContain('alt=""')
    expect(html).toContain('data-decorative')
    expect(parseHTML(schema, html).child(0).attrs.decorative).toBe(true)
  })

  it('asks once for an image that arrives without a description', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createEditor({ schema, doc: docOf(p('x')), element: host })
    const ask = vi.fn()
    const dispose = promptForAltText(editor, ask)
    // An image with a source arriving, as an insert or a finished upload does.
    editor.exec(insertImage({ src: 'https://x.test/new.png' }))
    expect(ask).toHaveBeenCalledTimes(1)
    expect(ask).toHaveBeenCalledWith([1])
    // One that is described already asks nothing.
    editor.exec(insertImage({ src: 'https://x.test/two.png', alt: 'A second photo' }))
    expect(ask).toHaveBeenCalledTimes(1)
    dispose()
    editor.destroy()
  })
})

describe('SVG uploads', () => {
  it('keeps the picture and drops everything that could run or reach out', () => {
    const dirty =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" onload="alert(1)">' +
      '<script>alert(2)</script><rect width="10" height="10" fill="red" onclick="alert(3)"/>' +
      '<foreignObject><div>x</div></foreignObject>' +
      '<a href="javascript:alert(4)"><circle r="3"/></a>' +
      '<use href="#dot"/><use xlink:href="https://evil.test/x.svg#a"/>' +
      '<animate attributeName="href" to="javascript:alert(5)"/></svg>'
    const clean = sanitizeSVG(dirty)
    expect(clean).toContain('<rect')
    expect(clean).toContain('fill="red"')
    expect(clean).toContain('href="#dot"')
    for (const bad of [
      'script',
      'onload',
      'onclick',
      'foreignObject',
      'javascript:',
      'evil.test',
      'animate',
    ]) {
      expect(clean).not.toContain(bad)
    }
  })

  it('refuses something that is not an SVG', () => {
    expect(() => sanitizeSVG('<html><body>hi</body></html>')).toThrow('Not a valid SVG image')
  })
})

describe('drawings', () => {
  const data: DrawingData = {
    width: 200,
    height: 100,
    shapes: [
      {
        kind: 'pen',
        color: '#1f2937',
        width: 3,
        points: [
          [10, 10],
          [20, 25],
          [30, 20],
        ],
      },
      { kind: 'arrow', color: '#dc2626', width: 2, x1: 40, y1: 40, x2: 120, y2: 60 },
      { kind: 'text', color: '#2563eb', width: 3, x1: 50, y1: 80, text: 'Stage <left>' },
    ],
  }

  it('draws its shapes as SVG, text escaped', () => {
    const svg = drawingSVG(data)
    expect(svg).toContain('viewBox="0 0 200 100"')
    expect(svg).toContain('<path')
    expect(svg).toContain('<polygon')
    expect(svg).toContain('Stage &lt;left&gt;')
  })

  it('reads a stored drawing back with every value checked', () => {
    expect(parseDrawing(JSON.stringify(data))).toEqual(data)
    const hostile = JSON.stringify({
      width: 100,
      height: 50,
      shapes: [
        { kind: 'script', color: '#000', width: 1, x1: 0, y1: 0 },
        { kind: 'rect', color: 'url(javascript:alert(1))', width: 1, x1: 0, y1: 0, x2: 5, y2: 5 },
        { kind: 'line', color: '#000', width: 1, x1: 0, y1: 0, x2: 'x', y2: 5 },
        { kind: 'rect', color: '#000', width: 1, x1: 0, y1: 0, x2: 5, y2: 5 },
      ],
    })
    expect(parseDrawing(hostile)?.shapes).toHaveLength(1)
    expect(parseDrawing('not json')).toBeNull()
  })

  it('goes in as a block and keeps its shapes through HTML', () => {
    const state = EditorState.create({ schema, doc: docOf(p('x')) })
    const withDrawing = state.apply(
      insertDrawing(data)(state) as NonNullable<ReturnType<ReturnType<typeof insertDrawing>>>,
    )
    expect(withDrawing.doc.child(1).type.name).toBe('drawing')
    const html = serializeToHTML(withDrawing.doc)
    expect(html).toContain('class="trevixal-drawing"')
    const back = parseHTML(schema, html)
    expect(parseDrawing(back.child(1).attrs.data)).toEqual(data)
    const cleared = updateDrawing([1], { ...data, shapes: [] })(withDrawing)
    expect(parseDrawing(cleared?.doc.child(1).attrs.data)?.shapes).toEqual([])
  })
})

describe('image markup', () => {
  it('draws boxes, arrows and text, and a blur as a mosaic', () => {
    const calls: string[] = []
    const context = new Proxy(
      { canvas: {} },
      {
        get: (target, name) =>
          name in target
            ? (target as Record<string | symbol, unknown>)[name]
            : (...args: unknown[]) => calls.push(`${String(name)}(${args.length})`),
        set: () => true,
      },
    ) as unknown as CanvasRenderingContext2D
    const scratch = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => calls.push('scratch') }),
    }
    drawMarkup(
      context,
      [
        { kind: 'rect', color: '#f00', width: 3, x1: 0, y1: 0, x2: 50, y2: 20 },
        { kind: 'arrow', color: '#f00', width: 3, x1: 0, y1: 0, x2: 50, y2: 20 },
        { kind: 'text', color: '#f00', width: 3, x1: 5, y1: 5, x2: 5, y2: 5, text: 'Here' },
        { kind: 'blur', color: '#f00', width: 3, x1: 10, y1: 10, x2: 70, y2: 40 },
      ],
      () => scratch as unknown as HTMLCanvasElement,
    )
    expect(calls).toContain('strokeRect(4)')
    expect(calls).toContain('fillText(3)')
    expect(calls).toContain('scratch')
    expect(calls.filter((call) => call === 'drawImage(9)')).toHaveLength(1)
  })
})
