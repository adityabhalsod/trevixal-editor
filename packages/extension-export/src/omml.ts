import { XmlElement, type XmlNode, escapeXML, parseXML } from './xml'

/**
 * MathML as Office Math (OMML), the equations Word draws and edits as its
 * own: what an equation node renders as in the editor, written so Word sets
 * it the same way rather than showing its LaTeX source.
 *
 * Covers the MathML an equation renderer writes: tokens, scripts, fractions,
 * roots, large operators with their limits, accents, matrices and fences.
 * Anything else gives its children, so an unfamiliar element costs its
 * layout, never its text.
 */

/** The math namespace, as `w:document` declares it. */
export const OMML_NAMESPACE = 'http://schemas.openxmlformats.org/officeDocument/2006/math'

/** Operators Word sets as n-ary, with their limits above and below or beside. */
const NARY: Readonly<Record<string, 'undOvr' | 'subSup'>> = {
  '∑': 'undOvr',
  '∏': 'undOvr',
  '∐': 'undOvr',
  '⋃': 'undOvr',
  '⋂': 'undOvr',
  '⋁': 'undOvr',
  '⋀': 'undOvr',
  '⨁': 'undOvr',
  '⨂': 'undOvr',
  '∫': 'subSup',
  '∬': 'subSup',
  '∭': 'subSup',
  '∮': 'subSup',
}

/** An accent as MathML writes it, and the combining mark OMML wants for it. */
const ACCENTS: Readonly<Record<string, string>> = {
  '^': '̂',
  ˆ: '̂',
  '~': '̃',
  '˜': '̃',
  '→': '⃗',
  '⃗': '⃗',
  '˙': '̇',
  '¨': '̈',
  '´': '́',
  '`': '̀',
  ˇ: '̌',
  '˘': '̆',
}

/** Characters that only bar what is under them. */
const BARS = new Set(['¯', '‾', '_', '̅'])

/** Fences that open and close a group Word can stretch. */
const FENCES: Readonly<Record<string, string>> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '|': '|',
  '‖': '‖',
  '⟨': '⟩',
  '⌈': '⌉',
  '⌊': '⌋',
}

/** U+2061, the invisible operator between a function's name and its argument. */
const FUNCTION_APPLICATION = '⁡'

const run = (text: string, plain = false): string =>
  text
    ? `<m:r>${plain ? '<m:rPr><m:sty m:val="p"/></m:rPr>' : ''}<m:t xml:space="preserve">${escapeXML(text)}</m:t></m:r>`
    : ''

const elementsOf = (element: XmlElement): XmlElement[] => element.elements()

/** The name without a namespace prefix: `mml:mi` is `mi`. */
const localName = (element: XmlElement): string => element.name.replace(/^.*:/, '')

function textOf(element: XmlElement): string {
  return element.text().replaceAll(FUNCTION_APPLICATION, '').trim()
}

/** A child's OMML, empty where there is no child: the slot still has to be there. */
function slot(element: XmlElement | undefined): string {
  return element ? convert(element) : ''
}

/** A sequence of siblings, where a large operator takes the one after it as its operand. */
function sequence(children: readonly XmlNode[]): string {
  const elements = children.filter((child): child is XmlElement => child instanceof XmlElement)
  let out = ''
  for (let index = 0; index < elements.length; index++) {
    const element = elements[index] as XmlElement
    const nary = naryOf(element)
    if (nary) {
      const operand = elements[index + 1]
      if (operand) index++
      out += naryXML(nary, slot(operand))
      continue
    }
    out += convert(element)
  }
  return out
}

interface Nary {
  readonly char: string
  readonly under: XmlElement | undefined
  readonly over: XmlElement | undefined
}

/** A large operator with its limits, or null for anything else. */
function naryOf(element: XmlElement): Nary | null {
  const name = localName(element)
  if (name === 'mo' && NARY[textOf(element)]) {
    return { char: textOf(element), under: undefined, over: undefined }
  }
  if (!['munderover', 'msubsup', 'munder', 'msub', 'mover', 'msup'].includes(name)) return null
  const [base, first, second] = elementsOf(element)
  if (!base || localName(base) !== 'mo' || !NARY[textOf(base)]) return null
  const char = textOf(base)
  if (name === 'munderover' || name === 'msubsup') return { char, under: first, over: second }
  if (name === 'munder' || name === 'msub') return { char, under: first, over: undefined }
  return { char, under: undefined, over: first }
}

function naryXML(nary: Nary, operand: string): string {
  const hide = [
    nary.under ? '' : '<m:subHide m:val="1"/>',
    nary.over ? '' : '<m:supHide m:val="1"/>',
  ].join('')
  const location = NARY[nary.char] ?? 'undOvr'
  return [
    `<m:nary><m:naryPr><m:chr m:val="${escapeXML(nary.char)}"/><m:limLoc m:val="${location}"/>${hide}</m:naryPr>`,
    `<m:sub>${slot(nary.under)}</m:sub><m:sup>${slot(nary.over)}</m:sup><m:e>${operand}</m:e></m:nary>`,
  ].join('')
}

/** A row standing for a fenced group, `( … )`, as Word's delimiter; null for any other row. */
function fenced(children: readonly XmlElement[]): string | null {
  const first = children[0]
  const last = children[children.length - 1]
  if (!first || !last || children.length < 3) return null
  if (localName(first) !== 'mo' || localName(last) !== 'mo') return null
  const open = textOf(first)
  const close = textOf(last)
  if (FENCES[open] !== close) return null
  // Only a fence that grows with what it holds: plain brackets stay characters.
  const grows =
    first.attr('stretchy') === 'true' ||
    last.attr('stretchy') === 'true' ||
    (children.length === 3 && localName(children[1] as XmlElement) === 'mtable')
  if (!grows) return null
  const inner = sequence(children.slice(1, -1))
  return `<m:d><m:dPr><m:begChr m:val="${escapeXML(open)}"/><m:endChr m:val="${escapeXML(close)}"/></m:dPr><m:e>${inner}</m:e></m:d>`
}

function convert(element: XmlElement): string {
  const children = elementsOf(element)
  switch (localName(element)) {
    case 'mi': {
      const text = textOf(element)
      // One letter is a variable, set in italic as Word does by itself; a
      // name (sin, lim) or an upright letter is set plain.
      const plain = element.attr('mathvariant') === 'normal' || [...text].length > 1
      return run(text, plain)
    }
    case 'mn':
    case 'mo':
      return run(textOf(element))
    case 'mtext':
    case 'ms':
      return `<m:r><m:rPr><m:nor/></m:rPr><m:t xml:space="preserve">${escapeXML(element.text())}</m:t></m:r>`
    case 'mspace':
      return run(' ')
    case 'msup':
      return `<m:sSup><m:e>${slot(children[0])}</m:e><m:sup>${slot(children[1])}</m:sup></m:sSup>`
    case 'msub':
      return `<m:sSub><m:e>${slot(children[0])}</m:e><m:sub>${slot(children[1])}</m:sub></m:sSub>`
    case 'msubsup':
      return `<m:sSubSup><m:e>${slot(children[0])}</m:e><m:sub>${slot(children[1])}</m:sub><m:sup>${slot(children[2])}</m:sup></m:sSubSup>`
    case 'mfrac': {
      const bar =
        element.attr('linethickness') === '0' ? '<m:fPr><m:type m:val="noBar"/></m:fPr>' : ''
      return `<m:f>${bar}<m:num>${slot(children[0])}</m:num><m:den>${slot(children[1])}</m:den></m:f>`
    }
    case 'msqrt':
      return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${sequence(element.children)}</m:e></m:rad>`
    case 'mroot':
      return `<m:rad><m:deg>${slot(children[1])}</m:deg><m:e>${slot(children[0])}</m:e></m:rad>`
    case 'munder':
      return `<m:limLow><m:e>${slot(children[0])}</m:e><m:lim>${slot(children[1])}</m:lim></m:limLow>`
    case 'mover':
      return overXML(element, children)
    case 'munderover':
      return `<m:limUpp><m:e><m:limLow><m:e>${slot(children[0])}</m:e><m:lim>${slot(children[1])}</m:lim></m:limLow></m:e><m:lim>${slot(children[2])}</m:lim></m:limUpp>`
    case 'mtable':
      return `<m:m>${children
        .filter((row) => localName(row) === 'mtr' || localName(row) === 'mlabeledtr')
        .map(
          (row) =>
            `<m:mr>${elementsOf(row)
              .filter((cell) => localName(cell) === 'mtd')
              .map((cell) => `<m:e>${sequence(cell.children)}</m:e>`)
              .join('')}</m:mr>`,
        )
        .join('')}</m:m>`
    case 'menclose':
      return `<m:borderBox><m:e>${sequence(element.children)}</m:e></m:borderBox>`
    case 'mphantom':
      return `<m:phant><m:e>${sequence(element.children)}</m:e></m:phant>`
    case 'annotation':
    case 'annotation-xml':
      return ''
    case 'semantics':
      return slot(children[0])
    case 'mrow':
      return fenced(children) ?? sequence(element.children)
    default:
      return sequence(element.children)
  }
}

/** An accent over what it marks, a bar, or a limit set above. */
function overXML(element: XmlElement, children: readonly XmlElement[]): string {
  const base = slot(children[0])
  const mark = children[1] ? textOf(children[1]) : ''
  if (BARS.has(mark)) {
    return `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e>${base}</m:e></m:bar>`
  }
  const accent = ACCENTS[mark]
  if (accent && element.attr('accent') !== 'false') {
    return `<m:acc><m:accPr><m:chr m:val="${accent}"/></m:accPr><m:e>${base}</m:e></m:acc>`
  }
  return `<m:limUpp><m:e>${base}</m:e><m:lim>${slot(children[1])}</m:lim></m:limUpp>`
}

/**
 * The `<m:oMath>` for a MathML `<math>` element's markup, or null when the
 * markup holds no `<math>` or nothing in it could be written.
 */
export function mathMLToOMML(markup: string): string | null {
  const start = markup.indexOf('<math')
  if (start < 0) return null
  const end = markup.lastIndexOf('</math>')
  const root = parseXML(markup.slice(start, end < 0 ? undefined : end + '</math>'.length))
  if (localName(root) !== 'math') return null
  const body = sequence(root.children)
  return body ? `<m:oMath>${body}</m:oMath>` : null
}
