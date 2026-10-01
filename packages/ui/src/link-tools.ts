import {
  type Editor,
  type EditorNode,
  type EditorState,
  Fragment,
  type Path,
  ReplaceInlineStep,
  SetNodeAttrsStep,
  TextSelection,
  type Transaction,
  inlineSize,
  nodeAtPath,
  pos,
  safeElementId,
} from '@trevixal/core'

// ------------------------------------------------------------- block targets

/** A block a link can point at, whether or not it has an id yet. */
export interface BlockTarget {
  /** The top-level block's index. */
  readonly index: number
  /** Where its link target is: the block, or the first block inside it that can carry an id. */
  readonly path: Path
  readonly id: string | null
  /** What it is and how it starts, for a list to show. */
  readonly label: string
}

const KIND_LABELS: Readonly<Record<string, string>> = {
  heading: 'Heading',
  paragraph: 'Paragraph',
  codeBlock: 'Code',
  blockquote: 'Quote',
  bulletList: 'List',
  orderedList: 'List',
  taskList: 'Tasks',
  table: 'Table',
  callout: 'Callout',
}

/** The block itself, or the first block in it with an `id` to point at. */
function linkableIn(node: EditorNode, path: Path): { path: Path; node: EditorNode } | null {
  if (node.type.spec.attrs?.id?.default === null) return { path, node }
  for (let index = 0; index < node.childCount; index++) {
    const found = linkableIn(node.child(index), [...path, index])
    if (found) return found
  }
  return null
}

/** The top-level block at `index`, or the first block in it that can carry an id; null when none can. */
export function linkableBlock(
  doc: EditorNode,
  index: number,
): { path: Path; node: EditorNode } | null {
  const block = doc.content.maybeChild(index)
  return block ? linkableIn(block, [index]) : null
}

/**
 * Every top-level block a link can point at, in reading order: headings,
 * paragraphs, code, lists, tables and the rest, each by what it is and its
 * first words. A block with nothing in it that can carry an id is left out.
 */
export function blockTargets(doc: EditorNode): BlockTarget[] {
  const targets: BlockTarget[] = []
  doc.content.children.forEach((block, index) => {
    const found = linkableIn(block, [index])
    if (!found) return
    const words = block.textContent.replace(/\s+/g, ' ').trim()
    if (!words && !safeElementId(found.node.attrs.id)) return
    const kind = KIND_LABELS[block.type.name] ?? 'Block'
    const label = words.length > 60 ? `${words.slice(0, 57)}…` : words
    targets.push({
      index,
      path: found.path,
      id: safeElementId(found.node.attrs.id),
      label: `${kind}: ${label || '(empty)'}`,
    })
  })
  return targets
}

/** Every id the document already uses, so a new one does not clash. */
export function idsIn(doc: EditorNode): Set<string> {
  const ids = new Set<string>()
  const visit = (node: EditorNode): void => {
    const id = safeElementId(node.attrs.id)
    if (id) ids.add(id)
    if (!node.isText) for (const child of node.content.children) visit(child)
  }
  visit(doc)
  return ids
}

/** An id from a block's words: `the-plan`, starting with a letter as an HTML id must. */
export function slugFor(text: string, taken: ReadonlySet<string>): string {
  const slug = text
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  const base = /^[a-z]/.test(slug) && !slug.startsWith('tvx-') ? slug : `block-${slug || 'link'}`
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  return id
}

/**
 * The id a link to a block points at, given to the block first when it has
 * none. The transaction carries the new id; null when the block cannot be
 * linked to.
 */
export function ensureBlockId(
  state: EditorState,
  index: number,
): { id: string; tr: Transaction | null } | null {
  const block = state.doc.content.maybeChild(index)
  const found = block ? linkableIn(block, [index]) : null
  if (!block || !found) return null
  const own = safeElementId(found.node.attrs.id)
  if (own) return { id: own, tr: null }
  const id = slugFor(block.textContent, idsIn(state.doc))
  return {
    id,
    tr: state.tr.step(new SetNodeAttrsStep(found.path, { ...found.node.attrs, id })),
  }
}

// ----------------------------------------------------------------- checking

/** One link in the document, where it is and where it points. */
export interface LinkRef {
  readonly href: string
  readonly text: string
  /** The textblock it is in, and its range there. */
  readonly path: Path
  readonly from: number
  readonly to: number
}

/** Every link in the document, a run of linked text once however many marks split it. */
export function linksIn(doc: EditorNode): LinkRef[] {
  const links: LinkRef[] = []
  const visit = (node: EditorNode, path: Path): void => {
    if (node.isTextblock) {
      let offset = 0
      let open: { href: string; text: string; from: number } | null = null
      const close = (end: number): void => {
        if (open) links.push({ href: open.href, text: open.text, path, from: open.from, to: end })
        open = null
      }
      for (const child of node.content.children) {
        const size = inlineSize(child)
        const link = child.isText
          ? child.marks.find((mark) => mark.type.name === 'link')
          : undefined
        const href = typeof link?.attrs.href === 'string' ? link.attrs.href : null
        if (href && open && open.href === href) {
          open.text += child.textContent
        } else {
          close(offset)
          if (href) open = { href, text: child.textContent, from: offset }
        }
        offset += size
      }
      close(offset)
      return
    }
    node.content.children.forEach((child, index) => visit(child, [...path, index]))
  }
  visit(doc, [])
  return links
}

/** What a check found out about a link. */
export type LinkStatus = 'ok' | 'broken' | 'unknown'

export interface LinkReport extends LinkRef {
  readonly status: LinkStatus
  /** Why it is broken, in words. */
  readonly reason?: string
}

export interface CheckLinksOptions {
  /**
   * Whether an address outside the document answers, supplied by the host
   * because reaching out is the host's call. Without it, outside links are
   * only checked for being well formed.
   */
  readonly checkURL?: (href: string) => Promise<LinkStatus>
}

/** A link that cannot be followed however the network is: a bad address, or a target not in the document. */
function staticProblem(href: string, ids: ReadonlySet<string>): string | null {
  if (href.startsWith('#')) {
    let id = href.slice(1)
    try {
      id = decodeURIComponent(id)
    } catch {
      // A malformed escape is a literal id.
    }
    if (!id) return 'points at no place'
    return ids.has(id) ? null : `nothing in the document is called “${id}”`
  }
  if (href.startsWith('mailto:')) {
    return /^mailto:[^@\s]+@[^@\s]+\.[^@\s]+/i.test(href) ? null : 'not an email address'
  }
  try {
    new URL(href)
    return null
  } catch {
    // A relative address may well work where the file is kept; one with a
    // space in it will not.
    return href.trim() === '' || /\s/.test(href) ? 'not a complete address' : null
  }
}

/**
 * Check every link in the document: a link inside it must name a place
 * that is there, an email address must look like one, a web address must be
 * complete, and, with `checkURL`, answer. Links go in reading order.
 */
export async function checkLinks(
  doc: EditorNode,
  options: CheckLinksOptions = {},
): Promise<LinkReport[]> {
  const ids = idsIn(doc)
  const reports: LinkReport[] = []
  const checked = new Map<string, Promise<LinkStatus>>()
  for (const link of linksIn(doc)) {
    const problem = staticProblem(link.href, ids)
    if (problem) {
      reports.push({ ...link, status: 'broken', reason: problem })
      continue
    }
    const outside = /^https?:/i.test(link.href)
    if (!outside || !options.checkURL) {
      reports.push({ ...link, status: outside ? 'unknown' : 'ok' })
      continue
    }
    let status = checked.get(link.href)
    if (!status) {
      status = options.checkURL(link.href).catch(() => 'broken' as const)
      checked.set(link.href, status)
    }
    const result = await status
    reports.push({
      ...link,
      status: result,
      ...(result === 'broken' ? { reason: 'the address does not answer' } : {}),
    })
  }
  return reports
}

/** The links inside the document that point at nothing, with no network needed: what an export warns about. */
export function brokenInternalLinks(doc: EditorNode): LinkRef[] {
  const ids = idsIn(doc)
  return linksIn(doc).filter((link) => link.href.startsWith('#') && staticProblem(link.href, ids))
}

/**
 * Whether an address answers, as a browser can find out: a request with no
 * CORS, which only fails when nothing is there. What it says is `ok` for
 * any answer at all, since a no-CORS reply hides its status.
 */
export async function reachableURL(href: string, timeoutMs = 6000): Promise<LinkStatus> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    await fetch(href, { method: 'HEAD', mode: 'no-cors', signal: controller.signal })
    return 'ok'
  } catch {
    return 'broken'
  } finally {
    clearTimeout(timer)
  }
}

/** Select a link's text, to go to it from a report. */
export function selectLink(editor: Editor, link: LinkRef): void {
  editor.exec((state) =>
    state.tr.setSelection(new TextSelection(pos(link.path, link.from), pos(link.path, link.to))),
  )
  editor.view?.scrollSelectionIntoView({ block: 'center' })
  editor.view?.focus()
}

// ------------------------------------------------------- pasted links' titles

/** A pasted address, alone on the clipboard. */
const LONE_URL = /^(?:https?:\/\/|www\.)\S+$/i

/**
 * Give a pasted link its page's title: paste an address and it goes in as
 * the address, then, once `fetchTitle` answers, the linked text becomes the
 * page's title. The link keeps pointing where it did. The host supplies
 * `fetchTitle` because fetching is the host's call, as image upload is. The
 * text is left alone if it was edited in the meantime. Returns a disposer.
 */
export function enableLinkTitles(
  editor: Editor,
  fetchTitle: (href: string) => Promise<string | null>,
): () => void {
  const view = editor.view
  if (!view) return () => {}
  const onPaste = (event: ClipboardEvent): void => {
    const pasted = event.clipboardData?.getData('text/plain')?.trim() ?? ''
    if (!LONE_URL.test(pasted) || !editor.state.selection.empty) return
    // After the editor has put the link in.
    setTimeout(() => {
      const found = linksIn(editor.state.doc).find(
        (link) =>
          link.text === pasted &&
          link.path.join('/') === editor.state.selection.from.path.join('/'),
      )
      if (!found) return
      void fetchTitle(found.href)
        .then((title) => {
          const clean = title?.replace(/\s+/g, ' ').trim()
          if (!clean) return
          // Found again: the document may have moved on while the page answered.
          const still = linksIn(editor.state.doc).find(
            (link) => link.href === found.href && link.text === pasted,
          )
          if (!still) return
          editor.exec((state) => {
            const block = nodeAtPath(state.doc, still.path)
            const marks = block ? marksAt(block, still.from) : []
            return state.tr.step(
              new ReplaceInlineStep(
                still.path,
                still.from,
                still.to,
                Fragment.of(state.schema.text(clean, marks)),
              ),
            )
          })
        })
        .catch(() => undefined)
    }, 0)
  }
  view.dom.addEventListener('paste', onPaste)
  return () => view.dom.removeEventListener('paste', onPaste)
}

/** The marks on the text at an inline offset of a textblock. */
function marksAt(block: EditorNode, offset: number): EditorNode['marks'] {
  let start = 0
  for (const child of block.content.children) {
    const size = inlineSize(child)
    if (child.isText && offset >= start && offset < start + size) return child.marks
    start += size
  }
  return []
}

// ------------------------------------------------------------------ report

/**
 * The link report: every link that does not work, what is wrong with it,
 * and a button to go to it. Says so when every link works.
 */
export function openLinkReport(
  document: Document,
  editor: Editor,
  reports: readonly LinkReport[],
): void {
  const broken = reports.filter((report) => report.status === 'broken')
  const unknown = reports.filter((report) => report.status === 'unknown').length
  const overlay = document.createElement('div')
  overlay.className = 'trevixal-dialog-overlay'
  const dialog = document.createElement('div')
  dialog.className = 'trevixal-dialog trevixal-link-report'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', 'Check links')
  const heading = document.createElement('h2')
  heading.className = 'trevixal-dialog__title'
  heading.textContent = 'Check links'
  const summary = document.createElement('p')
  summary.className = 'trevixal-dialog__body'
  summary.setAttribute('role', 'status')
  const counted = `${reports.length} link${reports.length === 1 ? '' : 's'} checked`
  summary.textContent =
    broken.length === 0
      ? `${counted}. None is broken.`
      : `${counted}, ${broken.length} broken.${unknown > 0 ? ` ${unknown} could not be reached from here, and may still work.` : ''}`
  const list = document.createElement('ul')
  list.className = 'trevixal-link-report__list'
  const close = (): void => {
    document.removeEventListener('keydown', onKey, true)
    overlay.remove()
  }
  for (const report of broken) {
    const item = document.createElement('li')
    const words = document.createElement('span')
    words.className = 'trevixal-link-report__text'
    words.textContent = `“${report.text}” → ${report.href}`
    const reason = document.createElement('span')
    reason.className = 'trevixal-dialog__hint'
    reason.textContent = report.reason ?? 'broken'
    const go = document.createElement('button')
    go.type = 'button'
    go.className = 'trevixal-dialog__button'
    go.textContent = 'Go to'
    go.addEventListener('click', () => {
      close()
      selectLink(editor, report)
    })
    item.append(words, reason, go)
    list.appendChild(item)
  }
  const actions = document.createElement('div')
  actions.className = 'trevixal-dialog__actions'
  const done = document.createElement('button')
  done.type = 'button'
  done.className = 'trevixal-dialog__button trevixal-dialog__button--primary'
  done.textContent = 'Done'
  done.addEventListener('click', () => {
    close()
    editor.view?.focus()
  })
  actions.appendChild(done)
  dialog.append(heading, summary, list, actions)
  overlay.appendChild(dialog)
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    close()
    editor.view?.focus()
  }
  document.addEventListener('keydown', onKey, true)
  document.body.appendChild(overlay)
  done.focus()
}
