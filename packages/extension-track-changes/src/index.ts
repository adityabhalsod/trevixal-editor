import {
  ADD_TO_HISTORY,
  AddMarkStep,
  type DispatchTransform,
  type Editor,
  type EditorNode,
  Fragment,
  type Mark,
  type MarkSpec,
  type MarkType,
  type Path,
  type Position,
  RemoveMarkStep,
  ReplaceInlineStep,
  type TextNode,
  TextSelection,
  type Transaction,
  inlineLength,
  inlineSize,
  nodeAtPath,
  pathsEqual,
  pos,
  rangesWithMark,
  textblocks,
} from '@trevixal/core'

/** Meta key marking transactions the transform must not rewrite. */
export const TRACK_CHANGES_META = 'trackChanges$'

/**
 * The `insertion` / `deletion` mark specs. Merge into your schema:
 * `marks: { ...defaultMarks(), ...trackChangesMarks() }`.
 */
export function trackChangesMarks(): Record<string, MarkSpec> {
  const attrs = { author: { default: '' }, timestamp: { default: 0 } }
  const htmlAttrs = (mark: Mark, className: string): Record<string, string> => ({
    class: className,
    'data-trevixal-author': String(mark.attrs.author ?? ''),
    'data-trevixal-timestamp': String(Number(mark.attrs.timestamp ?? 0) || 0),
  })
  const parsedAttrs = (element: HTMLElement) => ({
    author: element.getAttribute('data-trevixal-author') ?? '',
    timestamp: Number(element.getAttribute('data-trevixal-timestamp') ?? '0') || 0,
  })
  return {
    insertion: {
      attrs,
      excludes: 'deletion',
      toHTML: (mark) => ({ tag: 'ins', attrs: htmlAttrs(mark, 'trevixal-insertion') }),
      parseHTML: [{ tag: 'ins', getAttrs: parsedAttrs }],
    },
    deletion: {
      attrs,
      excludes: 'insertion',
      toHTML: (mark) => ({ tag: 'del', attrs: htmlAttrs(mark, 'trevixal-deletion') }),
      // `del` is also the strikethrough mark's tag in the default schema, and
      // rules that require an attribute are tried first, so an attributed
      // `del` parses back as a suggestion rather than as struck-through text.
      parseHTML: [
        { tag: 'del', attribute: 'data-trevixal-author', getAttrs: parsedAttrs },
        { tag: 'del', getAttrs: parsedAttrs },
      ],
    },
  }
}

export interface SuggestionRange {
  readonly path: Path
  readonly from: number
  readonly to: number
  readonly kind: 'insertion' | 'deletion'
  readonly author: string
  readonly timestamp: number
  readonly mark: Mark
}

export interface TrackChangesOptions {
  /** Attributed author for new suggestions. */
  readonly author: string
  /** Clock override for deterministic tests. */
  readonly now?: () => number
}

/** The two suggestion mark types of the active schema. */
interface SuggestionTypes {
  readonly insertion: MarkType
  readonly deletion: MarkType
}

/** What deleting one stretch of an edited range should actually do to it. */
type DeletionEffect = 'remove' | 'keep' | 'strike'

interface DeletionSegment {
  readonly from: number
  readonly to: number
  readonly effect: DeletionEffect
}

/**
 * Deleting means different things to different text once the range already
 * carries suggestions. Text this author only just suggested never reached the
 * document, so taking it back leaves nothing behind. Text someone has already
 * struck is spoken for: re-marking it would rewrite that author's attribution
 * and, because a strike has to start somewhere, push the deletion out past
 * what was actually deleted. Everything else is original text, which has to
 * survive under a deletion mark so a reviewer can still restore it.
 */
function effectOf(node: EditorNode, types: SuggestionTypes, author: string): DeletionEffect {
  if (!node.isText) return 'strike'
  const own = node.marks.some(
    (mark) => mark.type === types.insertion && mark.attrs.author === author,
  )
  if (own) return 'remove'
  return node.marks.some((mark) => mark.type === types.deletion) ? 'keep' : 'strike'
}

/** Split [from, to) into maximal runs that share one {@link DeletionEffect}. */
function classifyDeletion(
  block: EditorNode,
  from: number,
  to: number,
  types: SuggestionTypes,
  author: string,
): readonly DeletionSegment[] {
  const segments: DeletionSegment[] = []
  let offset = 0
  for (const child of block.content.children) {
    const start = offset
    offset += inlineSize(child)
    if (start >= to || offset <= from) continue
    const effect = effectOf(child, types, author)
    const clipped = { from: Math.max(start, from), to: Math.min(offset, to), effect }
    const last = segments[segments.length - 1]
    if (last && last.to === clipped.from && last.effect === effect) {
      segments[segments.length - 1] = { from: last.from, to: clipped.to, effect }
    } else {
      segments.push(clipped)
    }
  }
  return segments
}

/**
 * Hand the caller's metadata to the transaction that replaces theirs. The
 * rewrite discards the original wholesale, so meta left behind is meta lost:
 * an input rule that opens its own undo group and labels it must still do
 * both when suggestion mode turns its edit into a suggestion.
 *
 * Everything is carried, not a list of keys this package happens to know
 * about. Meta is how one extension tells the rest of the editor where a
 * transaction came from, and the keys most expensive to drop are the ones
 * written somewhere else: `workspace$mirror` marks a transaction replayed
 * from the other pane of a split view, and losing it sends the rewritten
 * edit straight back into the pane it came from. Only this package's own
 * marker is withheld, because the replacement is not the caller's
 * already-tracked transaction. It is the one being tracked now.
 */
function carryMeta(out: Transaction, source: Transaction): Transaction {
  for (const key of source.metaKeys()) {
    if (key === TRACK_CHANGES_META) continue
    out.setMeta(key, source.getMeta(key))
  }
  return out
}

/** Marks of the character occupying [index, index+1), if it is text. */
function marksOfCharAt(block: EditorNode, index: number): readonly Mark[] | null {
  if (index < 0) return null
  let offset = 0
  for (const child of block.content.children) {
    const size = inlineSize(child)
    if (index < offset + size) return child.isText ? child.marks : null
    offset += size
  }
  return null
}

function rangeIsAllText(block: EditorNode, from: number, to: number): boolean {
  let offset = 0
  for (const child of block.content.children) {
    const size = inlineSize(child)
    if (offset < to && offset + size > from && !child.isText) return false
    offset += size
  }
  return true
}

/**
 * Suggestion mode: while enabled, edits become attributed suggestions
 * instead of direct changes, deleted text stays with a `deletion` mark,
 * typed text carries an `insertion` mark. Accept/reject one or all.
 *
 * v0 scope (see ADR-0008): single-textblock edits are tracked; structural
 * transactions (Enter, block joins, wraps) apply directly.
 */
export class TrackChanges {
  private detach: (() => void) | null = null
  private readonly listeners = new Set<(enabled: boolean) => void>()

  constructor(
    private readonly editor: Editor,
    private readonly options: TrackChangesOptions,
  ) {}

  get isEnabled(): boolean {
    return this.detach !== null
  }

  /**
   * Subscribe to suggestion mode being switched on or off. Returns a disposer.
   *
   * Switching modes changes no document, so it raises no transaction, and
   * anything watching the editor alone never hears about it. A review bar
   * built that way sits reading "off" while every keystroke is in fact being
   * recorded as a suggestion, which is the worst way for this feature to be
   * wrong, because the user believes their edits are going in directly.
   */
  onEnabledChange(listener: (enabled: boolean) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private announce(): void {
    const enabled = this.isEnabled
    for (const listener of [...this.listeners]) listener(enabled)
  }

  enable(): void {
    if (this.detach) return
    this.detach = this.editor.addDispatchTransform(this.transform)
    this.announce()
  }

  disable(): void {
    if (!this.detach) return
    this.detach()
    this.detach = null
    this.announce()
  }

  /** All pending suggestions, in document order. */
  suggestions(): readonly SuggestionRange[] {
    const out: SuggestionRange[] = []
    const schema = this.editor.schema
    for (const { path, node } of textblocks(this.editor.state.doc)) {
      const length = inlineLength(node.content)
      for (const kind of ['insertion', 'deletion'] as const) {
        const type = schema.marks[kind]
        if (!type) continue
        for (const range of rangesWithMark(node.content, 0, length, type)) {
          out.push({
            path,
            from: range.from,
            to: range.to,
            kind,
            author: String(range.mark.attrs.author ?? ''),
            timestamp: Number(range.mark.attrs.timestamp ?? 0),
            mark: range.mark,
          })
        }
      }
    }
    return out.sort((a, b) => comparePaths(a.path, b.path) || a.from - b.from)
  }

  get hasSuggestions(): boolean {
    return this.suggestions().length > 0
  }

  acceptAll(): boolean {
    return this.apply(this.suggestions(), 'accept')
  }

  rejectAll(): boolean {
    return this.apply(this.suggestions(), 'reject')
  }

  /** Accept a specific set of suggestion ranges (e.g. one author's). */
  accept(suggestions: readonly SuggestionRange[]): boolean {
    return this.apply(suggestions, 'accept')
  }

  reject(suggestions: readonly SuggestionRange[]): boolean {
    return this.apply(suggestions, 'reject')
  }

  /** Accept the suggestion span containing `position`. */
  acceptAt(position: Position): boolean {
    return this.apply(this.at(position), 'accept')
  }

  rejectAt(position: Position): boolean {
    return this.apply(this.at(position), 'reject')
  }

  private at(position: Position): readonly SuggestionRange[] {
    const found = this.suggestions().find(
      (suggestion) =>
        pathsEqual(suggestion.path, position.path) &&
        suggestion.from <= position.offset &&
        position.offset <= suggestion.to,
    )
    return found ? [found] : []
  }

  private apply(suggestions: readonly SuggestionRange[], mode: 'accept' | 'reject'): boolean {
    if (suggestions.length === 0) return false
    const tr = this.editor.state.tr.setMeta(TRACK_CHANGES_META, true)
    // Per block, back to front, so earlier offsets stay valid while we edit.
    const ordered = [...suggestions].sort((a, b) => {
      const byPath = comparePaths(b.path, a.path)
      return byPath !== 0 ? byPath : b.from - a.from
    })
    for (const suggestion of ordered) {
      const keepText = (suggestion.kind === 'insertion') === (mode === 'accept')
      if (keepText) {
        tr.step(
          new RemoveMarkStep(suggestion.path, suggestion.from, suggestion.to, suggestion.mark),
        )
      } else {
        tr.step(
          new ReplaceInlineStep(suggestion.path, suggestion.from, suggestion.to, Fragment.empty),
        )
      }
    }
    this.editor.dispatch(tr)
    return true
  }

  private transform: DispatchTransform = (tr, state) => {
    if (!tr.docChanged || tr.getMeta(ADD_TO_HISTORY) === false) return null
    if (tr.getMeta(TRACK_CHANGES_META)) return null
    const step = normalizeInlineEdit(tr.steps)
    if (!step) return null
    const schema = state.schema
    const insertion = schema.marks.insertion
    const deletion = schema.marks.deletion
    if (!insertion || !deletion) return null
    const block = nodeAtPath(state.doc, step.blockPath)
    if (!block?.isTextblock || !block.type.allowsMarkType(deletion)) return null
    if (step.insert.children.some((child) => !child.isText)) return null
    if (step.from < step.to && !rangeIsAllText(block, step.from, step.to)) return null

    const author = this.options.author
    const timestamp = this.options.now?.() ?? Date.now()
    // Reuse the adjacent suggestion mark when the same author keeps going,
    // so consecutive keystrokes merge into one span (one suggestion).
    const reusable = (index: number, type: MarkType): Mark | null =>
      marksOfCharAt(block, index)?.find(
        (mark) => mark.type === type && mark.attrs.author === author,
      ) ?? null

    const segments =
      step.from < step.to
        ? classifyDeletion(block, step.from, step.to, { insertion, deletion }, author)
        : []
    const vanishing = segments.reduce(
      (total, segment) =>
        segment.effect === 'remove' ? total + (segment.to - segment.from) : total,
      0,
    )
    // Replacement text belongs where the edited range ends once the parts of
    // it that vanish are gone, after the struck original, never before it.
    const insertAt = step.to - vanishing

    // Merge into an adjacent span of this author's own suggestion when there
    // is one, so consecutive edits read as one. Only the two ends of the
    // edited range can carry it: everything inside that survived the deletion
    // is either original text or someone's strike, and a character of this
    // author's own pending insertion classifies as `remove` rather than
    // surviving at all.
    const insertionMark =
      reusable(step.from - 1, insertion) ??
      reusable(step.to, insertion) ??
      schema.mark('insertion', { author, timestamp })
    const markedInsert = Fragment.from(
      step.insert.children.map((child) => {
        const text = child as TextNode
        return schema.text(text.text, insertionMark.addToSet(text.marks))
      }),
    )
    const out = carryMeta(state.tr, tr)
    const caretAt = (offset: number): void => {
      out.setSelection(new TextSelection(pos(step.blockPath, offset)))
    }

    // Pure insertion: keep it, marked.
    if (step.from === step.to) {
      if (markedInsert.childCount === 0) return null
      out.step(new ReplaceInlineStep(step.blockPath, step.from, step.from, markedInsert))
      caretAt(step.from + inlineLength(markedInsert))
      return out
    }

    const head =
      state.selection instanceof TextSelection &&
      pathsEqual(state.selection.head.path, step.blockPath)
        ? state.selection.head.offset
        : null
    const backward = head === step.to

    // Back to front, so every segment still addresses the block the
    // classification was made against while earlier ones are being edited.
    for (let index = segments.length - 1; index >= 0; index--) {
      const segment = segments[index] as DeletionSegment
      if (segment.effect === 'remove') {
        out.step(new ReplaceInlineStep(step.blockPath, segment.from, segment.to, Fragment.empty))
      } else if (segment.effect === 'strike') {
        const mark =
          reusable(segment.to, deletion) ??
          reusable(segment.from - 1, deletion) ??
          schema.mark('deletion', { author, timestamp })
        out.step(new AddMarkStep(step.blockPath, segment.from, segment.to, mark))
      }
    }

    if (markedInsert.childCount > 0) {
      // Replacement: struck original, suggested text right after it.
      out.step(new ReplaceInlineStep(step.blockPath, insertAt, insertAt, markedInsert))
      caretAt(insertAt + inlineLength(markedInsert))
    } else {
      // Nothing is re-struck over a range that was already struck, so the
      // caret simply steps across it, as it would across text really gone.
      caretAt(backward ? step.from : insertAt)
    }
    return out
  }
}

/**
 * Recognize a transaction as one inline edit: either a single
 * ReplaceInlineStep, or the delete+insert pair commands emit when typing
 * over a same-block selection.
 */
function normalizeInlineEdit(steps: readonly unknown[]): ReplaceInlineStep | null {
  if (steps.length === 1) {
    return steps[0] instanceof ReplaceInlineStep ? steps[0] : null
  }
  if (steps.length === 2) {
    const [first, second] = steps
    if (
      first instanceof ReplaceInlineStep &&
      second instanceof ReplaceInlineStep &&
      pathsEqual(first.blockPath, second.blockPath) &&
      first.insert.childCount === 0 &&
      first.from < first.to &&
      second.from === second.to &&
      second.from === first.from
    ) {
      return new ReplaceInlineStep(first.blockPath, first.from, first.to, second.insert)
    }
  }
  return null
}

function comparePaths(a: Path, b: Path): number {
  const length = Math.min(a.length, b.length)
  for (let i = 0; i < length; i++) {
    const delta = (a[i] as number) - (b[i] as number)
    if (delta !== 0) return delta
  }
  return a.length - b.length
}

export {
  type TrackChangesBar,
  type TrackChangesBarOptions,
  createTrackChangesBar,
  nextSuggestion,
  suggestionAt,
} from './ui'
