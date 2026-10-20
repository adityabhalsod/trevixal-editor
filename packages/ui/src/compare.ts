import type { EditorNode } from '@trevixal/core'

/**
 * Two documents compared block by block, as Word's Compare does: the blocks
 * only one has are added or removed, and a block both have in a changed form
 * shows the words that went and came.
 */

/** A run of words the same on both sides, or only on one. */
export interface WordPart {
  readonly text: string
  readonly kind: 'same' | 'added' | 'removed'
}

export interface ComparisonRow {
  readonly kind: 'same' | 'added' | 'removed' | 'changed'
  /** The block's text before and after; null on the side it is missing from. */
  readonly before: string | null
  readonly after: string | null
  /** What the block is: a heading, a paragraph, an image. */
  readonly label: string
  /** For a changed block, its words in order: kept, taken out, put in. */
  readonly words?: readonly WordPart[]
}

/** One block as compared: what it is, and its words. */
interface Line {
  readonly label: string
  readonly text: string
}

/** The biggest pair of sequences compared item by item; past it, one side is all removed and the other all added. */
const MAX_PAIRS = 4_000_000

const LABELS: Readonly<Record<string, string>> = {
  paragraph: 'Paragraph',
  codeBlock: 'Code',
  mathBlock: 'Equation',
  image: 'Image',
  figure: 'Figure',
  horizontalRule: 'Rule',
  drawing: 'Drawing',
}

/** How a block is named in the comparison. */
function labelOf(node: EditorNode): string {
  if (node.type.name === 'heading') return `Heading ${Number(node.attrs.level) || 1}`
  return LABELS[node.type.name] ?? node.type.name
}

/** A block without text, an image or an equation, compared by what it shows. */
function atomText(node: EditorNode): string {
  for (const name of ['latex', 'src', 'alt', 'label', 'href']) {
    const value = node.attrs[name]
    if (typeof value === 'string' && value) return value
  }
  return ''
}

/** Every block with words in it, and every block-level atom, in reading order. */
function linesOf(doc: EditorNode): Line[] {
  const lines: Line[] = []
  const walk = (node: EditorNode): void => {
    if (node.isTextblock) {
      lines.push({ label: labelOf(node), text: node.textContent })
      return
    }
    if (node.isAtom && !node.isInline) {
      lines.push({ label: labelOf(node), text: atomText(node) })
      return
    }
    for (const child of node.content.children) walk(child)
  }
  for (const child of doc.content.children) walk(child)
  return lines
}

/**
 * The longest run two sequences share, as the pairs of indexes it keeps,
 * found the classic way. Past MAX_PAIRS nothing is shared.
 */
function sharedRun<T>(
  a: readonly T[],
  b: readonly T[],
  same: (x: T, y: T) => boolean,
): [number, number][] {
  if (a.length * b.length > MAX_PAIRS) return []
  const table = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) {
    const row = table[i] as Uint32Array
    const below = table[i + 1] as Uint32Array
    for (let j = b.length - 1; j >= 0; j--) {
      row[j] = same(a[i] as T, b[j] as T)
        ? (below[j + 1] as number) + 1
        : Math.max(below[j] as number, row[j + 1] as number)
    }
  }
  const pairs: [number, number][] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (same(a[i] as T, b[j] as T)) {
      pairs.push([i, j])
      i += 1
      j += 1
    } else if ((table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0)) {
      i += 1
    } else {
      j += 1
    }
  }
  return pairs
}

/** Words and the spaces between them, each its own token. */
const TOKENS = /\s+|[^\s]+/g

/** The words two versions of one block share, and the ones each has alone. */
export function wordDiff(before: string, after: string): WordPart[] {
  const a = before.match(TOKENS) ?? []
  const b = after.match(TOKENS) ?? []
  const parts: WordPart[] = []
  const push = (text: string, kind: WordPart['kind']): void => {
    const last = parts[parts.length - 1]
    if (last?.kind === kind) parts[parts.length - 1] = { text: last.text + text, kind }
    else parts.push({ text, kind })
  }
  let i = 0
  let j = 0
  for (const [x, y] of [...sharedRun(a, b, (p, q) => p === q), [a.length, b.length]]) {
    while (i < (x as number)) push(a[i++] as string, 'removed')
    while (j < (y as number)) push(b[j++] as string, 'added')
    if (i < a.length && j < b.length) {
      push(a[i] as string, 'same')
      i += 1
      j += 1
    }
  }
  return parts
}

/**
 * Compare two documents block by block. Blocks both have, word for word,
 * are the same; between them, a block taken out and one put in at the same
 * place are one changed block; any left over were added or removed.
 */
export function compareDocuments(before: EditorNode, after: EditorNode): ComparisonRow[] {
  const a = linesOf(before)
  const b = linesOf(after)
  const rows: ComparisonRow[] = []
  const between = (removed: Line[], added: Line[]): void => {
    const paired = Math.min(removed.length, added.length)
    for (let k = 0; k < paired; k++) {
      const old = removed[k] as Line
      const next = added[k] as Line
      rows.push({
        kind: 'changed',
        before: old.text,
        after: next.text,
        label: next.label,
        words: wordDiff(old.text, next.text),
      })
    }
    for (const line of removed.slice(paired)) {
      rows.push({ kind: 'removed', before: line.text, after: null, label: line.label })
    }
    for (const line of added.slice(paired)) {
      rows.push({ kind: 'added', before: null, after: line.text, label: line.label })
    }
  }
  let i = 0
  let j = 0
  const same = (x: Line, y: Line): boolean => x.text === y.text && x.label === y.label
  for (const [x, y] of [...sharedRun(a, b, same), [a.length, b.length] as [number, number]]) {
    between(a.slice(i, x), b.slice(j, y))
    i = x
    j = y
    if (i < a.length && j < b.length) {
      const line = a[i] as Line
      rows.push({ kind: 'same', before: line.text, after: line.text, label: line.label })
      i += 1
      j += 1
    }
  }
  return rows
}

/** How many blocks each kind of difference touched. */
export function comparisonCounts(
  rows: readonly ComparisonRow[],
): Record<ComparisonRow['kind'], number> {
  const counts = { same: 0, added: 0, removed: 0, changed: 0 }
  for (const row of rows) counts[row.kind] += 1
  return counts
}

export interface ComparisonOptions {
  readonly document: Document
  readonly title?: string
  /** What each side is: "Version: Draft 2", "Now". */
  readonly beforeLabel: string
  readonly afterLabel: string
}

/** One side of a row: its words, the changed ones marked, or nothing. */
function cell(document: Document, row: ComparisonRow, side: 'before' | 'after'): HTMLElement {
  const element = document.createElement('div')
  element.className = `trevixal-compare__cell trevixal-compare__cell--${side}`
  const text = row[side]
  if (text === null) {
    element.classList.add('trevixal-compare__cell--empty')
    return element
  }
  if (row.kind === 'changed' && row.words) {
    const hidden = side === 'before' ? 'added' : 'removed'
    for (const part of row.words) {
      if (part.kind === hidden) continue
      if (part.kind === 'same') {
        element.appendChild(document.createTextNode(part.text))
        continue
      }
      const mark = document.createElement(part.kind === 'added' ? 'ins' : 'del')
      mark.textContent = part.text
      element.appendChild(mark)
    }
  } else {
    element.textContent = text || '(empty)'
  }
  return element
}

/**
 * Show a comparison side by side: the earlier version on the left, the later
 * on the right, words taken out struck and words put in underlined. Blocks
 * that did not change are hidden until asked for.
 */
export function openComparison(
  rows: readonly ComparisonRow[],
  options: ComparisonOptions,
): Promise<void> {
  const { document } = options
  const overlay = document.createElement('div')
  overlay.className = 'trevixal-dialog-overlay'
  const dialog = document.createElement('div')
  dialog.className = 'trevixal-dialog trevixal-compare'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  const title = options.title ?? 'Compare'
  dialog.setAttribute('aria-label', title)
  const heading = document.createElement('h2')
  heading.className = 'trevixal-dialog__title'
  heading.textContent = title
  const counts = comparisonCounts(rows)
  const summary = document.createElement('p')
  summary.className = 'trevixal-dialog__body'
  summary.setAttribute('role', 'status')
  const changes = counts.changed + counts.added + counts.removed
  summary.textContent =
    changes === 0
      ? 'No differences.'
      : `${counts.changed} changed, ${counts.added} added, ${counts.removed} removed.`
  const toggle = document.createElement('label')
  toggle.className = 'trevixal-dialog__field trevixal-dialog__field--inline'
  const showAll = document.createElement('input')
  showAll.type = 'checkbox'
  showAll.className = 'trevixal-dialog__input--checkbox'
  const toggleLabel = document.createElement('span')
  toggleLabel.textContent = 'Show the blocks that did not change'
  toggle.append(showAll, toggleLabel)

  const grid = document.createElement('div')
  grid.className = 'trevixal-compare__grid'
  const head = (text: string): HTMLElement => {
    const element = document.createElement('div')
    element.className = 'trevixal-compare__head'
    element.textContent = text
    return element
  }
  grid.append(head(options.beforeLabel), head(options.afterLabel))
  const bodies: HTMLElement[] = []
  for (const row of rows) {
    const line = document.createElement('div')
    line.className = `trevixal-compare__row trevixal-compare__row--${row.kind}`
    line.dataset.kind = row.kind
    line.title = row.label
    line.append(cell(document, row, 'before'), cell(document, row, 'after'))
    line.hidden = row.kind === 'same'
    bodies.push(line)
  }
  grid.append(...bodies)
  showAll.addEventListener('change', () => {
    for (const line of bodies) if (line.dataset.kind === 'same') line.hidden = !showAll.checked
  })

  const actions = document.createElement('div')
  actions.className = 'trevixal-dialog__actions'
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'trevixal-dialog__button trevixal-dialog__button--primary'
  close.textContent = 'Close'
  actions.appendChild(close)
  dialog.append(heading, summary, toggle, grid, actions)
  overlay.appendChild(dialog)
  document.body.appendChild(overlay)

  return new Promise((resolve) => {
    const finish = (): void => {
      document.removeEventListener('keydown', onKey, true)
      overlay.remove()
      resolve()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      finish()
    }
    document.addEventListener('keydown', onKey, true)
    close.addEventListener('click', finish)
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) finish()
    })
    close.focus()
  })
}
