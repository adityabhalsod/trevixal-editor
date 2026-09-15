import type { EditorNode } from '../model/node'

/**
 * Announcements to assistive technology.
 *
 * A contenteditable surface already reports typed characters and caret
 * movement, screen readers watch the DOM for that. What they do not report is
 * *structure* changing out from under the caret: three blocks deleted by one
 * key press, a paragraph becoming a heading, a list appearing. Those edits are
 * silent, and silence after a destructive key press is the worst case.
 *
 * This is the shared way to say them out loud.
 */

/** How urgently a message should interrupt. */
export type AnnouncePriority = 'polite' | 'assertive'

export interface Announcer {
  /** The live regions, appended wherever the announcer was told to live. */
  readonly element: HTMLElement
  /** Say something. Repeating the same text still announces it. */
  announce(message: string, priority?: AnnouncePriority): void
  /** Empty both regions without saying anything. */
  clear(): void
  destroy(): void
}

export interface AnnouncerOptions {
  /** Where the regions are appended. Defaults to `document.body`. */
  readonly container?: HTMLElement
  /**
   * How long a message stays in the region before it is cleared, in ms. Long
   * enough for a reader to pick it up, short enough that a later identical
   * message is a real change. Defaults to 1000.
   */
  readonly clearAfterMs?: number
}

/**
 * Off-screen rather than `display: none` or `hidden`: a region removed from
 * the accessibility tree is never read, which would make the whole thing a
 * no-op that looks like it works.
 */
const VISUALLY_HIDDEN =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;' +
  'clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0'

export function createAnnouncer(document: Document, options: AnnouncerOptions = {}): Announcer {
  const clearAfterMs = options.clearAfterMs ?? 1000

  const root = document.createElement('div')
  root.className = 'trevixal-announcer'
  root.setAttribute('style', VISUALLY_HIDDEN)

  // One region per priority. Flipping `aria-live` on a single region is
  // unreliable across readers, several latch the value they saw first, so
  // the two live side by side and each keeps one setting for good.
  const regions: Record<AnnouncePriority, HTMLElement> = {
    polite: region(document, 'polite'),
    assertive: region(document, 'assertive'),
  }
  root.append(regions.polite, regions.assertive)
  ;(options.container ?? document.body)?.appendChild(root)

  let timer: ReturnType<typeof setTimeout> | null = null

  return {
    element: root,
    announce(message, priority = 'polite') {
      const text = message.trim()
      if (!text) return
      const target = regions[priority] ?? regions.polite
      if (timer !== null) clearTimeout(timer)
      // Emptying first is what makes the same message announce twice: a
      // reader watches for the text to *change*, so setting it to the value
      // it already holds says nothing at all.
      target.textContent = ''
      target.textContent = text
      timer = setTimeout(() => {
        target.textContent = ''
        timer = null
      }, clearAfterMs)
    },
    clear() {
      if (timer !== null) clearTimeout(timer)
      timer = null
      regions.polite.textContent = ''
      regions.assertive.textContent = ''
    },
    destroy() {
      if (timer !== null) clearTimeout(timer)
      timer = null
      root.remove()
    },
  }
}

function region(document: Document, priority: AnnouncePriority): HTMLElement {
  const element = document.createElement('div')
  element.setAttribute('aria-live', priority)
  // Read the whole region, not the changed word: a partial reading of
  // "3 blocks deleted" is worse than none.
  element.setAttribute('aria-atomic', 'true')
  element.setAttribute('role', priority === 'assertive' ? 'alert' : 'status')
  return element
}

/** English plural for the small counts these messages actually carry. */
function count(n: number, singular: string): string {
  return `${n} ${singular}${n === 1 ? '' : 's'}`
}

/**
 * What to say about a document change, or null when it speaks for itself.
 *
 * Deliberately quiet. Typing, caret movement and a single new block are all
 * things a reader already reports from the DOM, and repeating them turns the
 * live region into noise that users switch off. What is announced is what a
 * reader cannot see coming: blocks disappearing, and the block under the
 * caret becoming a different kind of thing.
 */
export function describeDocChange(
  before: EditorNode,
  after: EditorNode,
  blockTypeBefore?: string | null,
  blockTypeAfter?: string | null,
): string | null {
  const removed = before.childCount - after.childCount
  if (removed > 0) return `${count(removed, 'block')} deleted`
  if (blockTypeBefore && blockTypeAfter && blockTypeBefore !== blockTypeAfter) {
    return readableType(blockTypeAfter)
  }
  return null
}

/** `codeBlock` reads as "code block"; a type name is not a label. */
function readableType(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
