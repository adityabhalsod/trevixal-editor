// An accessibility audit of the document itself: what a reader with a screen
// reader, or with low vision, would stumble on in the finished page. Pure:
// it reads the document and returns findings, each with where it is.

import { type EditorNode, type Path, inlineSize, rangesWithMark, textblocks } from '@trevixal/core'

export type AccessibilityIssueKind =
  | 'alt-text'
  | 'heading-order'
  | 'empty-heading'
  | 'link-text'
  | 'contrast'
  | 'table-header'

export interface AccessibilityIssue {
  readonly kind: AccessibilityIssueKind
  /** The node the issue is on, or the textblock holding the range. */
  readonly path: Path
  /** Inline offsets within that textblock, for an issue in the text. */
  readonly from?: number
  readonly to?: number
  readonly message: string
}

/** A heading for each kind, as a report groups them. */
export const ACCESSIBILITY_KIND_LABELS: Readonly<Record<AccessibilityIssueKind, string>> = {
  'alt-text': 'Missing alt text',
  'heading-order': 'Heading order',
  'empty-heading': 'Empty heading',
  'link-text': 'Link text',
  contrast: 'Colour contrast',
  'table-header': 'Table header',
}

export interface AccessibilityAuditOptions {
  /** The page colour text is read against; white by default. */
  readonly background?: string
}

/** WCAG's minimum contrast for body text, level AA. */
export const MINIMUM_CONTRAST = 4.5

/** Link text that says nothing about where the link goes. */
const VAGUE_LINK_TEXT = new Set([
  'click here',
  'here',
  'read more',
  'more',
  'learn more',
  'link',
  'this link',
  'this',
  'details',
  'go',
])

/** `#rgb`, `#rrggbb`, `rgb()` and `rgba()` to channels; null for anything else. */
export function parseCSSColor(value: string): [number, number, number] | null {
  const text = value.trim().toLowerCase()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text)
  if (hex) {
    const digits = hex[1] as string
    const full = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits
    return [0, 2, 4].map((at) => Number.parseInt(full.slice(at, at + 2), 16)) as [
      number,
      number,
      number,
    ]
  }
  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/.exec(text)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  if (text === 'white') return [255, 255, 255]
  if (text === 'black') return [0, 0, 0]
  return null
}

/** WCAG relative luminance of an sRGB colour. */
function luminance([red, green, blue]: [number, number, number]): number {
  const linear = (channel: number): number => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
}

/** The WCAG contrast ratio of two colours, 1 to 21; null when either cannot be read. */
export function contrastRatio(foreground: string, background: string): number | null {
  const a = parseCSSColor(foreground)
  const b = parseCSSColor(background)
  if (!a || !b) return null
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

/** Every node in the document with its path, depth first. */
function walk(doc: EditorNode, visit: (node: EditorNode, path: Path) => void): void {
  const step = (node: EditorNode, path: Path): void => {
    visit(node, path)
    if (node.isTextblock) return
    node.content.children.forEach((child, index) => step(child, [...path, index]))
  }
  doc.content.children.forEach((child, index) => step(child, [index]))
}

/** Findings for the images, headings, tables, links and coloured text of a document. */
export function auditAccessibility(
  doc: EditorNode,
  options: AccessibilityAuditOptions = {},
): readonly AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = []
  const background = options.background ?? '#ffffff'
  let previousLevel = 0
  walk(doc, (node, path) => {
    const attrs = node.type.spec.attrs ?? {}
    if ('alt' in attrs && node.attrs.decorative !== true) {
      const alt = node.attrs.alt
      if (typeof alt !== 'string' || alt.trim() === '') {
        issues.push({
          kind: 'alt-text',
          path,
          message: 'An image with no alt text: say what it shows, or mark it decorative.',
        })
      }
    }
    if (node.type.name === 'heading') {
      const level = Number(node.attrs.level) || 1
      if (node.textContent.trim() === '') {
        issues.push({ kind: 'empty-heading', path, message: 'A heading with no text in it.' })
      }
      if (previousLevel > 0 && level > previousLevel + 1) {
        issues.push({
          kind: 'heading-order',
          path,
          message: `Heading ${level} follows Heading ${previousLevel}, skipping a level.`,
        })
      }
      previousLevel = level
    }
    if (node.type.name === 'table') {
      const firstCell = node.content.children[0]?.content.children[0]
      if (firstCell && firstCell.attrs.header !== true) {
        issues.push({
          kind: 'table-header',
          path,
          message: 'A table with no header row, so its columns have no names to read out.',
        })
      }
    }
  })
  for (const { path, node } of textblocks(doc)) {
    const length = node.content.children.reduce((total, child) => total + inlineSize(child), 0)
    const text = (from: number, to: number): string => {
      let out = ''
      let offset = 0
      for (const child of node.content.children) {
        const size = inlineSize(child)
        if (child.isText && offset < to && offset + size > from) {
          out += child.textContent.slice(Math.max(0, from - offset), to - offset)
        }
        offset += size
      }
      return out.trim()
    }
    const link = node.type.schema.marks.link
    if (link) {
      for (const range of rangesWithMark(node.content, 0, length, link)) {
        const words = text(range.from, range.to)
        const vague = VAGUE_LINK_TEXT.has(words.toLowerCase())
        if (vague || /^(?:https?:\/\/|www\.)/i.test(words)) {
          issues.push({
            kind: 'link-text',
            path,
            from: range.from,
            to: range.to,
            message: vague
              ? `The link “${words}” does not say where it goes.`
              : 'A bare address as link text is read out letter by letter.',
          })
        }
      }
    }
    const color = node.type.schema.marks.textColor
    if (color) {
      const shaded = node.type.schema.marks.backgroundColor
      const shading = shaded ? rangesWithMark(node.content, 0, length, shaded) : []
      for (const range of rangesWithMark(node.content, 0, length, color)) {
        const behind =
          shading.find((shade) => shade.from <= range.from && shade.to >= range.to)?.mark.attrs
            .color ?? background
        const ratio = contrastRatio(String(range.mark.attrs.color), String(behind))
        if (ratio !== null && ratio < MINIMUM_CONTRAST) {
          issues.push({
            kind: 'contrast',
            path,
            from: range.from,
            to: range.to,
            message: `“${text(range.from, range.to)}” has a contrast of ${ratio.toFixed(1)}:1; body text needs ${MINIMUM_CONTRAST}:1.`,
          })
        }
      }
    }
  }
  return issues
}
