import { type NamedStyle, type StyleProps, headingLevelOfStyle } from '@trevixal/core'
import { parseColor, toHex } from './color'
import { primaryFont } from './shared'
import { escapeXML } from './xml'

/**
 * A document's named styles as Word's own: Normal, Title, Subtitle and the
 * six headings as the built-in styles they are, with whatever the document
 * changed in them; the character styles likewise; and the writer's own
 * styles as custom ones based on Normal. A paragraph points at its style with
 * `w:pStyle` and a run at its with `w:rStyle`, so Word's Styles pane lists
 * them and a change there restyles everything in them, as in the editor.
 */

/** Word's own ids for the built-in styles. The writer's own are prefixed, so none can clash. */
const WORD_IDS: Readonly<Record<string, string>> = {
  normal: 'Normal',
  title: 'Title',
  subtitle: 'Subtitle',
  emphasis: 'Emphasis',
  strong: 'Strong',
  subtleEmphasis: 'SubtleEmphasis',
}

export function wordStyleId(id: string): string {
  const level = headingLevelOfStyle(id)
  if (level) return `Heading${level}`
  return WORD_IDS[id] ?? `Tvx-${id}`
}

/** What a style element holds, in terms Word writes it in. */
interface WordStyle {
  readonly type: 'paragraph' | 'character'
  readonly id: string
  readonly name: string
  readonly isDefault?: boolean
  readonly custom?: boolean
  readonly basedOn?: string
  readonly next?: string
  readonly keep?: boolean
  readonly outline?: number
  /** Twips. */
  readonly before?: number
  readonly after?: number
  /** 240ths of a line. */
  readonly line?: number
  readonly contextual?: boolean
  readonly align?: string
  readonly font?: string
  readonly bold?: boolean
  readonly italic?: boolean
  readonly color?: string
  /** Character spacing, in twentieths of a point. */
  readonly tracking?: number
  /** Half-points. */
  readonly size?: number
  readonly underline?: boolean
}

/** Word's heading sizes, in half-points, as the writer's own heading styles set them. */
export const HEADING_SIZES = [32, 28, 26, 24, 22, 22]

/** The built-in styles' own look, before a document changes anything in them. */
function builtIn(id: string): WordStyle | null {
  const level = headingLevelOfStyle(id)
  if (level) {
    return {
      type: 'paragraph',
      id: `Heading${level}`,
      name: `heading ${level}`,
      basedOn: 'Normal',
      next: 'Normal',
      keep: true,
      before: level === 1 ? 240 : 160,
      after: 80,
      outline: level - 1,
      bold: true,
      italic: level >= 5 ? true : undefined,
      size: HEADING_SIZES[level - 1] ?? 22,
    }
  }
  switch (id) {
    case 'normal':
      return { type: 'paragraph', id: 'Normal', name: 'Normal', isDefault: true }
    case 'title':
      return {
        type: 'paragraph',
        id: 'Title',
        name: 'Title',
        basedOn: 'Normal',
        next: 'Normal',
        after: 240,
        contextual: true,
        tracking: -10,
        size: 56,
      }
    case 'subtitle':
      return {
        type: 'paragraph',
        id: 'Subtitle',
        name: 'Subtitle',
        basedOn: 'Normal',
        next: 'Normal',
        after: 160,
        color: '5A5A5A',
        size: 30,
      }
    case 'emphasis':
      return { type: 'character', id: 'Emphasis', name: 'Emphasis', italic: true }
    case 'strong':
      return { type: 'character', id: 'Strong', name: 'Strong', bold: true }
    case 'subtleEmphasis':
      return {
        type: 'character',
        id: 'SubtleEmphasis',
        name: 'Subtle Emphasis',
        italic: true,
        color: '404040',
      }
    default:
      return null
  }
}

const JC: Readonly<Record<string, string>> = {
  left: 'left',
  center: 'center',
  right: 'right',
  justify: 'both',
}

/** A style's look with the document's changes laid over it. */
function withProps(base: WordStyle, props: StyleProps): WordStyle {
  const rgb = parseColor(props.color)
  return {
    ...base,
    ...(props.fontFamily ? { font: primaryFont(props.fontFamily) } : {}),
    ...(props.fontSize !== undefined ? { size: Math.round(props.fontSize * 2) } : {}),
    ...(rgb ? { color: toHex(rgb) } : {}),
    ...(props.bold !== undefined ? { bold: props.bold } : {}),
    ...(props.italic !== undefined ? { italic: props.italic } : {}),
    ...(props.underline !== undefined ? { underline: props.underline } : {}),
    ...(props.align ? { align: JC[props.align] } : {}),
    ...(props.spaceBefore !== undefined ? { before: Math.round(props.spaceBefore * 20) } : {}),
    ...(props.spaceAfter !== undefined ? { after: Math.round(props.spaceAfter * 20) } : {}),
    ...(props.lineHeight !== undefined ? { line: Math.round(props.lineHeight * 240) } : {}),
  }
}

/** On, off, or nothing when the style leaves it to what it is based on. */
function toggle(name: string, on: boolean | undefined): string {
  if (on === undefined) return ''
  return on ? `<w:${name}/><w:${name}Cs/>` : `<w:${name} w:val="0"/><w:${name}Cs w:val="0"/>`
}

/** One `w:style`, its children in the order the schema requires. */
function styleXML(style: WordStyle): string {
  const attributes = [
    `w:type="${style.type}"`,
    style.isDefault ? 'w:default="1"' : '',
    style.custom ? 'w:customStyle="1"' : '',
    `w:styleId="${escapeXML(style.id)}"`,
  ]
    .filter(Boolean)
    .join(' ')
  let pPr = ''
  if (style.keep) pPr += '<w:keepNext/><w:keepLines/>'
  if (style.before !== undefined || style.after !== undefined || style.line !== undefined) {
    pPr += '<w:spacing'
    if (style.before !== undefined) pPr += ` w:before="${style.before}"`
    if (style.after !== undefined) pPr += ` w:after="${style.after}"`
    if (style.line !== undefined) pPr += ` w:line="${style.line}" w:lineRule="auto"`
    pPr += '/>'
  }
  if (style.contextual) pPr += '<w:contextualSpacing/>'
  if (style.align) pPr += `<w:jc w:val="${style.align}"/>`
  if (style.outline !== undefined) pPr += `<w:outlineLvl w:val="${style.outline}"/>`
  let rPr = ''
  if (style.font) {
    const family = escapeXML(style.font)
    rPr += `<w:rFonts w:ascii="${family}" w:hAnsi="${family}" w:cs="${family}"/>`
  }
  rPr += toggle('b', style.bold)
  rPr += toggle('i', style.italic)
  if (style.color) rPr += `<w:color w:val="${style.color}"/>`
  if (style.tracking !== undefined) rPr += `<w:spacing w:val="${style.tracking}"/>`
  if (style.size !== undefined)
    rPr += `<w:sz w:val="${style.size}"/><w:szCs w:val="${style.size}"/>`
  if (style.underline !== undefined) {
    rPr += `<w:u w:val="${style.underline ? 'single' : 'none'}"/>`
  }
  return [
    `<w:style ${attributes}>`,
    `<w:name w:val="${escapeXML(style.name)}"/>`,
    style.basedOn ? `<w:basedOn w:val="${style.basedOn}"/>` : '',
    style.next ? `<w:next w:val="${style.next}"/>` : '',
    '<w:qFormat/>',
    style.type === 'paragraph' && pPr ? `<w:pPr>${pPr}</w:pPr>` : '',
    rPr ? `<w:rPr>${rPr}</w:rPr>` : '',
    '</w:style>',
  ].join('')
}

/** Every named style of the document as a Word style, the built-in ones first. */
export function namedStylesXML(styles: readonly NamedStyle[]): string {
  return styles
    .map((style) => {
      const base: WordStyle = builtIn(style.id) ?? {
        type: style.kind,
        id: wordStyleId(style.id),
        name: style.name,
        custom: true,
        ...(style.kind === 'paragraph' ? { basedOn: 'Normal', next: 'Normal' } : {}),
      }
      return styleXML(withProps(base, style.props))
    })
    .join('')
}
