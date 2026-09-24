import type { EditorNode } from '../model/node'
import { safeColor, safeFontFamily } from './css-values'

/**
 * Named styles, as Word's Styles pane keeps them: a paragraph style (Normal,
 * Title, the six headings, and any the writer makes) gives every paragraph
 * that uses it the same font, size, colour, weight and spacing; a character
 * style does the same for a run of text. Change Normal once and every body
 * paragraph follows it.
 *
 * The definitions are a document setting, the doc node's `styles`, holding
 * only what differs from the built-in look: a built-in style with its
 * changes, or a style of the writer's own. A paragraph names its style in
 * its `paragraphStyle` (a heading is its level's Heading style), and text in
 * a character style carries the `charStyle` mark. Direct formatting still
 * wins over a style, as in Word.
 */

export type StyleKind = 'paragraph' | 'character'

export type StyleAlign = 'left' | 'center' | 'right' | 'justify'

/** What a style sets. Anything left out is the look the style is based on. */
export interface StyleProps {
  readonly fontFamily?: string
  /** In points. */
  readonly fontSize?: number
  readonly color?: string
  readonly bold?: boolean
  readonly italic?: boolean
  readonly underline?: boolean
  /** Paragraph styles only, as the four below. */
  readonly align?: StyleAlign
  /** In points. */
  readonly spaceBefore?: number
  /** In points. */
  readonly spaceAfter?: number
  /** A multiple of the font size. */
  readonly lineHeight?: number
}

export interface NamedStyle {
  readonly id: string
  readonly name: string
  readonly kind: StyleKind
  /** Shipped with the editor: it can be changed but not deleted or renamed. */
  readonly builtIn: boolean
  readonly props: StyleProps
}

const HEADINGS = [1, 2, 3, 4, 5, 6] as const

/** The styles every document has, in the order the Styles pane lists them. */
export const BUILT_IN_STYLES: readonly NamedStyle[] = [
  { id: 'normal', name: 'Normal', kind: 'paragraph', builtIn: true, props: {} },
  { id: 'title', name: 'Title', kind: 'paragraph', builtIn: true, props: {} },
  { id: 'subtitle', name: 'Subtitle', kind: 'paragraph', builtIn: true, props: {} },
  ...HEADINGS.map(
    (level): NamedStyle => ({
      id: `heading${level}`,
      name: `Heading ${level}`,
      kind: 'paragraph',
      builtIn: true,
      props: {},
    }),
  ),
  { id: 'emphasis', name: 'Emphasis', kind: 'character', builtIn: true, props: {} },
  { id: 'strong', name: 'Strong', kind: 'character', builtIn: true, props: {} },
  { id: 'subtleEmphasis', name: 'Subtle emphasis', kind: 'character', builtIn: true, props: {} },
]

/** A style id: a letter, then letters, digits and hyphens. What a selector can hold as is. */
export function safeStyleId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9-]{0,47}$/.test(value) ? value : null
}

/** The heading level a style id stands for, or null. */
export function headingLevelOfStyle(id: string): number | null {
  const match = /^heading([1-6])$/.exec(id)
  return match ? Number(match[1]) : null
}

/**
 * The paragraph style Enter at the end of one in `id` goes on in: Normal
 * (null) after Title and Subtitle, as Word's own do, and the same style
 * after any other.
 */
export function followingStyle(id: string | null): string | null {
  return id === 'title' || id === 'subtitle' ? null : id
}

const ALIGNS: readonly StyleAlign[] = ['left', 'center', 'right', 'justify']

function inRange(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.min(max, Math.max(min, Math.round(value * 100) / 100))
}

function flag(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

/** Props with everything unsafe or out of range dropped, and only what a `kind` takes. */
export function sanitizeStyleProps(value: unknown, kind: StyleKind): StyleProps {
  if (typeof value !== 'object' || value === null) return {}
  const raw = value as Record<string, unknown>
  const props: Record<string, unknown> = {
    fontFamily: safeFontFamily(raw.fontFamily) ?? undefined,
    fontSize: inRange(raw.fontSize, 4, 144),
    color: safeColor(raw.color) ?? undefined,
    bold: flag(raw.bold),
    italic: flag(raw.italic),
    underline: flag(raw.underline),
  }
  if (kind === 'paragraph') {
    props.align = ALIGNS.find((align) => align === raw.align)
    props.spaceBefore = inRange(raw.spaceBefore, 0, 144)
    props.spaceAfter = inRange(raw.spaceAfter, 0, 144)
    props.lineHeight = inRange(raw.lineHeight, 0.5, 5)
  }
  return Object.fromEntries(Object.entries(props).filter(([, each]) => each !== undefined))
}

/**
 * The stored definitions, as the doc's `styles` holds them (JSON): changes
 * to built-in styles by id, and the writer's own styles whole. Anything that
 * does not read as one is dropped.
 */
export function parseStoredStyles(value: unknown): NamedStyle[] {
  if (typeof value !== 'string' || value === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    // A hand-edited setting that no longer parses leaves the built-in look.
    return []
  }
  if (!Array.isArray(parsed)) return []
  const styles = new Map<string, NamedStyle>()
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue
    const raw = entry as Record<string, unknown>
    const id = safeStyleId(raw.id)
    if (!id) continue
    const builtIn = BUILT_IN_STYLES.find((style) => style.id === id)
    const kind = builtIn?.kind ?? (raw.kind === 'character' ? 'character' : 'paragraph')
    const name = builtIn?.name ?? (typeof raw.name === 'string' ? raw.name.trim().slice(0, 60) : '')
    if (!name) continue
    styles.set(id, {
      id,
      name,
      kind,
      builtIn: Boolean(builtIn),
      props: sanitizeStyleProps(raw.props, kind),
    })
  }
  return [...styles.values()]
}

/** Stored definitions back as the attribute; null when nothing differs from the built-in look. */
export function storedStylesAttr(styles: readonly NamedStyle[]): string | null {
  const kept = styles.filter((style) => !style.builtIn || Object.keys(style.props).length > 0)
  if (kept.length === 0) return null
  return JSON.stringify(
    kept.map((style) =>
      style.builtIn
        ? { id: style.id, props: style.props }
        : { id: style.id, name: style.name, kind: style.kind, props: style.props },
    ),
  )
}

/** Every style the document has: the built-in ones with its changes, then its own, in order. */
export function documentStyles(doc: EditorNode): NamedStyle[] {
  const stored = parseStoredStyles(doc.attrs.styles)
  const byId = new Map(stored.map((style) => [style.id, style]))
  const builtIn = BUILT_IN_STYLES.map((style) => byId.get(style.id) ?? style)
  return [...builtIn, ...stored.filter((style) => !style.builtIn)]
}

/** One of the document's styles by id, or null. */
export function documentStyle(doc: EditorNode, id: string): NamedStyle | null {
  return documentStyles(doc).find((style) => style.id === id) ?? null
}

/** The declarations a style's props draw with. */
export function styleDeclarations(props: StyleProps): string[] {
  const out: string[] = []
  if (props.fontFamily) out.push(`font-family: ${props.fontFamily}`)
  if (props.fontSize !== undefined) out.push(`font-size: ${props.fontSize}pt`)
  if (props.color) out.push(`color: ${props.color}`)
  if (props.bold !== undefined) out.push(`font-weight: ${props.bold ? 700 : 400}`)
  if (props.italic !== undefined) out.push(`font-style: ${props.italic ? 'italic' : 'normal'}`)
  if (props.underline !== undefined) {
    out.push(`text-decoration-line: ${props.underline ? 'underline' : 'none'}`)
  }
  if (props.align) out.push(`text-align: ${props.align}`)
  if (props.spaceBefore !== undefined) out.push(`margin-top: ${props.spaceBefore}pt`)
  if (props.spaceAfter !== undefined) out.push(`margin-bottom: ${props.spaceAfter}pt`)
  if (props.lineHeight !== undefined) out.push(`line-height: ${props.lineHeight}`)
  return out
}

/**
 * The stylesheet a document's styles draw with, every rule under `scope`: the
 * editing surface, or the content of a saved page. Normal's font, size, colour
 * and line height are the whole document's, so the headings and every other
 * style scale from them as Word's are based on Normal; the rest of Normal is
 * a body paragraph's. Ids are checked, so none can break out of a selector.
 */
export function namedStylesCSS(doc: EditorNode, scope: string): string {
  const rules: string[] = []
  const rule = (selector: string, declarations: readonly string[]): void => {
    if (declarations.length > 0) rules.push(`${selector} { ${declarations.join('; ')} }`)
  }
  for (const style of parseStoredStyles(doc.attrs.styles)) {
    const { props } = style
    if (style.id === 'normal') {
      const { fontFamily, fontSize, color, lineHeight, ...paragraph } = props
      rule(scope, styleDeclarations({ fontFamily, fontSize, color, lineHeight }))
      rule(`${scope} p:not([data-paragraph-style])`, styleDeclarations(paragraph))
      continue
    }
    const level = headingLevelOfStyle(style.id)
    if (level) rule(`${scope} h${level}`, styleDeclarations(props))
    else if (style.kind === 'paragraph') {
      rule(`${scope} p[data-paragraph-style="${style.id}"]`, styleDeclarations(props))
    } else {
      rule(`${scope} [data-char-style="${style.id}"]`, styleDeclarations(props))
    }
  }
  return rules.join('\n')
}
