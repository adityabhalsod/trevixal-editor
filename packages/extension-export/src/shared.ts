import type { Attrs, EditorNode, Mark } from '@trevixal/core'
import { lengthToTwips, parseLineHeight } from './units'

/** Node names both writers look up; a schema may lack any of them. */
export const NODE = {
  paragraph: 'paragraph',
  heading: 'heading',
  blockquote: 'blockquote',
  codeBlock: 'codeBlock',
  horizontalRule: 'horizontalRule',
  hardBreak: 'hardBreak',
  bulletList: 'bulletList',
  orderedList: 'orderedList',
  listItem: 'listItem',
  taskList: 'taskList',
  taskItem: 'taskItem',
  table: 'table',
  tableRow: 'tableRow',
  tableCell: 'tableCell',
  image: 'image',
  figure: 'figure',
  caption: 'caption',
} as const

export function attrString(attrs: Attrs, key: string): string | null {
  const value = attrs[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function attrNumber(attrs: Attrs, key: string): number | null {
  const value = attrs[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function markNamed(marks: readonly Mark[], name: string): Mark | undefined {
  return marks.find((mark) => mark.type.name === name)
}

export function hasMark(marks: readonly Mark[], name: string): boolean {
  return marks.some((mark) => mark.type.name === name)
}

/** A heading's level clamped to 1-6. */
export function headingLevel(node: EditorNode): number {
  const level = attrNumber(node.attrs, 'level') ?? 1
  return Math.min(6, Math.max(1, Math.round(level)))
}

/** An ordered list's first number, defaulting to 1. */
export function listStart(node: EditorNode): number {
  const start = attrNumber(node.attrs, 'start')
  return start === null ? 1 : Math.round(start)
}

/** The first family of a CSS font stack, unquoted. */
export function primaryFont(family: string): string {
  const first = family.split(',')[0] ?? family
  return first.trim().replace(/^["']|["']$/g, '')
}

/** The glyph a task item renders in formats without checkboxes. */
export function taskGlyph(item: EditorNode): string {
  return item.attrs.checked === true ? '☑' : '☐'
}

export type Alignment = 'left' | 'center' | 'right' | 'justify'

export interface BlockLayout {
  readonly align: Alignment | null
  /** Indent steps (0-8), one 0.5in stop each. */
  readonly indent: number
  readonly spaceBefore: number | null
  readonly spaceAfter: number | null
  readonly lineHeight: { readonly multiplier: number } | { readonly twips: number } | null
}

/** The core schema's block layout attrs, converted to print units (twips). */
export function blockLayout(node: EditorNode, basePt: number): BlockLayout {
  const alignRaw = attrString(node.attrs, 'align')
  const align =
    alignRaw === 'left' || alignRaw === 'center' || alignRaw === 'right' || alignRaw === 'justify'
      ? alignRaw
      : null
  const indentRaw = attrNumber(node.attrs, 'indent') ?? 0
  return {
    align,
    indent: Math.min(8, Math.max(0, Math.round(indentRaw))),
    spaceBefore: lengthToTwips(node.attrs.spaceBefore, basePt),
    spaceAfter: lengthToTwips(node.attrs.spaceAfter, basePt),
    lineHeight: parseLineHeight(node.attrs.lineHeight, basePt),
  }
}

/** Whether a node is one of the two list containers, and which kind. */
export function listKind(node: EditorNode): 'bullet' | 'ordered' | 'task' | null {
  switch (node.type.name) {
    case NODE.bulletList:
      return 'bullet'
    case NODE.orderedList:
      return 'ordered'
    case NODE.taskList:
      return 'task'
    default:
      return null
  }
}

/** The total grid columns a table row spans, honouring `colspan`. */
export function rowSpan(row: EditorNode): number {
  let span = 0
  for (const cell of row.content.children) span += cellSpan(cell)
  return span
}

export function cellSpan(cell: EditorNode): number {
  const span = attrNumber(cell.attrs, 'colspan') ?? 1
  return Math.max(1, Math.round(span))
}

export function tableColumns(table: EditorNode): number {
  let columns = 1
  for (const row of table.content.children) columns = Math.max(columns, rowSpan(row))
  return columns
}

export interface DataURL {
  readonly mime: string
  readonly bytes: Uint8Array
}

/** Decode a `data:` URL with base64 or percent-encoded payload; null otherwise. */
export function decodeDataURL(src: string): DataURL | null {
  const match = /^data:([^;,]+)?((?:;[^;,]+)*),(.*)$/s.exec(src.trim())
  if (!match) return null
  const mime = (match[1] ?? 'application/octet-stream').toLowerCase()
  const params = match[2] ?? ''
  const payload = match[3] ?? ''
  try {
    if (/;base64/i.test(params)) {
      return { mime, bytes: base64Decode(payload) }
    }
    return { mime, bytes: new TextEncoder().encode(decodeURIComponent(payload)) }
  } catch {
    return null
  }
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function base64Decode(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let buffer = 0
  let bits = 0
  let position = 0
  for (const char of clean) {
    const value = BASE64.indexOf(char)
    if (value < 0) continue
    buffer = (buffer << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[position++] = (buffer >> bits) & 0xff
    }
  }
  return out.subarray(0, position)
}

export function base64Encode(bytes: Uint8Array): string {
  let out = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] as number
    const b = bytes[index + 1]
    const c = bytes[index + 2]
    const triple = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += BASE64[(triple >> 18) & 63]
    out += BASE64[(triple >> 12) & 63]
    out += b === undefined ? '=' : BASE64[(triple >> 6) & 63]
    out += c === undefined ? '=' : BASE64[triple & 63]
  }
  return out
}

const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
}

export function extensionForMime(mime: string): string {
  return EXTENSIONS[mime.toLowerCase()] ?? 'bin'
}

export function mimeForExtension(extension: string): string {
  const lower = extension.toLowerCase().replace(/^\./, '')
  for (const [mime, ext] of Object.entries(EXTENSIONS)) {
    if (ext === lower || (lower === 'jpg' && ext === 'jpeg')) return mime
  }
  if (lower === 'emf') return 'image/x-emf'
  if (lower === 'wmf') return 'image/x-wmf'
  return 'application/octet-stream'
}

export interface Dimensions {
  readonly width: number
  readonly height: number
}

/**
 * Natural pixel dimensions from a PNG, GIF or JPEG header, so an image whose
 * editor attrs only fix its width can keep its aspect ratio in Word.
 */
export function imageDimensions(bytes: Uint8Array): Dimensions | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null
      const marker = bytes[offset + 1] as number
      const length = view.getUint16(offset + 2)
      // SOF0-SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) }
      }
      offset += 2 + length
    }
  }
  return null
}
