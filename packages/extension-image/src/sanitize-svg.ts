import { UploadError } from '@trevixal/core'

/**
 * The SVG elements a picture needs: shapes, text, paint servers and the
 * structure around them. Everything else goes, first of all `script`,
 * `foreignObject` (which can carry any HTML) and the animation elements
 * (which can rewrite an `href` into `javascript:` after load).
 */
const ALLOWED_ELEMENTS = new Set(
  [
    'svg',
    'g',
    'defs',
    'symbol',
    'use',
    'title',
    'desc',
    'path',
    'rect',
    'circle',
    'ellipse',
    'line',
    'polyline',
    'polygon',
    'text',
    'tspan',
    'textPath',
    'linearGradient',
    'radialGradient',
    'stop',
    'pattern',
    'clipPath',
    'mask',
    'marker',
    'filter',
    'feGaussianBlur',
    'feOffset',
    'feBlend',
    'feColorMatrix',
    'feMerge',
    'feMergeNode',
    'feFlood',
    'feComposite',
    'image',
  ].map((name) => name.toLowerCase()),
)

/** A link an attribute may carry: to something in the same file, or an inlined raster image. */
function safeReference(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.startsWith('#') || /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(trimmed)
}

/**
 * An SVG with nothing in it that can run or reach out: no scripts, no
 * event handlers, no foreign content, no animation, no link to anything
 * outside the file bar an inlined raster image, and no `url()` in a style
 * that is not a fragment. The picture itself is untouched. Throws an
 * `UploadError` for text that is not an SVG at all.
 */
export function sanitizeSVG(source: string, document: Document = globalThis.document): string {
  const view = document.defaultView ?? globalThis
  const Parser = (view as typeof globalThis).DOMParser ?? globalThis.DOMParser
  const parsed = new Parser().parseFromString(source, 'image/svg+xml')
  let root: Element | null =
    parsed.documentElement && !parsed.querySelector('parsererror') ? parsed.documentElement : null
  // An engine whose XML parser gives nothing back still reads SVG inline in HTML.
  if (!root)
    root = new Parser().parseFromString(source, 'text/html').body?.querySelector('svg') ?? null
  if (!root || root.nodeName.toLowerCase() !== 'svg') {
    throw new UploadError('Not a valid SVG image')
  }
  const clean = (element: Element): void => {
    for (const child of [...element.children]) {
      if (!ALLOWED_ELEMENTS.has(child.localName.toLowerCase())) {
        child.remove()
        continue
      }
      clean(child)
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value
      const unsafe =
        name.startsWith('on') ||
        ((name === 'href' || name.endsWith(':href')) && !safeReference(value)) ||
        (name === 'style' && /url\s*\(\s*(?!['"]?#)|expression\s*\(|javascript:/i.test(value)) ||
        /^\s*(?:javascript|vbscript):/i.test(value)
      if (unsafe) element.removeAttribute(attribute.name)
    }
  }
  clean(root)
  const Serializer = (view as typeof globalThis).XMLSerializer ?? globalThis.XMLSerializer
  return new Serializer().serializeToString(root)
}

/** Whether a file is an SVG image, by its type or, failing that, its name. */
export function isSVGFile(file: File): boolean {
  return file.type === 'image/svg+xml' || /\.svgz?$/i.test(file.name)
}

/** An SVG file with its markup sanitised by {@link sanitizeSVG}, under the same name. */
export async function sanitizeSVGFile(file: File, document?: Document): Promise<File> {
  const text = await file.text()
  const clean = sanitizeSVG(text, document)
  return new File([clean], file.name, { type: 'image/svg+xml' })
}
