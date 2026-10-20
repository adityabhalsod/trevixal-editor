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

/** A side of a box, as the page has it: `left` is the left in either direction. */
export type RenderedSide = 'top' | 'right' | 'bottom' | 'left'

/** The lines the stylesheet draws round a block: a callout's edge, a card's frame. */
export interface RenderedBorder {
  /** `#rrggbb`. */
  readonly color: string
  /** In CSS pixels. */
  readonly width: number
  readonly sides: readonly RenderedSide[]
}

/** The ground and lines the stylesheet gives a block. */
export interface RenderedBox {
  /** `#rrggbb` behind the block, absent where the page shows through. */
  readonly fill?: string
  readonly border?: RenderedBorder
}

/**
 * How the stylesheet sets a node's text where it differs from what holds the
 * node: a finished task struck through, a toggle's summary bold, a footnote's
 * marker raised. Each field is only present where it differs.
 */
export interface RenderedLook {
  /** `#rrggbb`. */
  readonly color?: string
  /** `#rrggbb` behind an inline atom: a badge's pill, a field's box. */
  readonly fill?: string
  readonly bold?: boolean
  readonly italic?: boolean
  readonly strike?: boolean
  readonly underline?: boolean
  /** Raised, as a superscript is. */
  readonly raised?: boolean
  /** Its size against what holds it: 0.75 is three quarters. */
  readonly scale?: number
  /** The side of the page its lines line up on, where it differs. */
  readonly align?: 'left' | 'center' | 'right'
  /** Text the stylesheet writes before and after it: a footnote marker's brackets. */
  readonly before?: string
  readonly after?: string
}

/** A code line the editor marks: its number in the gutter, or its band. */
export interface RenderedLine {
  /** The line, counted from 1. */
  readonly line: number
  /** The marker's classes, for a page that has the stylesheet drawing them. */
  readonly className: string
  /** `#rrggbb` the line is banded in: picked out, added, removed. */
  readonly band?: string
}

/** What the editor drew for one block beyond what the block itself says. */
export interface RenderedBlock {
  readonly runs?: readonly RenderedRun[]
  readonly image?: RenderedImage
  readonly box?: RenderedBox
  readonly look?: RenderedLook
  /** A code block's marked lines, where any is. */
  readonly lines?: readonly RenderedLine[]
}

/** What to read off the editor besides its code. */
export interface CaptureOptions {
  /**
   * Also read what a format without the stylesheet needs to be told: each
   * block's and inline atom's look and box, and a picture of each drawing
   * and SVG image. That walks the whole document, so the pages that carry
   * the stylesheet themselves (a web page, a print, the preview) leave it off.
   */
  readonly looks?: boolean
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
 * What a code block's own markup says of how it is shown that a saved page
 * can still show: its language, its link target, its long lines wrapped, its
 * title, and the lines it numbers and picks out, whose markers go in with it
 * (see {@link renderedNodeHTML}). A fold has no bar on a page to open it.
 */
const KEPT_CODE_ATTRIBUTES = [
  'data-language',
  'id',
  'data-wrap',
  'data-title',
  'data-line-numbers',
  'data-highlight-lines',
] as const

/** The markers `@trevixal/extension-code-highlight` puts at a code line's start. */
const CODE_LINE = '.trevixal-code-line[data-line]'

/**
 * Read back what the editor drew for every code block in the document, and
 * with `looks`, how it draws everything else a stylesheet-less format needs.
 *
 * Synchronous, so the print path, which has to build a page inside a click
 * handler, can use it too. Turning a diagram into a bitmap cannot be, and is
 * {@link rasterizeDiagrams}, a separate step for the formats that need one.
 */
export function captureRenderedBlocks(
  editor: Editor,
  options: CaptureOptions = {},
): RenderedDocument {
  const view = editor.view
  const captured = new Map<EditorNode, RenderedBlock>()
  if (!view) return captured
  for (const pre of view.dom.querySelectorAll('pre')) {
    const node = view.renderer.modelOf.get(pre)
    if (!node) continue
    const block: { runs?: RenderedRun[]; image?: RenderedImage; lines?: RenderedLine[] } = {}
    const code = pre.querySelector('code')
    if (code) {
      const runs = runsOf(code)
      // One plain run is what an unhighlighted block looks like; recording it
      // would only make every writer do more work to reach the same output.
      if (runs.some((run) => run.color || run.bold || run.italic)) block.runs = runs
    }
    const image = imageOf(pre)
    if (image) block.image = image
    const lines = linesOf(pre)
    if (lines.length > 0) block.lines = lines
    if (block.runs || block.image || block.lines) captured.set(node, block)
  }
  if (options.looks) {
    captureLooks(view.dom, view.renderer.modelOf, captured)
    capturePictures(view.dom, view.renderer.modelOf, captured)
  }
  return captured
}

/** Each marked line of a code block, with the band its marker paints. */
function linesOf(pre: Element): RenderedLine[] {
  const view = pre.ownerDocument.defaultView
  const ground = view ? colorOf(view.getComputedStyle(pre).backgroundColor) : null
  return [...pre.querySelectorAll<HTMLElement>(CODE_LINE)].flatMap((marker) => {
    const line = Number(marker.dataset.line)
    if (!Number.isInteger(line) || line < 1) return []
    const fill = view ? colorOf(view.getComputedStyle(marker).backgroundColor) : null
    // A band is a tint over the block's ground: what a format without
    // transparency needs is the two mixed.
    const band = fill && fill.a > 0 ? hexOfColor(mix(fill, ground ?? OPAQUE_WHITE)) : undefined
    return [{ line, className: marker.className, ...(band ? { band } : {}) }]
  })
}

/** An RGB colour and its opacity, 0 to 1. */
interface Color {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number
}

const OPAQUE_WHITE: Color = { r: 255, g: 255, b: 255, a: 1 }

/** `rgb()`/`rgba()`, what a computed colour always is; null for anything else. */
function colorOf(value: string): Color | null {
  const parts = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?/.exec(value)
  if (!parts) return null
  const alpha = parts[4]
  const a =
    alpha === undefined ? 1 : alpha.endsWith('%') ? Number.parseFloat(alpha) / 100 : Number(alpha)
  return { r: Number(parts[1]), g: Number(parts[2]), b: Number(parts[3]), a }
}

/** `over` painted on `under`, as the screen shows it. */
function mix(over: Color, under: Color): Color {
  const blend = (top: number, bottom: number): number => top * over.a + bottom * (1 - over.a)
  return { r: blend(over.r, under.r), g: blend(over.g, under.g), b: blend(over.b, under.b), a: 1 }
}

function hexOfColor(color: Color): string {
  const channel = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0')
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`
}

/**
 * States the stylesheet paints that belong to the editor, not the document:
 * a selected cell, a note just jumped to. Their fill is not read.
 */
const TRANSIENT =
  ':target, .trevixal-cell--selected, .trevixal-cell--range, [data-trevixal-selected]'

/** The model's elements, keyed back to their nodes. */
type ModelOf = { get(element: globalThis.Node): EditorNode | undefined }

/** Record `part` for `node`, beside whatever is already captured for it. */
function record(captured: Map<EditorNode, RenderedBlock>, node: EditorNode, part: RenderedBlock) {
  captured.set(node, { ...captured.get(node), ...part })
}

/**
 * How the stylesheet draws each block and inline atom, against the node
 * holding it: a format that carries no stylesheet is written from this.
 * Headings and code are left to the writers' own styles for them.
 */
function captureLooks(
  root: HTMLElement,
  modelOf: ModelOf,
  captured: Map<EditorNode, RenderedBlock>,
): void {
  const view = root.ownerDocument.defaultView
  if (!view) return
  const visit = (parent: Element, holder: CSSStyleDeclaration, ground: Color): void => {
    for (const element of parent.children) {
      const node = modelOf.get(element)
      if (!node || node.isText) {
        visit(element, holder, ground)
        continue
      }
      const style = view.getComputedStyle(element)
      const fill = element.matches(TRANSIENT) ? null : colorOf(style.backgroundColor)
      const painted = fill && fill.a > 0 ? mix(fill, ground) : null
      const part: { look?: RenderedLook; box?: RenderedBox } = {}
      const look = lookOf(element, node, style, holder, painted)
      if (look) part.look = look
      if (!node.isInline) {
        const border = borderOf(style)
        if (painted || border) {
          part.box = {
            ...(painted ? { fill: hexOfColor(painted) } : {}),
            ...(border ? { border } : {}),
          }
        }
      }
      if (part.look || part.box) record(captured, node, part)
      visit(element, style, painted ?? ground)
    }
  }
  visit(root, view.getComputedStyle(root), groundOf(root))
}

/** The colour showing behind an element: the nearest one painted, else white. */
function groundOf(element: Element): Color {
  const view = element.ownerDocument.defaultView
  for (let at: Element | null = element; at && view; at = at.parentElement) {
    const color = colorOf(view.getComputedStyle(at).backgroundColor)
    if (color && color.a > 0)
      return color.a < 1 ? mix(color, groundOf(at.parentElement ?? at)) : color
  }
  return OPAQUE_WHITE
}

/** Bold from this weight up, as the writers' formats draw it. */
const BOLD_WEIGHT = 600

/** A size within this of what holds it is the same size. */
const SAME_SIZE = 0.02

function lookOf(
  element: Element,
  node: EditorNode,
  style: CSSStyleDeclaration,
  holder: CSSStyleDeclaration,
  fill: Color | null,
): RenderedLook | null {
  const name = node.type.name
  if (name === 'heading') return null
  const look: {
    -readonly [K in keyof RenderedLook]: RenderedLook[K]
  } = {}
  const color = hexOf(style.color)
  if (color && color !== hexOf(holder.color)) look.color = color
  // Code keeps its own type; only its ink is the writers' to know (a terminal's).
  if (element.tagName === 'PRE') return look.color ? look : null
  if (Number(style.fontWeight) >= BOLD_WEIGHT && Number(holder.fontWeight) < BOLD_WEIGHT) {
    look.bold = true
  }
  if (style.fontStyle === 'italic' && holder.fontStyle !== 'italic') look.italic = true
  if (style.textDecorationLine.includes('line-through')) look.strike = true
  const size = Number.parseFloat(style.fontSize)
  const held = Number.parseFloat(holder.fontSize)
  if (size > 0 && held > 0 && Math.abs(size / held - 1) > SAME_SIZE) {
    look.scale = Math.round((size / held) * 100) / 100
  }
  const align = sideOf(style.textAlign, style.direction)
  if (align && align !== sideOf(holder.textAlign, holder.direction)) look.align = align
  if (node.isInline) {
    if (fill) look.fill = hexOfColor(fill)
    if (style.verticalAlign === 'super') look.raised = true
    if (
      style.textDecorationLine.includes('underline') ||
      Number.parseFloat(style.borderBottomWidth) > 0
    ) {
      look.underline = true
    }
  }
  // The words a stylesheet adds, where they are plain words: a marker's
  // brackets, an accordion's arrow. A paragraph's are a task's details,
  // which the writers write from the task itself.
  if (node.isInline || (node.isTextblock && name !== 'paragraph')) {
    const view = element.ownerDocument.defaultView
    const before = view ? quoted(view.getComputedStyle(element, '::before').content) : null
    const after = view ? quoted(view.getComputedStyle(element, '::after').content) : null
    if (before) look.before = before
    if (after) look.after = after
  }
  return Object.keys(look).length > 0 ? look : null
}

/** `start`/`end` and the physical sides, as the page has them. */
function sideOf(value: string, direction: string): 'left' | 'center' | 'right' | null {
  const rtl = direction === 'rtl'
  switch (value) {
    case 'center':
      return 'center'
    case 'left':
    case 'right':
      return value
    case 'end':
      return rtl ? 'left' : 'right'
    case 'start':
      return rtl ? 'right' : 'left'
    default:
      return null
  }
}

/** A `content` that is one quoted string, unquoted; null for anything else. */
function quoted(content: string): string | null {
  const match = /^"((?:[^"\\]|\\.)*)"$/.exec(content.trim())
  if (!match) return null
  const text = (match[1] as string).replace(/\\(.)/g, '$1')
  return text.trim() === '' ? null : text
}

/** The sides a block's stylesheet draws a line on, with the heaviest one's colour and width. */
function borderOf(style: CSSStyleDeclaration): RenderedBorder | null {
  const sides: RenderedSide[] = []
  let heaviest: { width: number; color: string } | null = null
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const width = Number.parseFloat(style.getPropertyValue(`border-${side}-width`))
    const kind = style.getPropertyValue(`border-${side}-style`)
    const color = colorOf(style.getPropertyValue(`border-${side}-color`))
    if (!(width > 0) || kind === 'none' || kind === 'hidden' || !color || color.a === 0) continue
    sides.push(side)
    if (!heaviest || width > heaviest.width) heaviest = { width, color: hexOfColor(color) }
  }
  return heaviest ? { color: heaviest.color, width: heaviest.width, sides } : null
}

/**
 * A picture of each drawing, and of each SVG image, for the formats that
 * need a bitmap: {@link rasterizeDiagrams} draws them. A drawing is any atom
 * whose own markup is a lone SVG.
 */
function capturePictures(
  root: HTMLElement,
  modelOf: ModelOf,
  captured: Map<EditorNode, RenderedBlock>,
): void {
  for (const element of root.querySelectorAll('*')) {
    const node = modelOf.get(element)
    if (!node || node.isText) continue
    const equation = node.isAtom ? mathSVG(element) : null
    if (equation) {
      const alt = element.getAttribute('aria-label') ?? 'Equation'
      record(captured, node, { image: { ...equation, alt } })
      continue
    }
    const markup = node.type.name === 'image' ? svgSource(node.attrs.src) : drawnSVG(node)
    if (!markup) continue
    // As wide as it shows, and as tall as its own proportions make that.
    const shown = (element.querySelector('img, svg') ?? element).getBoundingClientRect()
    const width = Math.round(shown.width) || 640
    const ratio = svgRatio(markup)
    const height = Math.round(ratio ? width * ratio : shown.height) || 360
    const alt = typeof node.attrs.alt === 'string' && node.attrs.alt ? node.attrs.alt : 'Drawing'
    record(captured, node, { image: { markup, width, height, alt } })
  }
}

/** An SVG's height over its width, from its `viewBox` or its own size. */
function svgRatio(markup: string): number | null {
  const open = /^<svg\b[^>]*>/.exec(markup)?.[0] ?? ''
  const box = /\bviewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"/.exec(open)
  const width = Number(box?.[1] ?? /\bwidth="([\d.]+)"/.exec(open)?.[1])
  const height = Number(box?.[2] ?? /\bheight="([\d.]+)"/.exec(open)?.[1])
  return width > 0 && height > 0 ? height / width : null
}

/**
 * An equation as the editor sets it, its MathML wrapped in an SVG to draw
 * to a bitmap, for a format with no equations of its own. Dark on the light
 * plate {@link rasterizeDiagrams} gives it, as a diagram is, whatever the
 * page's theme. Null for an element holding no MathML.
 */
function mathSVG(element: Element): { markup: string; width: number; height: number } | null {
  const math = element.querySelector('math')
  const view = element.ownerDocument.defaultView
  if (!math || !view) return null
  // A display equation's own box is the column's width: its row of symbols is what it takes.
  const row = math.firstElementChild ?? math
  const box = math.getBoundingClientRect()
  // A pixel of room each side, so an italic's overhang is not cut off.
  const width = Math.ceil(row.getBoundingClientRect().width) + 2
  const height = Math.ceil(box.height) + 2
  if (width < 3 || height < 3) return null
  const size = view.getComputedStyle(math).fontSize
  const mathml = new XMLSerializer().serializeToString(math)
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="1" y="1" width="${width - 2}" height="${height - 2}"><div xmlns="http://www.w3.org/1999/xhtml" style="font-size:${size};line-height:normal;color:#1a1a2b">${mathml}</div></foreignObject></svg>`
  return { markup, width, height }
}

/** An atom's SVG, when that is all its spec draws it as. */
function drawnSVG(node: EditorNode): string | null {
  if (!node.isAtom || node.isInline) return null
  const markup = node.type.spec.toHTML?.(node).innerHTML?.trim() ?? ''
  return markup.startsWith('<svg') && markup.endsWith('</svg>') ? markup : null
}

/** The SVG a `data:image/svg+xml` source holds; null for any other source. */
function svgSource(src: unknown): string | null {
  if (typeof src !== 'string') return null
  const match = /^data:image\/svg\+xml(;base64)?,(.*)$/s.exec(src)
  if (!match) return null
  try {
    if (!match[1]) return decodeURIComponent(match[2] as string)
    // Base64 holds bytes, and the SVG is UTF-8 text.
    const bytes = Uint8Array.from(atob(match[2] as string), (char) => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
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
    // Only a code block's drawing is the page's to put in: everything else
    // the stylesheet the page carries draws as the editor does.
    if (!block || !node.isTextblock || !(block.runs || block.image || block.lines)) return null
    // A drawn diagram stands on its own. The source beside it is the
    // instruction that produced the picture, not a second way of reading the
    // document, printing both says the same thing twice and leaves the page
    // with a code block and a figure fighting over the same width.
    if (block.image) {
      return `<figure class="trevixal-diagram" role="img" aria-label="${escapeHTML(
        block.image.alt,
      )}">${block.image.markup}</figure>`
    }
    // The schema's own attributes, not the language alone: the wrap was lost,
    // and an exported block ran off the side of the page it fitted in the editor.
    const own = node.type.spec.toHTML?.(node).attrs ?? {}
    const attrs = KEPT_CODE_ATTRIBUTES.filter((name) => own[name] !== undefined)
      .map((name) => ` ${name}="${escapeHTML(String(own[name]))}"`)
      .join('')
    const runs = block.runs ?? [{ text: node.textContent }]
    return `<pre${attrs}><code>${codeHTML(runs, block.lines ?? [])}</code></pre>`
  }
}

/**
 * The code's runs with the editor's line markers put back at the start of
 * each line they mark, so the page's stylesheet numbers and bands the same
 * lines the editor does.
 */
function codeHTML(runs: readonly RenderedRun[], lines: readonly RenderedLine[]): string {
  const markers = new Map(lines.map((line) => [line.line, line.className]))
  const marker = (line: number): string => {
    const className = markers.get(line)
    return className
      ? `<span class="${escapeHTML(className)}" data-line="${line}" aria-hidden="true"></span>`
      : ''
  }
  let line = 1
  let out = marker(line)
  for (const run of runs) {
    run.text.split('\n').forEach((part, index) => {
      if (index > 0) {
        line += 1
        out += `\n${marker(line)}`
      }
      if (part) out += runHTML({ ...run, text: part })
    })
  }
  return out
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
