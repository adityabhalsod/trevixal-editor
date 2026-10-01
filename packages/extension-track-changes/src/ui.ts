import {
  type Editor,
  type EditorState,
  type Position,
  TextSelection,
  comparePositions,
  domPointFromPosition,
  pos,
} from '@trevixal/core'
import type { SuggestionRange, TrackChanges } from './index'

export interface TrackChangesBarOptions {
  /** Where the toolbar is appended. */
  readonly container: HTMLElement
  /** Shown next to the toggle ("Suggesting as ada"). */
  readonly author?: string
  /** Called after any action taken from the bar. */
  readonly onChange?: (state: { enabled: boolean; count: number }) => void
}

export interface TrackChangesBar {
  readonly element: HTMLElement
  refresh(): void
  destroy(): void
}

function caretOf(state: EditorState): Position | null {
  const selection = state.selection
  return selection instanceof TextSelection ? selection.head : null
}

const start = (suggestion: SuggestionRange): Position => pos(suggestion.path, suggestion.from)
const end = (suggestion: SuggestionRange): Position => pos(suggestion.path, suggestion.to)

/** Pending suggestions in document order (the tracker groups them per kind). */
function ordered(track: TrackChanges): readonly SuggestionRange[] {
  return [...track.suggestions()].sort((a, b) => comparePositions(start(a), start(b)))
}

/** The suggestion whose span contains the caret (edges inclusive), if any. */
export function suggestionAt(track: TrackChanges, state: EditorState): SuggestionRange | null {
  const caret = caretOf(state)
  if (!caret) return null
  return (
    track
      .suggestions()
      .find(
        (suggestion) =>
          comparePositions(start(suggestion), caret) <= 0 &&
          comparePositions(caret, end(suggestion)) <= 0,
      ) ?? null
  )
}

/**
 * The first suggestion starting after the caret (`1`) or the last one ending
 * before it (`-1`). A suggestion touching the caret counts as current and is
 * skipped in both directions.
 */
export function nextSuggestion(
  track: TrackChanges,
  state: EditorState,
  direction: 1 | -1,
): SuggestionRange | null {
  const caret = caretOf(state)
  if (!caret) return null
  const all = ordered(track)
  if (direction === 1) {
    return all.find((suggestion) => comparePositions(start(suggestion), caret) > 0) ?? null
  }
  for (let index = all.length - 1; index >= 0; index--) {
    const suggestion = all[index] as SuggestionRange
    if (comparePositions(end(suggestion), caret) < 0) return suggestion
  }
  return null
}

/** Everyone who has a suggestion pending, in alphabetical order. */
export function suggestionAuthors(track: TrackChanges): string[] {
  const authors = new Set(track.suggestions().map((suggestion) => suggestion.author))
  return [...authors].sort((a, b) => a.localeCompare(b))
}

/** The suggestions one author made; everyone's for null. */
export function suggestionsBy(
  track: TrackChanges,
  author: string | null,
): readonly SuggestionRange[] {
  const all = track.suggestions()
  return author === null ? all : all.filter((suggestion) => suggestion.author === author)
}

function countLabel(count: number): string {
  if (count === 0) return 'No suggestions'
  return count === 1 ? '1 suggestion' : `${count} suggestions`
}

/**
 * A toolbar for suggestion mode: toggle suggesting, see how many suggestions
 * are pending, step through them, and accept or reject the one at the caret
 * or all of them at once.
 */
export function createTrackChangesBar(
  editor: Editor,
  track: TrackChanges,
  options: TrackChangesBarOptions,
): TrackChangesBar {
  const doc = options.container.ownerDocument
  const disposers: (() => void)[] = []

  const root = doc.createElement('div')
  root.className = 'trevixal-trackchanges'
  root.setAttribute('role', 'toolbar')
  root.setAttribute('aria-label', 'Track changes')

  const control = (className: string, label: string, action: () => void): HTMLButtonElement => {
    const element = doc.createElement('button')
    element.type = 'button'
    element.className = `trevixal-trackchanges__button ${className}`
    element.textContent = label
    element.addEventListener('click', () => {
      action()
      refresh()
      options.onChange?.({ enabled: track.isEnabled, count: track.suggestions().length })
    })
    return element
  }

  const toggle = control('trevixal-trackchanges__toggle', 'Suggesting', () => {
    if (track.isEnabled) track.disable()
    else track.enable()
  })
  if (options.author) toggle.title = `Suggesting as ${options.author}`
  root.appendChild(toggle)
  if (options.author) {
    const author = doc.createElement('span')
    author.className = 'trevixal-trackchanges__author'
    author.textContent = `as ${options.author}`
    root.appendChild(author)
  }

  const count = doc.createElement('span')
  count.className = 'trevixal-trackchanges__count'
  count.setAttribute('aria-live', 'polite')
  root.appendChild(count)

  const select = (suggestion: SuggestionRange | null): void => {
    if (!suggestion) return
    editor.dispatch(
      editor.state.tr.setSelection(new TextSelection(start(suggestion), end(suggestion))),
    )
    const view = editor.view
    if (!view) return
    view.focus()
    const point = domPointFromPosition(view.dom, view.renderer, start(suggestion))
    const node = point?.node
    const element = node instanceof Element ? node : node?.parentElement
    element?.scrollIntoView?.({ block: 'nearest' })
  }

  const current = (): readonly SuggestionRange[] => {
    const found = suggestionAt(track, editor.state)
    return found ? [found] : []
  }

  const group = doc.createElement('div')
  group.className = 'trevixal-trackchanges__group'
  const previous = control('trevixal-trackchanges__previous', 'Previous', () =>
    select(nextSuggestion(track, editor.state, -1)),
  )
  const next = control('trevixal-trackchanges__next', 'Next', () =>
    select(nextSuggestion(track, editor.state, 1)),
  )
  const accept = control('trevixal-trackchanges__accept', 'Accept', () => track.accept(current()))
  const reject = control('trevixal-trackchanges__reject', 'Reject', () => track.reject(current()))
  // Whose suggestions Accept all and Reject all act on: everyone's, or one
  // reviewer's, as Word's Accept All Changes by This Reviewer.
  const authors = doc.createElement('select')
  authors.className = 'trevixal-trackchanges__authors'
  authors.setAttribute('aria-label', 'Suggestions by')
  authors.addEventListener('change', () => refresh())
  const chosen = (): string | null => authors.value || null
  const acceptAll = control('trevixal-trackchanges__accept-all', 'Accept all', () =>
    track.accept(suggestionsBy(track, chosen())),
  )
  const rejectAll = control('trevixal-trackchanges__reject-all', 'Reject all', () =>
    track.reject(suggestionsBy(track, chosen())),
  )
  group.append(previous, next, accept, reject, authors, acceptAll, rejectAll)
  root.appendChild(group)
  options.container.appendChild(root)

  const refresh = (): void => {
    const total = track.suggestions().length
    toggle.setAttribute('aria-pressed', String(track.isEnabled))
    toggle.classList.toggle('trevixal-trackchanges__toggle--on', track.isEnabled)
    count.textContent = countLabel(total)
    const atCaret = suggestionAt(track, editor.state) !== null
    accept.disabled = !atCaret
    reject.disabled = !atCaret
    previous.disabled = nextSuggestion(track, editor.state, -1) === null
    next.disabled = nextSuggestion(track, editor.state, 1) === null
    // The choices are the authors with something pending; one whose last
    // suggestion was just settled goes back to everyone.
    const names = suggestionAuthors(track)
    const wanted = names.includes(authors.value) ? authors.value : ''
    const listed = [...authors.options].map((option) => option.value)
    if (listed.join('\n') !== ['', ...names].join('\n')) {
      authors.replaceChildren(
        ...['', ...names].map((name) => {
          const option = doc.createElement('option')
          option.value = name
          option.textContent = name ? `By ${name}` : 'By everyone'
          return option
        }),
      )
    }
    authors.value = wanted
    authors.hidden = names.length < 2
    const scoped = suggestionsBy(track, chosen()).length
    acceptAll.textContent = wanted ? `Accept ${wanted}’s` : 'Accept all'
    rejectAll.textContent = wanted ? `Reject ${wanted}’s` : 'Reject all'
    acceptAll.disabled = scoped === 0
    rejectAll.disabled = scoped === 0
  }

  disposers.push(editor.on('transaction', refresh))
  disposers.push(editor.on('selectionUpdate', refresh))
  // Switching modes raises no transaction, so the two subscriptions above
  // never hear it. The bar would keep saying "off" while the menu had just
  // turned it on, until the next keystroke happened to refresh it.
  disposers.push(track.onEnabledChange(refresh))
  refresh()

  return {
    element: root,
    refresh,
    destroy: () => {
      for (const dispose of disposers) dispose()
      root.remove()
    },
  }
}
