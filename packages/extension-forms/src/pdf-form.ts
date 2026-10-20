import {
  type EditorNode,
  type TextNode,
  exportTextOf,
  formatListCounter,
  listStylesFor,
} from '@trevixal/core'
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

/** How far a list's items sit in from the text around it, a level each, in points. */
const LIST_INDENT = 18
/** Code's monospace advance, in thousandths of the size. */
const MONO_ADVANCE = 600

/** The type a word is set in: the body face, bold, italic, or code's monospace. */
type Face = 'regular' | 'bold' | 'italic' | 'mono'

/** Each face's font resource, as the page's resources name them. */
const FONTS: Readonly<Record<Face, string>> = {
  regular: 'F1',
  bold: 'F2',
  italic: 'F3',
  mono: 'F4',
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

// Measured as set: `→` goes on the page as `->`, two characters wide.
const measure = (text: string, size: number, face: Face): number =>
  [...settable(text)].reduce(
    (total, char) =>
      total + ((face === 'mono' ? MONO_ADVANCE : advance(char, face === 'bold')) * size) / 1000,
    0,
  )

/**
 * Symbols the editor's text uses that WinAnsi has no code for, as the
 * nearest it can set: they printed as question marks.
 */
const STAND_INS: Readonly<Record<string, string>> = {
  '▸': '>',
  '▾': 'v',
  '→': '->',
  '➜': '->',
  '←': '<-',
  '✓': 'v',
  '☐': '[ ]',
  '☑': '[x]',
  '●': '•',
  '○': 'o',
  '▪': '•',
}

/** The text as WinAnsi sets it, each symbol it lacks swapped for its stand-in. */
const settable = (text: string): string => [...text].map((each) => STAND_INS[each] ?? each).join('')

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
  for (const char of settable(text)) {
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

/** One thing set on a line: a word, a field, or the end of a line of code. */
type Piece =
  | { readonly kind: 'word'; readonly text: string; readonly face: Face }
  | { readonly kind: 'field'; readonly field: FormField }
  | { readonly kind: 'break' }

/** Words split at spaces in a face; a line break ends the line, as code's lines do. */
function words(text: string, face: Face, out: Piece[]): void {
  text.split('\n').forEach((line, index) => {
    if (index > 0) out.push({ kind: 'break' })
    // Code keeps its indentation; prose collapses its spaces.
    for (const word of line.split(face === 'mono' ? /( )/ : /(\s+)/)) {
      if (word === '') continue
      out.push({ kind: 'word', text: /^\s+$/.test(word) ? ' ' : word, face })
    }
  })
}

/** A block's pieces: words split at spaces, fields as they stand, an atom its words. */
function pieces(block: EditorNode, bold: boolean): Piece[] {
  const out: Piece[] = []
  const code = block.type.name === 'codeBlock'
  for (const child of block.content.children) {
    if (child.type.name === FORM_FIELD) {
      out.push({ kind: 'field', field: formFieldOf(child) })
      continue
    }
    // An atom reads as the words it stands for: an equation, a reference.
    const text = child.isText ? (child as TextNode).text : exportTextOf(child)
    const has = (name: string): boolean => child.marks.some((mark) => mark.type.name === name)
    const face: Face =
      code || has('code')
        ? 'mono'
        : bold || has('bold')
          ? 'bold'
          : has('italic')
            ? 'italic'
            : 'regular'
    words(text, face, out)
  }
  return out
}

/** A word cut into pieces no wider than the line, where it is wider: the rest is unchanged. */
function fitted(piece: Extract<Piece, { kind: 'word' }>, size: number, available: number): Piece[] {
  if (measure(piece.text, size, piece.face) <= available) return [piece]
  const out: Piece[] = []
  let chunk = ''
  for (const char of piece.text) {
    if (chunk && measure(chunk + char, size, piece.face) > available) {
      out.push({ ...piece, text: chunk }, { kind: 'break' })
      chunk = ''
    }
    chunk += char
  }
  if (chunk) out.push({ ...piece, text: chunk })
  return out
}

/** A textblock to set, or an atom's words, with the indent and marker its list gives it. */
interface Setting {
  readonly block: EditorNode | null
  readonly text: string
  readonly indent: number
  readonly marker: string
}

/** The marker a list draws before an item: a box, a number in its style, a bullet. */
function markerOf(list: EditorNode, item: EditorNode, index: number): string {
  if (item.type.name === 'taskItem') return item.attrs.checked === true ? '[x] ' : '[ ] '
  const style = typeof list.attrs.listStyle === 'string' ? list.attrs.listStyle : ''
  if (list.type.name === 'orderedList') {
    const start = typeof list.attrs.start === 'number' ? list.attrs.start : 1
    const counter = listStylesFor(list.type.name).has(style) ? style : 'decimal'
    return `${formatListCounter(start + index, counter)}. `
  }
  return '• '
}

/** The document's textblocks in order, each list item's marked and indented, each atom's words. */
function settings(doc: EditorNode): Setting[] {
  const out: Setting[] = []
  const visit = (node: EditorNode, indent: number, marker: string): void => {
    if (node.isTextblock) {
      out.push({ block: node, text: '', indent, marker })
      return
    }
    if (node.childCount === 0) {
      const text = exportTextOf(node)
      if (text) out.push({ block: null, text, indent, marker })
      return
    }
    // A table's row is a line, its cells apart, as the page reads it across.
    if (node.type.name === 'tableRow') {
      const cells = node.content.children.map((cell) => cell.textContent.trim())
      out.push({ block: null, text: cells.join('   |   '), indent, marker })
      return
    }
    if (['bulletList', 'orderedList', 'taskList'].includes(node.type.name)) {
      node.content.children.forEach((item, index) => {
        const own = markerOf(node, item, index)
        item.content.children.forEach((child, at) =>
          visit(child, indent + LIST_INDENT, at === 0 ? own : ''),
        )
      })
      return
    }
    node.content.children.forEach((child, index) => visit(child, indent, index === 0 ? marker : ''))
  }
  visit(doc, 0, '')
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
  for (const { block, text, indent, marker } of settings(doc)) {
    const level = block?.type.name === 'heading' ? Number(block.attrs.level) || 1 : 0
    const code = block?.type.name === 'codeBlock'
    const size = code ? BODY_SIZE - 1 : (HEADING_SIZES[level] ?? BODY_SIZE)
    const bold = level > 0
    const available = TEXT_WIDTH - indent
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
      let x = MARGIN + indent
      for (const { piece, width: each } of line) {
        if (piece.kind === 'break') continue
        if (piece.kind === 'word') {
          if (piece.text !== ' ') {
            page().push(
              `BT /${FONTS[piece.face]} ${size} Tf ${x.toFixed(2)} ${(y + 3).toFixed(2)} Td ${pdfString(piece.text)} Tj ET`,
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
    const all: Piece[] = []
    // A list item's marker hangs before its first line, in the body face.
    if (marker) words(marker, 'regular', all)
    if (block) all.push(...pieces(block, bold))
    else words(text, 'regular', all)
    for (const whole of all) {
      if (whole.kind === 'break') {
        flush()
        continue
      }
      // A word wider than the line, a long line of code, is cut to fit.
      for (const piece of whole.kind === 'word' ? fitted(whole, size, available) : [whole]) {
        if (piece.kind === 'break') {
          flush()
          continue
        }
        const each =
          piece.kind === 'field'
            ? FIELD_WIDTHS[piece.field.kind] + 4
            : measure(piece.text, size, piece.face)
        if (width + each > available && line.length > 0) {
          flush()
          if (piece.kind === 'word' && piece.text === ' ') continue
        }
        line.push({ piece, width: each })
        width += each
      }
    }
    flush()
    // Code's lines run on; between other paragraphs, a gap.
    if (!code) y -= PARAGRAPH_GAP
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
  const helveticaOblique = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>',
  )
  const courier = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
  )
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
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${helvetica} 0 R /F2 ${helveticaBold} 0 R /F3 ${helveticaOblique} 0 R /F4 ${courier} 0 R >> >> /Contents ${pageNumber + 1} 0 R${annots.length > 0 ? ` /Annots [${annots.map((n) => `${n} 0 R`).join(' ')}]` : ''} >>`
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
