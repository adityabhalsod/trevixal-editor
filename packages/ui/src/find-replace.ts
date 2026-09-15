import {
  type Editor,
  type EditorNode,
  type Path,
  type SearchMatch,
  type TextNode,
  TextSelection,
  inlineSize,
  pos,
  replaceMatch,
  textblocks,
} from '@trevixal/core'
import { type IconName, createIcon } from './icons'

/** The decoration layer this widget owns. Never written to by anything else. */
const LAYER = 'find-replace'

/** Hard ceiling on matches, so a pattern like `\b` cannot flood the renderer. */
const DEFAULT_MATCH_LIMIT = 5000

export interface FindReplaceQuery {
  readonly query: string
  readonly caseSensitive: boolean
  readonly wholeWord: boolean
  readonly regex: boolean
}

/** What a search produced: matches, or a message explaining why there are none. */
export interface FindReplaceResult {
  readonly matches: readonly SearchMatch[]
  /** Set when the pattern itself was rejected (invalid regex). */
  readonly error: string | null
  /** True when the match limit stopped the scan early. */
  readonly truncated: boolean
}

export interface FindReplaceOptions {
  /** Where the bar is appended. */
  readonly container: HTMLElement
  /** Start hidden (default true). The bar is opened from a menu or a key. */
  readonly startHidden?: boolean
  /** Hide the replace row for a find-only bar. */
  readonly showReplace?: boolean
  /** Cap on total matches per search (default 5000). */
  readonly matchLimit?: number
  /** Called whenever a search completes, for a host-owned status readout. */
  readonly onResult?: (result: FindReplaceResult, activeIndex: number) => void
}

export interface FindReplace {
  readonly element: HTMLElement
  readonly isOpen: boolean
  /** Show the bar and focus the query field. */
  open(): void
  /** Hide the bar and clear its highlights. */
  close(): void
  /** Run a search without touching the inputs, the programmatic entry point. */
  search(query: FindReplaceQuery): FindReplaceResult
  readonly matches: readonly SearchMatch[]
  /** Index of the highlighted match, or -1 when there is none. */
  readonly activeIndex: number
  findNext(): void
  findPrevious(): void
  /** Replace the active match. Returns true when the document changed. */
  replaceCurrent(replacement: string): boolean
  /** Replace every match. Returns how many were replaced. */
  replaceAllMatches(replacement: string): number
  destroy(): void
}

/** A block's text with inline atoms as placeholders, so offsets stay aligned. */
function searchableText(block: EditorNode): string {
  let text = ''
  for (const child of block.content.children) {
    if (child.isText) text += (child as TextNode).text
    else text += '￼'.repeat(inlineSize(child))
  }
  return text
}

function escapeRegExp(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Compile the user's query into a global regex.
 *
 * Everything the user can type is funnelled through here, including plain
 * text, which is escaped rather than special-cased. One code path means the
 * whole-word and case flags behave identically in both modes.
 *
 * Returns the error message instead of throwing: an unfinished pattern like
 * `(` is a normal thing to have on screen while typing, not an exception.
 */
export function compileSearch(query: FindReplaceQuery): { regex: RegExp } | { error: string } {
  if (query.query.length === 0) return { error: '' }
  let source = query.regex ? query.query : escapeRegExp(query.query)
  if (query.wholeWord) {
    // \b is meaningless against a pattern starting or ending with a
    // non-word character, so only add the boundaries that can match.
    const leading = /^\w/.test(query.regex ? query.query : source) ? '\\b' : ''
    const trailing = /\w$/.test(query.regex ? query.query : source) ? '\\b' : ''
    source = `${leading}(?:${source})${trailing}`
  }
  try {
    return { regex: new RegExp(source, query.caseSensitive ? 'gu' : 'giu') }
  } catch {
    // A `u`-flag rejection is often just an escape the user meant literally
    // (`\d` is fine, `\p{` half-typed is not); retry without it before
    // reporting the pattern as broken.
    try {
      return { regex: new RegExp(source, query.caseSensitive ? 'g' : 'gi') }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Invalid pattern' }
    }
  }
}

/**
 * All matches across the document's textblocks.
 *
 * Two protections make this safe against patterns the user can legitimately
 * type. A zero-length match (`a*`, `(?:)`, `^`) advances `lastIndex` by one
 * manually, without that the loop never terminates. And the total is capped,
 * so a pattern matching at every position in a large document degrades into a
 * truncated result rather than freezing the editor while it decorates.
 */
export function findAll(
  doc: EditorNode,
  query: FindReplaceQuery,
  limit = DEFAULT_MATCH_LIMIT,
): FindReplaceResult {
  const compiled = compileSearch(query)
  if ('error' in compiled) {
    return { matches: [], error: compiled.error || null, truncated: false }
  }
  const regex = compiled.regex
  const matches: SearchMatch[] = []
  let truncated = false

  for (const { path, node } of textblocks(doc)) {
    if (truncated) break
    const haystack = searchableText(node)
    regex.lastIndex = 0
    let guard = haystack.length + 1
    let found = regex.exec(haystack)
    while (found !== null) {
      // A zero-length match leaves lastIndex where it was; step past it by
      // hand or `exec` returns the same empty match forever.
      if (found.index === regex.lastIndex) regex.lastIndex += 1
      if (found[0].length > 0) {
        matches.push({ path, from: found.index, to: found.index + found[0].length })
        if (matches.length >= limit) {
          truncated = true
          break
        }
      }
      // Even with lastIndex nudged forward, a pathological pattern should not
      // outlive the block it is scanning.
      if (--guard <= 0) break
      if (regex.lastIndex > haystack.length) break
      found = regex.exec(haystack)
    }
  }

  return { matches, error: null, truncated }
}

function labelledButton(
  doc: Document,
  label: string,
  icon: IconName | null,
  className: string,
): HTMLButtonElement {
  const button = doc.createElement('button')
  button.type = 'button'
  button.className = className
  button.title = label
  button.setAttribute('aria-label', label)
  const glyph = icon ? createIcon(doc, icon) : null
  if (glyph) button.appendChild(glyph)
  else button.textContent = label
  // The bar sits over the document; clicking it must not drop the selection.
  button.addEventListener('mousedown', (event) => event.preventDefault())
  return button
}

/**
 * The find-and-replace bar: the real implementation behind the menubar's
 * `findReplace` entry.
 *
 * Matches are drawn through the view's decoration layer under this widget's
 * own key, so search highlighting composes with code highlighting and track
 * changes instead of replacing them.
 */
export function createFindReplace(editor: Editor, options: FindReplaceOptions): FindReplace {
  const container = options.container
  const doc = container.ownerDocument
  const limit = options.matchLimit ?? DEFAULT_MATCH_LIMIT

  const root = doc.createElement('div')
  root.className = 'trevixal-findbar'
  root.setAttribute('role', 'search')
  root.hidden = options.startHidden !== false

  // ---- query row
  const findRow = doc.createElement('div')
  findRow.className = 'trevixal-findbar__row'

  const queryInput = doc.createElement('input')
  queryInput.type = 'text'
  queryInput.className = 'trevixal-findbar__input'
  queryInput.placeholder = 'Find'
  queryInput.setAttribute('aria-label', 'Find')

  const status = doc.createElement('span')
  status.className = 'trevixal-findbar__status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')

  const toggles = doc.createElement('div')
  toggles.className = 'trevixal-findbar__toggles'

  const makeToggle = (name: string, label: string, text: string): HTMLButtonElement => {
    const button = doc.createElement('button')
    button.type = 'button'
    button.className = 'trevixal-findbar__toggle'
    button.textContent = text
    button.title = label
    button.setAttribute('aria-label', label)
    button.setAttribute('aria-pressed', 'false')
    button.dataset.trevixalToggle = name
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', () => {
      const on = button.getAttribute('aria-pressed') !== 'true'
      button.setAttribute('aria-pressed', String(on))
      runSearch()
    })
    toggles.appendChild(button)
    return button
  }
  const caseToggle = makeToggle('caseSensitive', 'Match case', 'Aa')
  const wordToggle = makeToggle('wholeWord', 'Whole word', 'ab')
  const regexToggle = makeToggle('regex', 'Regular expression', '.*')

  const previous = labelledButton(doc, 'Previous match', null, 'trevixal-findbar__nav')
  previous.textContent = '‹'
  const next = labelledButton(doc, 'Next match', null, 'trevixal-findbar__nav')
  next.textContent = '›'
  const close = labelledButton(doc, 'Close', null, 'trevixal-findbar__close')
  close.textContent = '×'

  findRow.append(queryInput, toggles, status, previous, next, close)
  root.appendChild(findRow)

  // ---- replace row
  const replaceInput = doc.createElement('input')
  replaceInput.type = 'text'
  replaceInput.className = 'trevixal-findbar__input'
  replaceInput.placeholder = 'Replace with'
  replaceInput.setAttribute('aria-label', 'Replace with')

  const replaceOne = doc.createElement('button')
  replaceOne.type = 'button'
  replaceOne.className = 'trevixal-findbar__action'
  replaceOne.textContent = 'Replace'
  const replaceEvery = doc.createElement('button')
  replaceEvery.type = 'button'
  replaceEvery.className = 'trevixal-findbar__action'
  replaceEvery.textContent = 'Replace all'

  if (options.showReplace !== false) {
    const replaceRow = doc.createElement('div')
    replaceRow.className = 'trevixal-findbar__row'
    replaceRow.append(replaceInput, replaceOne, replaceEvery)
    root.appendChild(replaceRow)
  }

  const error = doc.createElement('p')
  error.className = 'trevixal-findbar__error'
  error.setAttribute('role', 'alert')
  error.hidden = true
  root.appendChild(error)

  // ---- state
  let matches: readonly SearchMatch[] = []
  let activeIndex = -1
  let lastResult: FindReplaceResult = { matches: [], error: null, truncated: false }

  const currentQuery = (): FindReplaceQuery => ({
    query: queryInput.value,
    caseSensitive: caseToggle.getAttribute('aria-pressed') === 'true',
    wholeWord: wordToggle.getAttribute('aria-pressed') === 'true',
    regex: regexToggle.getAttribute('aria-pressed') === 'true',
  })

  /** Paint the current matches, with the active one marked. */
  const decorate = (): void => {
    const view = editor.view
    if (!view) return
    if (matches.length === 0) {
      view.setDecorationLayer(LAYER, null)
      return
    }
    const byPath = new Map<string, { from: number; to: number; className: string }[]>()
    matches.forEach((match, index) => {
      const key = match.path.join('.')
      const list = byPath.get(key) ?? []
      list.push({
        from: match.from,
        to: match.to,
        className:
          index === activeIndex
            ? 'trevixal-search-match trevixal-search-match--active'
            : 'trevixal-search-match',
      })
      byPath.set(key, list)
    })
    // Resolve by path at decorate time: node identity is not stable across
    // transactions, but the paths we just searched are.
    const pathOf = new Map<EditorNode, string>()
    for (const { path, node } of textblocks(editor.state.doc)) pathOf.set(node, path.join('.'))
    view.setDecorationLayer(LAYER, (node) => {
      const key = pathOf.get(node)
      return key ? (byPath.get(key) ?? null) : null
    })
  }

  const renderStatus = (): void => {
    if (lastResult.error) {
      error.hidden = false
      error.textContent = `Invalid pattern: ${lastResult.error}`
      status.textContent = ''
      return
    }
    error.hidden = true
    error.textContent = ''
    if (queryInput.value.length === 0) {
      status.textContent = ''
      return
    }
    if (matches.length === 0) {
      status.textContent = 'No results'
      return
    }
    const total = lastResult.truncated ? `${matches.length}+` : String(matches.length)
    status.textContent = `${activeIndex + 1} of ${total}`
  }

  const runSearch = (): FindReplaceResult => {
    const query = currentQuery()
    lastResult = findAll(editor.state.doc, query, limit)
    matches = lastResult.matches
    activeIndex = matches.length > 0 ? 0 : -1
    decorate()
    renderStatus()
    options.onResult?.(lastResult, activeIndex)
    return lastResult
  }

  /** Move the caret over a match without stealing focus from the bar. */
  const revealActive = (): void => {
    const match = matches[activeIndex]
    if (!match) return
    const path = match.path as Path
    const selection = new TextSelection(pos(path, match.from), pos(path, match.to))
    editor.dispatch(editor.state.tr.setSelection(selection))
  }

  const step = (delta: number): void => {
    if (matches.length === 0) return
    activeIndex = (activeIndex + delta + matches.length) % matches.length
    decorate()
    renderStatus()
    revealActive()
    options.onResult?.(lastResult, activeIndex)
  }

  const replaceCurrent = (replacement: string): boolean => {
    const match = matches[activeIndex]
    if (!match) return false
    const changed = editor.exec(replaceMatch(match, replacement))
    // The document moved under every later offset, so re-scan rather than
    // trying to shift the stale match list.
    const at = activeIndex
    runSearch()
    if (matches.length > 0) {
      activeIndex = Math.min(at, matches.length - 1)
      decorate()
      renderStatus()
    }
    return changed
  }

  const replaceAllMatches = (replacement: string): number => {
    const found = findAll(editor.state.doc, currentQuery(), limit)
    if (found.error || found.matches.length === 0) return 0
    let count = 0
    // Every replacement is an edit, and each edit would otherwise re-scan the
    // whole document: hold the listener off and scan once at the end instead.
    suppress = true
    try {
      // Back to front: replacing a later match cannot disturb an earlier
      // offset, so every match in the list stays valid as we go.
      for (let i = found.matches.length - 1; i >= 0; i--) {
        const match = found.matches[i] as SearchMatch
        if (editor.exec(replaceMatch(match, replacement))) count++
      }
    } finally {
      suppress = false
    }
    runSearch()
    return count
  }

  // ---- wiring
  const onInput = (): void => {
    runSearch()
  }
  const onQueryKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (matches.length === 0) runSearch()
      else step(event.shiftKey ? -1 : 1)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      api.close()
    }
  }

  queryInput.addEventListener('input', onInput)
  queryInput.addEventListener('keydown', onQueryKeyDown)
  next.addEventListener('click', () => step(1))
  previous.addEventListener('click', () => step(-1))
  replaceOne.addEventListener('click', () => replaceCurrent(replaceInput.value))
  replaceEvery.addEventListener('click', () => replaceAllMatches(replaceInput.value))
  close.addEventListener('click', () => api.close())

  // Edits elsewhere invalidate the offsets we are highlighting. Only edits:
  // subscribing to every transaction would re-run the search when the bar
  // moves the caret onto a match, throwing the step back to the first hit.
  const onUpdate = (): void => {
    if (root.hidden || queryInput.value.length === 0) return
    runSearch()
  }
  let suppress = false
  const offTransaction = editor.on('update', () => {
    if (suppress) return
    suppress = true
    try {
      onUpdate()
    } finally {
      suppress = false
    }
  })

  container.appendChild(root)

  const api: FindReplace = {
    element: root,
    get isOpen() {
      return !root.hidden
    },
    open() {
      root.hidden = false
      queryInput.focus()
      queryInput.select()
      if (queryInput.value.length > 0) runSearch()
    },
    close() {
      root.hidden = true
      matches = []
      activeIndex = -1
      lastResult = { matches: [], error: null, truncated: false }
      editor.view?.setDecorationLayer(LAYER, null)
      renderStatus()
      editor.view?.focus()
    },
    search(query) {
      queryInput.value = query.query
      caseToggle.setAttribute('aria-pressed', String(query.caseSensitive))
      wordToggle.setAttribute('aria-pressed', String(query.wholeWord))
      regexToggle.setAttribute('aria-pressed', String(query.regex))
      return runSearch()
    },
    get matches() {
      return matches
    },
    get activeIndex() {
      return activeIndex
    },
    findNext: () => step(1),
    findPrevious: () => step(-1),
    replaceCurrent,
    replaceAllMatches,
    destroy() {
      offTransaction()
      queryInput.removeEventListener('input', onInput)
      queryInput.removeEventListener('keydown', onQueryKeyDown)
      editor.view?.setDecorationLayer(LAYER, null)
      root.remove()
    },
  }

  return api
}
