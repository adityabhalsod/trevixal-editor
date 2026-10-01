// Synonyms on right-click: the word under the pointer, a short menu of
// words to put in its place, the one chosen swapped in with the original's
// casing and marks. Where the synonyms come from is the host's call: a word
// list, or a service behind a function.

import {
  type Editor,
  Fragment,
  type Position,
  ReplaceInlineStep,
  TextSelection,
  marksAtInlineOffset,
  nodeAtPath,
  pos,
  positionFromDOMPoint,
} from '@trevixal/core'
import { blockText } from './assistant'
import { matchCase } from './grammar'

/** Synonyms for a word, most useful first; none when there are none. */
export type SynonymLookup = (word: string) => readonly string[] | Promise<readonly string[]>

/** Common words and their synonyms: enough to use the menu without a service. */
export const COMMON_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  good: ['fine', 'excellent', 'sound', 'solid', 'decent'],
  bad: ['poor', 'weak', 'faulty', 'harmful'],
  big: ['large', 'major', 'vast', 'substantial'],
  small: ['little', 'minor', 'modest', 'compact'],
  fast: ['quick', 'rapid', 'swift', 'speedy'],
  slow: ['gradual', 'unhurried', 'sluggish'],
  quick: ['fast', 'rapid', 'brief', 'prompt'],
  happy: ['glad', 'pleased', 'content', 'cheerful'],
  sad: ['unhappy', 'downcast', 'sorry'],
  important: ['key', 'essential', 'vital', 'significant'],
  help: ['assist', 'aid', 'support'],
  show: ['display', 'reveal', 'present', 'demonstrate'],
  use: ['apply', 'employ'],
  make: ['build', 'create', 'produce'],
  get: ['obtain', 'receive', 'gain'],
  begin: ['start', 'open', 'launch'],
  start: ['begin', 'open', 'launch'],
  end: ['finish', 'close', 'conclusion'],
  finish: ['complete', 'end', 'wrap up'],
  idea: ['notion', 'thought', 'concept', 'plan'],
  problem: ['issue', 'difficulty', 'snag'],
  change: ['alter', 'adjust', 'revise', 'shift'],
  improve: ['better', 'refine', 'enhance'],
  easy: ['simple', 'straightforward', 'effortless'],
  hard: ['difficult', 'tough', 'demanding'],
  difficult: ['hard', 'tough', 'demanding', 'tricky'],
  clear: ['plain', 'obvious', 'evident', 'lucid'],
  simple: ['plain', 'easy', 'basic'],
  great: ['excellent', 'superb', 'large'],
  interesting: ['engaging', 'intriguing', 'absorbing'],
  new: ['fresh', 'recent', 'novel'],
  old: ['former', 'aged', 'dated'],
  many: ['numerous', 'several', 'plenty of'],
  often: ['frequently', 'regularly', 'commonly'],
  say: ['state', 'remark', 'mention'],
  tell: ['inform', 'explain', 'describe'],
  ask: ['request', 'enquire', 'query'],
  think: ['believe', 'consider', 'reckon'],
  need: ['require', 'want', 'lack'],
  want: ['wish', 'desire', 'need'],
  try: ['attempt', 'test', 'aim'],
  keep: ['hold', 'retain', 'maintain'],
  give: ['provide', 'offer', 'grant'],
  find: ['discover', 'locate', 'identify'],
  look: ['glance', 'view', 'examine'],
  write: ['compose', 'draft', 'record'],
  plan: ['scheme', 'strategy', 'proposal'],
  goal: ['aim', 'target', 'objective'],
  result: ['outcome', 'effect', 'consequence'],
  reason: ['cause', 'ground', 'motive'],
  example: ['instance', 'case', 'sample'],
  part: ['piece', 'portion', 'section'],
  choose: ['pick', 'select', 'opt for'],
  meeting: ['session', 'gathering', 'discussion'],
}

/** A lookup over a word list, by the word in lower case. */
export function wordListThesaurus(
  list: Readonly<Record<string, readonly string[]>>,
): SynonymLookup {
  return (word) => list[word.toLowerCase()] ?? []
}

export interface ThesaurusOptions {
  readonly lookup: SynonymLookup
  /** How many synonyms the menu offers at most (default 8). */
  readonly limit?: number
}

/** A word inside a textblock, by its inline offsets. */
interface WordAt {
  readonly position: Position
  readonly from: number
  readonly to: number
  readonly word: string
}

const WORD_CHARACTER = /[\p{L}\p{N}'’-]/u

/** The whole word around a position, or null between words. */
function wordAround(editor: Editor, position: Position): WordAt | null {
  const block = nodeAtPath(editor.state.doc, position.path)
  if (!block?.isTextblock) return null
  const text = blockText(block)
  let from = position.offset
  let to = position.offset
  while (from > 0 && WORD_CHARACTER.test(text[from - 1] as string)) from--
  while (to < text.length && WORD_CHARACTER.test(text[to] as string)) to++
  const word = text.slice(from, to).replace(/^['’-]+|['’-]+$/g, '')
  if (!/\p{L}/u.test(word)) return null
  const start = from + text.slice(from, to).indexOf(word)
  return { position, from: start, to: start + word.length, word }
}

/**
 * Right-click a word for its synonyms. A word the lookup knows nothing
 * about gets the browser's own menu, as does anything outside the text.
 * The context-menu key works too, on the word at the caret. Returns a
 * disposer.
 */
export function enableThesaurus(editor: Editor, options: ThesaurusOptions): () => void {
  const view = editor.view
  if (!view) return () => {}
  const document = view.dom.ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  const limit = options.limit ?? 8
  let menu: HTMLElement | null = null

  const close = (): void => {
    menu?.remove()
    menu = null
    document.removeEventListener('pointerdown', onOutside, true)
    document.removeEventListener('keydown', onKey, true)
  }
  const onOutside = (event: Event): void => {
    if (menu && !menu.contains(event.target as Node)) close()
  }
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    close()
    view.focus()
  }

  const replace = (at: WordAt, synonym: string): void => {
    const block = nodeAtPath(editor.state.doc, at.position.path)
    if (!block?.isTextblock || blockText(block).slice(at.from, at.to) !== at.word) return
    const text = matchCase(at.word, synonym)
    const marks = marksAtInlineOffset(block.content, Math.min(at.from + 1, at.to))
    const tr = editor.state.tr
    const step = new ReplaceInlineStep(
      at.position.path,
      at.from,
      at.to,
      Fragment.of(editor.schema.text(text, marks)),
    )
    if (!tr.maybeStep(step)) return
    tr.setSelection(new TextSelection(pos(at.position.path, at.from + text.length)))
    editor.dispatch(tr)
  }

  const open = (at: WordAt, synonyms: readonly string[], x: number, y: number): void => {
    close()
    const list = document.createElement('div')
    list.className = 'trevixal-writing-menu trevixal-thesaurus'
    list.setAttribute('role', 'menu')
    list.setAttribute('aria-label', `Synonyms for ${at.word}`)
    const heading = document.createElement('div')
    heading.className = 'trevixal-thesaurus__heading'
    heading.textContent = `Synonyms for “${at.word}”`
    list.append(heading)
    if (synonyms.length === 0) {
      const none = document.createElement('div')
      none.className = 'trevixal-thesaurus__empty'
      none.textContent = 'No synonyms found'
      list.append(none)
    }
    for (const synonym of synonyms.slice(0, limit)) {
      const item = document.createElement('button')
      item.type = 'button'
      item.className = 'trevixal-writing-menu__item'
      item.setAttribute('role', 'menuitem')
      item.textContent = matchCase(at.word, synonym)
      item.addEventListener('click', () => {
        close()
        replace(at, synonym)
        view.focus()
      })
      list.append(item)
    }
    list.style.position = 'fixed'
    list.style.left = `${x}px`
    list.style.top = `${y}px`
    document.body.append(list)
    menu = list
    document.addEventListener('pointerdown', onOutside, true)
    document.addEventListener('keydown', onKey, true)
    ;(list.querySelector('[role="menuitem"]') as HTMLElement | null)?.focus()
  }

  /** The position under the pointer, or at the caret for the context-menu key. */
  const positionOf = (event: MouseEvent): Position | null => {
    if (event.clientX === 0 && event.clientY === 0) {
      const selection = editor.state.selection
      return selection instanceof TextSelection ? selection.head : null
    }
    const point = document.caretPositionFromPoint?.(event.clientX, event.clientY)
    const range = point ? null : document.caretRangeFromPoint?.(event.clientX, event.clientY)
    const node = point?.offsetNode ?? range?.startContainer
    const offset = point?.offset ?? range?.startOffset ?? 0
    if (!node || !view.dom.contains(node)) return null
    return positionFromDOMPoint(view.dom, view.renderer, node, offset)
  }

  const onContextMenu = (event: MouseEvent): void => {
    const position = positionOf(event)
    const at = position ? wordAround(editor, position) : null
    if (!at) return
    const found = options.lookup(at.word)
    // A word list answers at once, so a word it does not know keeps the
    // browser's menu. A service answers too late to hand the event back, so
    // its menu opens either way and says when it found nothing.
    if (Array.isArray(found)) {
      if (found.length === 0) return
      event.preventDefault()
      open(at, found, event.clientX, event.clientY)
      return
    }
    event.preventDefault()
    const { clientX, clientY } = event
    void Promise.resolve(found).then(
      (synonyms) => open(at, synonyms, clientX, clientY),
      () => open(at, [], clientX, clientY),
    )
  }

  view.dom.addEventListener('contextmenu', onContextMenu)
  return () => {
    close()
    view.dom.removeEventListener('contextmenu', onContextMenu)
  }
}
