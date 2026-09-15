import type { Editor, EditorNode } from '@trevixal/core'
import { escapeHTML } from '@trevixal/core'

/**
 * What the editor draws that the document does not hold.
 *
 * Syntax highlighting is a decoration layer and a diagram preview is an
 * element the renderer appends inside the block: both live in the rendered
 * DOM and neither is in the model. A document serialized straight from the
 * model therefore exports code with no colour in it and a diagram as the
 * source text that describes it, which is what every export, printout and
 * Word file was doing.
 *
 * These are read back off the live editor rather than recomputed here. That
 * keeps the kit free of any opinion about which highlighter or diagram
 * renderer the host installed, and it picks up the colours the active theme
 * actually resolved to rather than a second guess at them.
 */

/** A run of code text, with the colour and weight the editor drew it in. */
export interface RenderedRun {
  readonly text: string
  /** `#rrggbb`, or absent for text drawn in the block's own colour. */
  readonly color?: string
  readonly bold?: boolean
  readonly italic?: boolean
}

/** A picture of something the document only describes in words. */
export interface RenderedImage {
  /** The SVG as the editor drew it, for formats that can carry markup. */
  readonly markup: string
  /** The same picture as a PNG data URL, for formats that cannot. */
  readonly src?: string
  readonly width: number
  readonly height: number
  readonly alt: string
}

/** What the editor drew for one block beyond what the block itself says. */
export interface RenderedBlock {
  readonly runs?: readonly RenderedRun[]
  readonly image?: RenderedImage
}

/**
 * Keyed by the model node, so a writer can ask about the block it is halfway
 * through emitting. The nodes are the editor's own, which is why this is
 * captured per export rather than cached: a node is replaced on every edit
 * that touches it.
 */
export type RenderedDocument = ReadonlyMap<EditorNode, RenderedBlock>

/** Class the diagram extension gives the preview it appends into a block. */
const DIAGRAM = '.trevixal-diagram'

/** How much bigger than the screen a rasterized diagram is drawn. */
const RASTER_SCALE = 2

/**
 * Read back what the editor drew for every code block in the document.
 *
 * Synchronous, so the print path, which has to build a page inside a click
 * handler, can use it too. Turning a diagram into a bitmap cannot be, and is
 * {@link rasterizeDiagrams}, a separate step for the formats that need one.
 */
export function captureRenderedBlocks(editor: Editor): RenderedDocument {
  const view = editor.view
  const captured = new Map<EditorNode, RenderedBlock>()
  if (!view) return captured
  for (const pre of view.dom.querySelectorAll('pre')) {
    const node = view.renderer.modelOf.get(pre)
    if (!node) continue
    const block: { runs?: RenderedRun[]; image?: RenderedImage } = {}
    const code = pre.querySelector('code')
    if (code) {
      const runs = runsOf(code)
      // One plain run is what an unhighlighted block looks like; recording it
      // would only make every writer do more work to reach the same output.
      if (runs.some((run) => run.color || run.bold || run.italic)) block.runs = runs
    }
    const image = imageOf(pre)
    if (image) block.image = image
    if (block.runs || block.image) captured.set(node, block)
  }
  return captured
}

/**
 * Add a PNG to every captured diagram, for the formats that cannot take SVG.
 *
 * A diagram that will not draw is left with its markup alone rather than
 * failing the export: an SVG can reference a font or an image the canvas
 * refuses, and losing one picture is better than losing the file.
 */
export async function rasterizeDiagrams(
  rendered: RenderedDocument,
  document: Document,
): Promise<RenderedDocument> {
  const out = new Map(rendered)
  await Promise.all(
    [...rendered].map(async ([node, block]) => {
      if (!block.image || block.image.src) return
      const src = await toPNG(block.image, document)
      if (src) out.set(node, { ...block, image: { ...block.image, src } })
    }),
  )
  return out
}

/**
 * The markup an exported page should carry for a block, or null to leave the
 * schema's own rendering alone. Pass it to `serializeToHTMLDocument`.
 */
export function renderedNodeHTML(rendered: RenderedDocument): (node: EditorNode) => string | null {
  return (node: EditorNode): string | null => {
    const block = rendered.get(node)
    if (!block) return null
    // A drawn diagram stands on its own. The source beside it is the
    // instruction that produced the picture, not a second way of reading the
    // document, printing both says the same thing twice and leaves the page
    // with a code block and a figure fighting over the same width.
    if (block.image) {
      return `<figure class="trevixal-diagram" role="img" aria-label="${escapeHTML(
        block.image.alt,
      )}">${block.image.markup}</figure>`
    }
    const language = typeof node.attrs.language === 'string' ? node.attrs.language : null
    const attrs = language ? ` data-language="${escapeHTML(language)}"` : ''
    return `<pre${attrs}><code>${
      block.runs ? block.runs.map(runHTML).join('') : escapeHTML(node.textContent)
    }</code></pre>`
  }
}

function runHTML(run: RenderedRun): string {
  const style = [
    run.color ? `color:${run.color}` : '',
    run.bold ? 'font-weight:600' : '',
    run.italic ? 'font-style:italic' : '',
  ]
    .filter(Boolean)
    .join(';')
  const text = escapeHTML(run.text)
  // Written as inline style rather than as the highlighter's class: the class
  // only means anything if the rules defining it were collected as well, and
  // those belong to the host rather than to the kit.
  return style ? `<span style="${style}">${text}</span>` : text
}

/** The code's text split at every element boundary the highlighter drew. */
function runsOf(code: Element): RenderedRun[] {
  const runs: RenderedRun[] = []
  const walk = (parent: Element): void => {
    for (const child of parent.childNodes) {
      if (child.nodeType === child.TEXT_NODE) {
        const text = child.textContent ?? ''
        if (text) runs.push(styleOf(parent, text))
        continue
      }
      if (child instanceof Element) walk(child)
    }
  }
  walk(code)
  return merge(runs)
}

function styleOf(element: Element, text: string): RenderedRun {
  const view = element.ownerDocument.defaultView
  const style = view?.getComputedStyle(element)
  if (!style) return { text }
  const color = hexOf(style.color)
  return {
    text,
    // The block's own colour is not highlighting, and repeating it on every
    // run would override a themed `<pre>` in Word with the editor's ink.
    ...(color && !isBlockColor(element, color) ? { color } : {}),
    ...(Number(style.fontWeight) >= 600 ? { bold: true } : {}),
    ...(style.fontStyle === 'italic' ? { italic: true } : {}),
  }
}

/** Whether a run is drawn in the same colour as the block around it. */
function isBlockColor(element: Element, color: string): boolean {
  const pre = element.closest('pre')
  const view = element.ownerDocument.defaultView
  if (!pre || !view) return false
  return hexOf(view.getComputedStyle(pre).color) === color
}

/** Adjacent runs that look the same are one run. */
function merge(runs: readonly RenderedRun[]): RenderedRun[] {
  const out: RenderedRun[] = []
  for (const run of runs) {
    const last = out[out.length - 1]
    if (last && last.color === run.color && last.bold === run.bold && last.italic === run.italic) {
      out[out.length - 1] = { ...last, text: last.text + run.text }
      continue
    }
    out.push(run)
  }
  return out
}

/** `rgb(1, 2, 3)`: what a computed colour always is, as `#010203`. */
function hexOf(value: string): string | undefined {
  const parts = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(value)
  if (!parts) return undefined
  const channel = (index: number): string =>
    Math.max(0, Math.min(255, Math.round(Number(parts[index]))))
      .toString(16)
      .padStart(2, '0')
  return `#${channel(1)}${channel(2)}${channel(3)}`
}

/** The diagram a block previews, if its renderer has drawn one. */
function imageOf(pre: Element): RenderedImage | null {
  const svg = pre.querySelector(`${DIAGRAM} svg`)
  if (!svg) return null
  const box = svg.getBoundingClientRect()
  const width = Math.round(box.width) || 640
  const height = Math.round(box.height) || 360
  const clone = svg.cloneNode(true) as SVGElement
  // The live element is sized by CSS; a copy of it has to say how big it is,
  // or it draws at whatever the next context happens to offer.
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  clone.removeAttribute('style')
  const markup = new XMLSerializer().serializeToString(clone)
  const alt = pre.querySelector('code')?.textContent?.trim().split('\n')[0] ?? 'Diagram'
  return { markup, width, height, alt }
}

/** Draw an SVG onto a canvas and read it back as a PNG data URL. */
async function toPNG(image: RenderedImage, document: Document): Promise<string | undefined> {
  const view = document.defaultView
  if (!view) return undefined
  try {
    const source = `data:image/svg+xml;base64,${base64(image.markup, view)}`
    const element = new view.Image()
    element.src = source
    await element.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width * RASTER_SCALE
    canvas.height = image.height * RASTER_SCALE
    const context = canvas.getContext('2d')
    if (!context) return undefined
    // A diagram is drawn in ink alone, so on a dark page it would otherwise
    // be pasted onto transparency and disappear against the paper.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(element, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } catch {
    return undefined
  }
}

/** `btoa` takes bytes, and the markup is text that may not be Latin-1. */
function base64(text: string, view: Window): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return view.btoa(binary)
}
