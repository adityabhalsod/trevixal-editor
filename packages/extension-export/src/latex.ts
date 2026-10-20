import { type EditorNode, type Mark, TableMap, exportTextOf } from '@trevixal/core'

/**
 * A document as LaTeX source: an `article` with the packages its content
 * needs, headings as sections, lists, tables, code, equations and links,
 * footnotes, endnotes and citations as LaTeX's own, every character LaTeX
 * treats specially escaped. What LaTeX has no way to say (a callout, an
 * embed) keeps its text. It compiles with pdfLaTeX, the symbols the editor
 * uses mapped for it, and with XeLaTeX or LuaLaTeX, which take any script.
 */

export interface LaTeXOptions {
  /** The `\\title`; the first level-one heading's text by default. */
  readonly title?: string
  readonly author?: string
}

/** The characters LaTeX gives a meaning, written so they print as themselves. */
const SPECIAL: Readonly<Record<string, string>> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  '%': '\\%',
  _: '\\_',
  '^': '\\textasciicircum{}',
  '~': '\\textasciitilde{}',
}

/** Text escaped for LaTeX. */
export function escapeLaTeX(text: string): string {
  return text.replace(/[\\{}$&#%_^~]/g, (char) => SPECIAL[char] ?? char)
}

/** A URL as `\\href` and `\\url` take it: only `%` and `#` need escaping there. */
function escapeURL(url: string): string {
  return url.replace(/[%#\\{}]/g, (char) => `\\${char}`)
}

/** The sectioning command for a heading level. */
const SECTIONS = [
  'section',
  'subsection',
  'subsubsection',
  'paragraph',
  'subparagraph',
  'subparagraph',
]

/** Languages `listings` knows by name, from the editor's names. */
const LISTINGS: Readonly<Record<string, string>> = {
  javascript: 'Java',
  js: 'Java',
  typescript: 'Java',
  java: 'Java',
  python: 'Python',
  py: 'Python',
  html: 'HTML',
  xml: 'XML',
  sql: 'SQL',
  shell: 'bash',
  bash: 'bash',
  sh: 'bash',
  go: 'Go',
  rust: 'Rust',
  c: 'C',
  cpp: 'C++',
}

/**
 * Symbols pdfLaTeX has no glyph for out of the box, as the commands that draw
 * them: the menu arrows the editor's text uses, ticks and boxes, bullets.
 */
const SYMBOLS: Readonly<Record<string, string>> = {
  '▸': '\\ensuremath{\\blacktriangleright}',
  '▾': '\\ensuremath{\\blacktriangledown}',
  '✓': '\\checkmark',
  '☐': '\\ensuremath{\\square}',
  '☑': '\\ensuremath{\\boxtimes}',
  '➜': '\\ensuremath{\\rightarrow}',
  '●': '\\textbullet{}',
}

/** Wrap text in the commands its marks stand for, innermost first. */
function marked(text: string, marks: readonly Mark[]): string {
  let out = text
  for (const mark of marks) {
    switch (mark.type.name) {
      case 'bold':
        out = `\\textbf{${out}}`
        break
      case 'italic':
        out = `\\emph{${out}}`
        break
      case 'underline':
        out = `\\underline{${out}}`
        break
      case 'strikethrough':
        out = `\\sout{${out}}`
        break
      case 'code':
        out = `\\texttt{${out}}`
        break
      case 'subscript':
        out = `\\textsubscript{${out}}`
        break
      case 'superscript':
        out = `\\textsuperscript{${out}}`
        break
      case 'smallCaps':
        out = `\\textsc{${out}}`
        break
      case 'link': {
        const href = typeof mark.attrs.href === 'string' ? mark.attrs.href : ''
        if (href.startsWith('#')) break
        if (href) out = `\\href{${escapeURL(href)}}{${out}}`
        break
      }
      default:
        break
    }
  }
  return out
}

/** A textblock's inline content as LaTeX. */
function inline(block: EditorNode, context: Context): string {
  return block.content.children
    .map((child) => {
      if (child.isText) return marked(escapeLaTeX(child.textContent), child.marks)
      switch (child.type.name) {
        case 'hardBreak':
          return '\\\\\n'
        case 'math':
          return `$${equation(child, context)}$`
        case 'image':
          return imageOf(child)
        case 'footnoteRef':
        case 'endnoteRef': {
          // The note's words go where it is cited, as LaTeX numbers and sets them.
          const note = context.notes.get(`${child.type.name}:${String(child.attrs.id)}`)
          if (!note) return escapeLaTeX(exportTextOf(child))
          if (child.type.name === 'endnoteRef') context.packages.add('endnotes')
          const command = child.type.name === 'endnoteRef' ? 'endnote' : 'footnote'
          return `\\${command}{${noteText(note, context)}}`
        }
        case 'citation':
          return `\\cite{${citeKey(child.attrs.id)}}`
        case 'crossReference': {
          const target = typeof child.attrs.target === 'string' ? child.attrs.target : ''
          const words = escapeLaTeX(exportTextOf(child))
          return context.labels.has(target) ? `\\hyperref[${citeKey(target)}]{${words}}` : words
        }
        default:
          return escapeLaTeX(exportTextOf(child))
      }
    })
    .join('')
}

/** An equation's LaTeX, noting the package a chemical formula needs. */
function equation(node: EditorNode, context: Context): string {
  const latex = String(node.attrs.latex ?? '')
  if (latex.includes('\\ce{')) context.packages.add('mhchem')
  return latex
}

/** A note's paragraphs as one footnote's text. */
function noteText(item: EditorNode, context: Context): string {
  return item.content.children
    .map((child) => (child.isTextblock ? inline(child, context) : block(child, context)))
    .join(' ')
}

/** An id as a `\\cite` key or `\\label`: what LaTeX's commands take in one. */
function citeKey(id: unknown): string {
  return String(id ?? '').replace(/[^A-Za-z0-9:._-]/g, '-')
}

/** A picture: `\\includegraphics` for one kept as a file or at an address; a data one has neither. */
function imageOf(node: EditorNode): string {
  const src = typeof node.attrs.src === 'string' ? node.attrs.src : ''
  const alt = typeof node.attrs.alt === 'string' ? node.attrs.alt : ''
  if (!src || src.startsWith('data:'))
    return `% An image${alt ? `: ${alt.replace(/\n/g, ' ')}` : ''}`
  return `\\includegraphics[width=\\linewidth]{${escapeURL(src)}}`
}

interface Context {
  /** Packages the output uses, gathered while writing so the preamble names only those. */
  readonly packages: Set<string>
  /** Each footnote's and endnote's body, by `footnoteRef:id`, set where it is cited. */
  readonly notes: ReadonlyMap<string, EditorNode>
  /** The ids a cross-reference can point at: headings with an `id`. */
  readonly labels: ReadonlySet<string>
}

/** One block, and the blocks in it, as LaTeX. */
function block(node: EditorNode, context: Context): string {
  const children = (): string =>
    node.content.children
      .map((child) => block(child, context))
      .filter(Boolean)
      .join('\n\n')
  switch (node.type.name) {
    case 'paragraph': {
      // Centred and right-aligned text as LaTeX's environments set it.
      const text = inline(node, context)
      if (node.attrs.align === 'center') return `\\begin{center}\n${text}\n\\end{center}`
      if (node.attrs.align === 'right') return `\\begin{flushright}\n${text}\n\\end{flushright}`
      return text
    }
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs.level) || 1))
      const id =
        typeof node.attrs.id === 'string' && node.attrs.id
          ? `\\label{${citeKey(node.attrs.id)}}`
          : ''
      return `\\${SECTIONS[level - 1]}{${inline(node, context)}}${id}`
    }
    // Notes go where they are cited; endnotes are gathered here, at their list.
    case 'footnoteList':
      return ''
    case 'endnoteList':
      return context.packages.has('endnotes') ? '\\theendnotes' : ''
    case 'referenceList': {
      const items = node.content.children.map(
        (item) => `\\bibitem{${citeKey(item.attrs.id)}} ${inline(item, context)}`,
      )
      return `\\begin{thebibliography}{${items.length}}\n${items.join('\n')}\n\\end{thebibliography}`
    }
    case 'blockquote':
      return `\\begin{quote}\n${children()}\n\\end{quote}`
    case 'codeBlock': {
      context.packages.add('listings')
      const language = LISTINGS[String(node.attrs.language ?? '').toLowerCase()]
      const option = language ? `[language=${language}]` : ''
      return `\\begin{lstlisting}${option}\n${node.textContent}\n\\end{lstlisting}`
    }
    case 'bulletList':
    case 'orderedList':
    case 'taskList': {
      const environment = node.type.name === 'orderedList' ? 'enumerate' : 'itemize'
      if (node.type.name === 'taskList') context.packages.add('amssymb')
      const items = node.content.children.map((item) => {
        const box =
          item.type.name === 'taskItem'
            ? item.attrs.checked === true
              ? '[$\\boxtimes$] '
              : '[$\\square$] '
            : ''
        const body = item.content.children.map((child) => block(child, context)).join('\n\n')
        return `  \\item${box ? box : ' '}${body}`
      })
      return `\\begin{${environment}}\n${items.join('\n')}\n\\end{${environment}}`
    }
    case 'horizontalRule':
      return '\\noindent\\rule{\\linewidth}{0.4pt}'
    case 'mathBlock': {
      context.packages.add('amsmath')
      const latex = equation(node, context)
      return node.attrs.numbered === true
        ? `\\begin{equation}\n${latex}\n\\end{equation}`
        : `\\[\n${latex}\n\\]`
    }
    case 'image':
      context.packages.add('graphicx')
      return imageOf(node)
    case 'figure':
      context.packages.add('graphicx')
      return `\\begin{figure}[h]\n\\centering\n${children()}\n\\end{figure}`
    case 'caption':
      return `\\caption{${inline(node, context)}}`
    case 'table':
      return table(node, context)
    default:
      // Anything else keeps its words: a callout, a card, a column.
      if (node.isTextblock) return inline(node, context)
      if (node.content.childCount === 0) return escapeLaTeX(exportTextOf(node))
      return children()
  }
}

/**
 * A table as `tabular`, a column per column of its grid, each cell's text on
 * one line. A merged cell's text is at its top left and its other places are
 * empty, so every row keeps its columns.
 */
function table(node: EditorNode, context: Context): string {
  const map = TableMap.of(node)
  const width = Math.max(1, map.width)
  const lines: string[] = []
  for (let row = 0; row < map.height; row++) {
    const cells: string[] = []
    for (let column = 0; column < width; column++) {
      const placed = map.at(row, column)
      const own = placed && placed.top === row && placed.left === column
      cells.push(
        own
          ? placed.node.content.children
              .map((child) => (child.isTextblock ? inline(child, context) : block(child, context)))
              .join(' ')
          : '',
      )
    }
    lines.push(`${cells.join(' & ')} \\\\ \\hline`)
  }
  const columns = Array.from({ length: width }, () => 'l').join(' | ')
  return `\\begin{tabular}{| ${columns} |}\n\\hline\n${lines.join('\n')}\n\\end{tabular}`
}

/** The document as a LaTeX file, preamble and all. */
export function serializeToLaTeX(doc: EditorNode, options: LaTeXOptions = {}): string {
  const notes = new Map<string, EditorNode>()
  const labels = new Set<string>()
  const collect = (node: EditorNode): void => {
    if (node.type.name === 'footnoteItem') notes.set(`footnoteRef:${String(node.attrs.id)}`, node)
    if (node.type.name === 'endnoteItem') notes.set(`endnoteRef:${String(node.attrs.id)}`, node)
    if (node.type.name === 'heading' && typeof node.attrs.id === 'string') labels.add(node.attrs.id)
    for (const child of node.content.children) collect(child)
  }
  collect(doc)
  const context: Context = { packages: new Set(['hyperref', 'ulem']), notes, labels }
  const blocks = doc.content.children
  const first = blocks[0]
  // A level-one heading first is the title, as `\maketitle` sets it.
  const leadingTitle =
    first?.type.name === 'heading' && Number(first.attrs.level) === 1 ? first.textContent : null
  const title = options.title ?? leadingTitle
  const body = (leadingTitle && !options.title ? blocks.slice(1) : blocks)
    .map((child) => block(child, context))
    .filter(Boolean)
    .join('\n\n')
  // The symbols this text uses that pdfLaTeX cannot set, mapped for it.
  const symbols = Object.entries(SYMBOLS).filter(([char]) => body.includes(char))
  if (symbols.length > 0) context.packages.add('amssymb')
  const packages = [...context.packages]
    .sort()
    .map((name) =>
      name === 'ulem'
        ? '\\usepackage[normalem]{ulem}'
        : name === 'mhchem'
          ? '\\usepackage[version=4]{mhchem}'
          : `\\usepackage{${name}}`,
    )
  // pdfLaTeX reads UTF-8 through inputenc; XeLaTeX and LuaLaTeX read it
  // themselves, and set any script, Arabic too, in a system font.
  const engines = [
    '\\usepackage{iftex}',
    '\\ifPDFTeX',
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage[T1]{fontenc}',
    ...(symbols.length > 0 ? ['\\usepackage{newunicodechar}'] : []),
    ...symbols.map(([char, command]) => `\\newunicodechar{${char}}{${command}}`),
    '\\else',
    '\\usepackage{fontspec}',
    '\\fi',
  ]
  // Listings reads a byte at a time under pdfLaTeX: each symbol in code is
  // spelled out for it, as `literate` does.
  const literate =
    context.packages.has('listings') && symbols.length > 0
      ? [
          `\\ifPDFTeX\\lstset{literate=${symbols.map(([char, command]) => `{${char}}{{${command}}}1`).join(' ')}}\\fi`,
        ]
      : []
  const head = [
    '\\documentclass{article}',
    ...engines,
    ...packages,
    ...literate,
    ...(title ? [`\\title{${escapeLaTeX(title)}}`] : []),
    ...(options.author ? [`\\author{${escapeLaTeX(options.author)}}`] : []),
    ...(title ? ['\\date{}'] : []),
  ]
  return `${head.join('\n')}\n\n\\begin{document}\n${title ? '\\maketitle\n\n' : ''}${body}\n\\end{document}\n`
}
