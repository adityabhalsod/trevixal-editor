import type { EditorNode, TextNode } from '@trevixal/core'
import { FORM_FIELD, type FormField, formFieldOf } from './fields'

/**
 * A document as a fillable PDF: its text set in Helvetica, and each field a
 * real PDF form field where it stands (a text box, a tick box, a drop-down,
 * a date box, a signature box), filled with what the field holds, so the
 * file opens in any PDF reader ready to fill in and save.
 */

export interface PDFFormOptions {
  readonly title?: string
}

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN = 72
const TEXT_WIDTH = PAGE_WIDTH - 2 * MARGIN
const BODY_SIZE = 11
const LINE_HEIGHT = 1.45
const HEADING_SIZES: Readonly<Record<number, number>> = { 1: 20, 2: 16, 3: 13 }
const PARAGRAPH_GAP = 6

const FIELD_WIDTHS: Readonly<Record<FormField['kind'], number>> = {
  text: 160,
  date: 90,
  dropdown: 120,
  signature: 180,
  checkbox: 11,
}
const FIELD_HEIGHTS: Readonly<Record<FormField['kind'], number>> = {
  text: 15,
  date: 15,
  dropdown: 15,
  signature: 30,
  checkbox: 11,
}

/** Helvetica's advance widths, near enough to wrap lines by, in thousandths of the size. */
function advance(char: string, bold: boolean): number {
  let width = 556
  if (char === ' ') width = 278
  else if ("il.,;:!|'’".includes(char)) width = 250
  else if ('fjrtI()[]-'.includes(char)) width = 333
  else if (char === 'm' || char === 'M') width = 833
  else if (char === 'w' || char === 'W') width = 778
  else if (/[A-Z]/.test(char)) width = 667
  return bold ? width * 1.06 : width
}

const measure = (text: string, size: number, bold: boolean): number =>
  [...text].reduce((total, char) => total + (advance(char, bold) * size) / 1000, 0)

/** Characters WinAnsi has beyond Latin-1, by their code there. */
const WIN_ANSI: Readonly<Record<string, number>> = {
  '€': 0x80,
  '…': 0x85,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '™': 0x99,
}

/** A PDF literal string in WinAnsi: brackets and backslashes escaped, the rest octal. */
export function pdfString(text: string): string {
  let out = '('
  for (const char of text) {
    const code = char.codePointAt(0) ?? 63
    if (char === '(' || char === ')' || char === '\\') out += `\\${char}`
    else if (code >= 32 && code < 127) out += char
    else if (char === '\n' || char === '\t') out += ' '
    else {
      const ansi = WIN_ANSI[char] ?? (code >= 0xa0 && code <= 0xff ? code : 63)
      out += `\\${ansi.toString(8).padStart(3, '0')}`
    }
  }
  return `${out})`
}

/** A PDF name: what a field is called, `#`-escaped where a name cannot hold it. */
const pdfName = (name: string): string => name.replace(/[^A-Za-z0-9_-]/g, '_')

/** One thing set on a line: a word, or a field. */
type Piece =
  | { readonly kind: 'word'; readonly text: string; readonly bold: boolean }
  | { readonly kind: 'field'; readonly field: FormField }

/** A block's pieces: words split at spaces, fields as they stand. */
function pieces(block: EditorNode, bold: boolean): Piece[] {
  const out: Piece[] = []
  for (const child of block.content.children) {
    if (child.type.name === FORM_FIELD) {
      out.push({ kind: 'field', field: formFieldOf(child) })
      continue
    }
    const text = child.isText ? (child as TextNode).text : child.textContent
    const strong = bold || child.marks.some((mark) => mark.type.name === 'bold')
    for (const word of text.split(/(\s+)/)) {
      if (word === '') continue
      out.push({ kind: 'word', text: /^\s+$/.test(word) ? ' ' : word, bold: strong })
    }
  }
  return out
}

/** A field placed on a page. */
interface PlacedField {
  readonly field: FormField
  readonly page: number
  readonly rect: readonly [number, number, number, number]
}

/** The document laid out: each page's drawing, and where its fields went. */
function layout(doc: EditorNode) {
  const pages: string[][] = [[]]
  const fields: PlacedField[] = []
  let y = PAGE_HEIGHT - MARGIN
  const page = (): string[] => pages[pages.length - 1] as string[]
  const room = (height: number): void => {
    if (y - height >= MARGIN) return
    pages.push([])
    y = PAGE_HEIGHT - MARGIN
  }
  const blocks: EditorNode[] = []
  const collect = (node: EditorNode): void => {
    if (node.isTextblock) blocks.push(node)
    else for (const child of node.content.children) collect(child)
  }
  collect(doc)
  for (const block of blocks) {
    const level = block.type.name === 'heading' ? Number(block.attrs.level) || 1 : 0
    const size = HEADING_SIZES[level] ?? BODY_SIZE
    const bold = level > 0
    let line: { piece: Piece; width: number }[] = []
    let width = 0
    const flush = (): void => {
      const tall = Math.max(
        size * LINE_HEIGHT,
        ...line.map(({ piece }) =>
          piece.kind === 'field' ? FIELD_HEIGHTS[piece.field.kind] + 4 : 0,
        ),
      )
      room(tall)
      y -= tall
      let x = MARGIN
      for (const { piece, width: each } of line) {
        if (piece.kind === 'word') {
          if (piece.text !== ' ') {
            page().push(
              `BT /${piece.bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${(y + 3).toFixed(2)} Td ${pdfString(piece.text)} Tj ET`,
            )
          }
        } else {
          const height = FIELD_HEIGHTS[piece.field.kind]
          fields.push({
            field: piece.field,
            page: pages.length - 1,
            rect: [x, y + 1, x + each, y + 1 + height],
          })
        }
        x += each
      }
      line = []
      width = 0
    }
    for (const piece of pieces(block, bold)) {
      const each =
        piece.kind === 'field'
          ? FIELD_WIDTHS[piece.field.kind] + 4
          : measure(piece.text, size, piece.bold)
      if (width + each > TEXT_WIDTH && line.length > 0) {
        flush()
        if (piece.kind === 'word' && piece.text === ' ') continue
      }
      line.push({ piece, width: each })
      width += each
    }
    flush()
    y -= PARAGRAPH_GAP
  }
  return { pages, fields }
}

/** The document as the bytes of a fillable PDF. */
export function serializeToPDFForm(doc: EditorNode, options: PDFFormOptions = {}): Uint8Array {
  const { pages, fields } = layout(doc)
  const objects: string[] = []
  const add = (body: string): number => {
    objects.push(body)
    return objects.length
  }
  const stream = (dictionary: string, content: string): string =>
    `<< ${dictionary} /Length ${content.length} >>\nstream\n${content}\nendstream`

  // Fixed objects first, so their numbers are known: catalog 1, pages 2, fonts 3 to 5.
  add('') // catalog, written last
  add('') // pages, written last
  const helvetica = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  )
  const helveticaBold = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  )
  const dingbats = add('<< /Type /Font /Subtype /Type1 /BaseFont /ZapfDingbats >>')
  const tickOn = add(
    stream(
      `/Type /XObject /Subtype /Form /BBox [0 0 11 11] /Resources << /Font << /ZaDb ${dingbats} 0 R >> >>`,
      'q 0 g BT /ZaDb 9 Tf 1.4 2 Td (4) Tj ET Q',
    ),
  )
  const tickOff = add(stream('/Type /XObject /Subtype /Form /BBox [0 0 11 11]', ''))

  const pageNumbers: number[] = []
  const annotations = pages.map(() => [] as number[])
  const fieldNumbers: number[] = []
  const taken = new Map<string, number>()
  // Pages are numbered before their fields exist; a field names its page.
  const firstPage = objects.length + 1
  pages.forEach((_page, index) => {
    pageNumbers.push(firstPage + index * 2)
  })
  // Reserve page and content objects in order.
  for (let index = 0; index < pages.length; index++) {
    add('')
    add('')
  }
  for (const placed of fields) {
    const used = taken.get(placed.field.name) ?? 0
    taken.set(placed.field.name, used + 1)
    const name = pdfName(used === 0 ? placed.field.name : `${placed.field.name}_${used + 1}`)
    const [x1, y1, x2, y2] = placed.rect.map((value) => value.toFixed(2))
    const common = `/Type /Annot /Subtype /Widget /T ${pdfString(name)} /TU ${pdfString(placed.field.label || placed.field.name)} /Rect [${x1} ${y1} ${x2} ${y2}] /F 4 /P ${pageNumbers[placed.page]} 0 R /MK << /BC [0.45 0.45 0.55] /BG [0.94 0.95 1] >> /Border [0 0 1]`
    const field = placed.field
    const body =
      field.kind === 'checkbox'
        ? `<< ${common} /FT /Btn /V /${field.value === 'true' ? 'Yes' : 'Off'} /AS /${field.value === 'true' ? 'Yes' : 'Off'} /AP << /N << /Yes ${tickOn} 0 R /Off ${tickOff} 0 R >> >> >>`
        : field.kind === 'dropdown'
          ? `<< ${common} /FT /Ch /Ff 131072 /Opt [${field.options.map(pdfString).join(' ')}] /V ${pdfString(field.value)} /DA (/Helv 10 Tf 0 g) >>`
          : field.kind === 'signature'
            ? `<< ${common} /FT /Sig >>`
            : `<< ${common} /FT /Tx /V ${pdfString(field.value)} /DA (/Helv 10 Tf 0 g) >>`
    const number = add(body)
    fieldNumbers.push(number)
    annotations[placed.page]?.push(number)
  }
  pages.forEach((drawing, index) => {
    const pageNumber = pageNumbers[index] as number
    const content = drawing.join('\n')
    const annots = annotations[index] ?? []
    objects[pageNumber - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${helvetica} 0 R /F2 ${helveticaBold} 0 R >> >> /Contents ${pageNumber + 1} 0 R${annots.length > 0 ? ` /Annots [${annots.map((n) => `${n} 0 R`).join(' ')}]` : ''} >>`
    objects[pageNumber] = stream('', content)
  })
  const acroForm = add(
    `<< /Fields [${fieldNumbers.map((n) => `${n} 0 R`).join(' ')}] /NeedAppearances true /DA (/Helv 0 Tf 0 g) /DR << /Font << /Helv ${helvetica} 0 R /ZaDb ${dingbats} 0 R >> >> >>`,
  )
  const info = add(`<< /Title ${pdfString(options.title ?? 'Form')} /Producer (Trevixal) >>`)
  objects[0] = `<< /Type /Catalog /Pages 2 0 R /AcroForm ${acroForm} 0 R >>`
  objects[1] = `<< /Type /Pages /Kids [${pageNumbers.map((n) => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>`

  let file = '%PDF-1.7\n%\xE2\xE3\xCF\xD3\n'
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(file.length)
    file += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = file.length
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) file += `${String(offset).padStart(10, '0')} 00000 n \n`
  file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  // Every character is below 256 by construction, so each is one byte.
  return Uint8Array.from(file, (char) => char.charCodeAt(0))
}
