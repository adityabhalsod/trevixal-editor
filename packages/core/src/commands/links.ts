import type { Attrs } from '../model/attrs'
import { blocksInRange } from '../model/blocks'
import { Fragment } from '../model/fragment'
import { inlineLength, marksAtInlineOffset, rangesWithMark } from '../model/inline'
import type { Mark } from '../model/mark'
import type { EditorNode } from '../model/node'
import { pos } from '../model/position'
import type { Schema } from '../model/schema'
import { nodeAtPath } from '../model/tree'
import { safeHref } from '../schema/basic'
import type { EditorState } from '../state/editor-state'
import { TextSelection } from '../state/selection'
import { AddMarkStep, RemoveMarkStep } from '../state/steps/mark-steps'
import { ReplaceInlineStep } from '../state/steps/replace-inline'
import type { Transaction } from '../state/transaction'
import type { Command } from './commands'
import { setMark, unsetMark } from './commands'

/**
 * A deliberately conservative email pattern: one `@`, a non-empty local part
 * with no spaces or angle brackets, and a dotted domain whose TLD is
 * alphabetic. It rejects far more than RFC 5322 allows, which is the right
 * trade for a UI affordance. A false accept produces a dead `mailto:` link.
 */
const EMAIL =
  /^[^\s@<>()[\],;:"\\]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i

/** Is `address` something we are willing to turn into a `mailto:` link? */
export function isEmailAddress(address: string): boolean {
  const trimmed = address.trim()
  if (trimmed.length === 0 || trimmed.length > 254) return false
  // A local part longer than 64 octets is invalid per RFC 5321.
  const local = trimmed.split('@')[0]
  if (!local || local.length > 64) return false
  if (trimmed.includes('..')) return false
  return EMAIL.test(trimmed)
}

/**
 * Set (or clear) the link target on every link touched by the selection.
 *
 * `'_blank'` always carries `rel="noopener noreferrer"`. The mark's `toHTML`
 * emits the two together, so there is no way to produce a `target=_blank`
 * link without the rel that prevents reverse tabnabbing. `null` clears both.
 *
 * Declines when the selection touches no link, so it can be chained.
 */
export function setLinkTarget(target: '_blank' | null): Command {
  return (state) => mapLinkMarks(state, (mark) => retarget(mark, target))
}

/** Which attributes of a link to change; the rest are left as they are. */
export interface LinkUpdate {
  readonly href?: string
  readonly title?: string | null
  readonly target?: '_blank' | null
}

/**
 * Change a link's attributes without disturbing its text.
 *
 * The case that matters is a bare cursor. `setMark('link', …)` writes a mark
 * over the *selection*, so with nothing selected it stores a pending mark and
 * the link the caret is actually sitting in keeps its old address, which
 * looks, from the outside, exactly like an edit that silently did nothing.
 * Here the whole link under the caret is rewritten, the way removing one
 * already works.
 *
 * Declines when the selection touches no link, or when nothing would change.
 */
export function updateLink(attrs: LinkUpdate): Command {
  return (state) => {
    // Every href reaching the document goes through the sanitizer, including
    // one typed into an editing field by someone who meant no harm.
    const href = attrs.href === undefined ? undefined : safeHref(attrs.href)
    if (attrs.href !== undefined && !href) return null
    return mapLinkMarks(state, (mark) => {
      const next: Attrs = {
        ...mark.attrs,
        ...(href === undefined ? {} : { href }),
        ...(attrs.title === undefined ? {} : { title: attrs.title }),
        ...(attrs.target === undefined ? {} : { target: attrs.target }),
      }
      const unchanged = Object.keys(next).every((key) => next[key] === mark.attrs[key])
      return unchanged ? null : mark.type.create(next)
    })
  }
}

/**
 * Rewrite every link mark the selection touches, or, at a bare cursor, every
 * run of the one link the caret is inside, which is the only way a user with
 * no selection can say "this link".
 *
 * `transform` returns the replacement mark, or null to leave a run alone.
 */
function mapLinkMarks(
  state: EditorState,
  transform: (mark: Mark) => Mark | null,
): Transaction | null {
  const type = state.schema.markType('link')
  const selection = state.selection

  if (selection.empty && selection instanceof TextSelection) {
    const block = nodeAtPath(state.doc, selection.head.path)
    if (!block?.isTextblock) return null
    const active = marksAtInlineOffset(block.content, selection.head.offset).find(
      (mark) => mark.type === type,
    )
    if (!active) return null
    const tr = state.tr
    for (const range of rangesWithMark(block.content, 0, inlineLength(block.content), type)) {
      if (!sameLink(range.mark, active)) continue
      const next = transform(range.mark)
      if (!next) continue
      tr.step(new RemoveMarkStep(selection.head.path, range.from, range.to, range.mark))
      tr.step(new AddMarkStep(selection.head.path, range.from, range.to, next))
    }
    return tr.docChanged ? tr : null
  }

  const tr = state.tr
  for (const block of blocksInRange(state.doc, selection.from, selection.to)) {
    if (block.from >= block.to) continue
    for (const range of rangesWithMark(block.node.content, block.from, block.to, type)) {
      const next = transform(range.mark)
      if (!next) continue
      tr.step(new RemoveMarkStep(block.path, range.from, range.to, range.mark))
      tr.step(new AddMarkStep(block.path, range.from, range.to, next))
    }
  }
  return tr.docChanged ? tr : null
}

/** The same mark with a new target, or null when it already has it. */
function retarget(mark: Mark, target: '_blank' | null): Mark | null {
  const current = mark.attrs.target ?? null
  if (current === target) return null
  return mark.type.create({ ...mark.attrs, target })
}

/** Two link marks pointing at the same destination. */
function sameLink(a: Mark, b: Mark): boolean {
  return a.attrs.href === b.attrs.href && a.attrs.title === b.attrs.title
}

export interface InsertEmailLinkOptions {
  /** Link text; the address itself by default. */
  readonly text?: string
  /** Open in a new tab (implying `rel="noopener noreferrer"`). */
  readonly target?: '_blank' | null
}

/**
 * Link the selection to a `mailto:` address, or insert the address as a new
 * linked span when the selection is empty. Declines on an address that does
 * not validate, so a typo never becomes a dead link.
 */
export function insertEmailLink(address: string, options: InsertEmailLinkOptions = {}): Command {
  return (state) => {
    const trimmed = address.trim()
    if (!isEmailAddress(trimmed)) return null
    const href = `mailto:${trimmed}`
    // Belt and braces: the address is already validated, but every href in
    // the document goes through the same sanitizer regardless.
    if (!safeHref(href)) return null
    const attrs = { href, title: null, target: options.target ?? null }

    const selection = state.selection
    if (!selection.empty) return setMark('link', attrs)(state)
    if (!(selection instanceof TextSelection)) return null

    // Empty selection: insert the label, then link exactly what was inserted.
    const point = selection.from
    const block = nodeAtPath(state.doc, point.path)
    if (!block?.isTextblock) return null
    const type = state.schema.markType('link')
    if (!block.type.allowsMarkType(type)) return null

    const label = options.text?.trim() || trimmed
    const inherited = (
      state.storedMarks ?? marksAtInlineOffset(block.content, point.offset)
    ).filter((existing) => existing.type !== type && block.type.allowsMarkType(existing.type))
    const mark = type.create(attrs)

    const tr = state.tr
    tr.step(
      new ReplaceInlineStep(
        point.path,
        point.offset,
        point.offset,
        Fragment.of(state.schema.text(label, mark.addToSet(inherited))),
      ),
    )
    tr.setSelection(new TextSelection(pos(point.path, point.offset + label.length)))
    return tr
  }
}

/**
 * Remove the link mark from the selection, or from the whole link under a
 * bare cursor, which is what "unlink" means when nothing is selected.
 * Declines when there is no link to remove.
 */
export const removeLink: Command = (state) => {
  const type = state.schema.markType('link')
  const selection = state.selection

  if (selection.empty && selection instanceof TextSelection) {
    const block = nodeAtPath(state.doc, selection.head.path)
    if (!block?.isTextblock) return null
    const active = marksAtInlineOffset(block.content, selection.head.offset).find(
      (mark) => mark.type === type,
    )
    // No link under the caret: fall back to clearing the stored mark, so a
    // pending link the user has not typed into yet can still be cancelled.
    if (!active) return unsetMark('link')(state)
    const tr = state.tr
    for (const range of rangesWithMark(block.content, 0, inlineLength(block.content), type)) {
      if (!sameLink(range.mark, active)) continue
      tr.step(new RemoveMarkStep(selection.head.path, range.from, range.to, range.mark))
    }
    return tr.docChanged ? tr : null
  }

  return unsetMark('link')(state)
}

const URL_IN_TEXT = /(?:https?:\/\/|www\.)[^\s<>"'`]{2,2000}/gi

/** Punctuation that ends a sentence rather than a URL. */
const URL_TRAILING_PUNCTUATION = '.,;:!?\'"`)'

/**
 * Split plain text into text nodes with every URL wrapped in a link mark:
 * what pasting a paragraph that mentions a few sites should produce. Returns
 * null when the text holds no URL, so callers can fall back to a plain insert.
 */
export function linkifyText(
  schema: Schema,
  text: string,
  marks: readonly Mark[] = [],
): EditorNode[] | null {
  const type = schema.marks.link
  if (!type) return null
  const nodes: EditorNode[] = []
  let last = 0
  for (const match of text.matchAll(URL_IN_TEXT)) {
    let url = match[0]
    while (url.length > 0 && URL_TRAILING_PUNCTUATION.includes(url[url.length - 1] as string)) {
      url = url.slice(0, -1)
    }
    const href = safeHref(/^www\./i.test(url) ? `https://${url}` : url)
    if (!href || url.length === 0) continue
    const start = match.index ?? 0
    if (start > last) nodes.push(schema.text(text.slice(last, start), marks))
    nodes.push(schema.text(url, type.create({ href }).addToSet(marks)))
    last = start + url.length
  }
  if (nodes.length === 0) return null
  if (last < text.length) nodes.push(schema.text(text.slice(last), marks))
  return nodes
}
