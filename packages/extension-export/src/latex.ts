import type { EditorNode, Mark } from '@trevixal/core'

/**
 * A document as LaTeX source: an `article` with the packages its content
 * needs, headings as sections, lists, tables, code, equations and links,
 * every character LaTeX treats specially escaped. What LaTeX has no way to
 * say (a callout, an embed) keeps its text.
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
function inline(block: EditorNode): string {
  return block.content.children
    .map((child) => {
      if (child.isText) return marked(escapeLaTeX(child.textContent), child.marks)
      switch (child.type.name) {
        case 'hardBreak':
          return '\\\\\n'
        case 'math':
          return `$${String(child.attrs.latex ?? '')}$`
        case 'image':
          return imageOf(child)
        default:
          return escapeLaTeX(child.textContent)
      }
    })
    .join('')
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
}

/** One block, and the blocks in it, as LaTeX. */
function block(node: EditorNode, context: Context): string {
  const children = (): string =>
    node.content.children
      .map((child) => block(child, context))
      .filter(Boolean)
      .join('\n\n')
  switch (node.type.name) {
    case 'paragraph':
      return inline(node)
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs.level) || 1))
      return `\\${SECTIONS[level - 1]}{${inline(node)}}`
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
      const latex = String(node.attrs.latex ?? '')
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
      return `\\caption{${inline(node)}}`
    case 'table':
      return table(node, context)
    default:
      // Anything else keeps its words: a callout, a card, a column.
      if (node.isTextblock) return inline(node)
      if (node.content.childCount === 0) return ''
      return children()
  }
}

/** A table as `tabular`, a column per cell of its widest row, each cell's text on one line. */
function table(node: EditorNode, context: Context): string {
  const rows = node.content.children
  const width = Math.max(1, ...rows.map((row) => row.childCount))
  const lines = rows.map((row) => {
    const cells = row.content.children.map((cell) =>
      cell.content.children
        .map((child) => (child.isTextblock ? inline(child) : block(child, context)))
        .join(' '),
    )
    while (cells.length < width) cells.push('')
    return `${cells.join(' & ')} \\\\ \\hline`
  })
  const columns = Array.from({ length: width }, () => 'l').join(' | ')
  return `\\begin{tabular}{| ${columns} |}\n\\hline\n${lines.join('\n')}\n\\end{tabular}`
}

/** The document as a LaTeX file, preamble and all. */
export function serializeToLaTeX(doc: EditorNode, options: LaTeXOptions = {}): string {
  const context: Context = { packages: new Set(['hyperref', 'ulem']) }
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
  const packages = [...context.packages]
    .sort()
    .map((name) => (name === 'ulem' ? '\\usepackage[normalem]{ulem}' : `\\usepackage{${name}}`))
  const head = [
    '\\documentclass{article}',
    '\\usepackage[utf8]{inputenc}',
    ...packages,
    ...(title ? [`\\title{${escapeLaTeX(title)}}`] : []),
    ...(options.author ? [`\\author{${escapeLaTeX(options.author)}}`] : []),
    ...(title ? ['\\date{}'] : []),
  ]
  return `${head.join('\n')}\n\n\\begin{document}\n${title ? '\\maketitle\n\n' : ''}${body}\n\\end{document}\n`
}
