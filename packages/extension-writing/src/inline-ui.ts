/**
 * The inline half of the writing checks: what a flagged span does when you
 * point at it.
 *
 * The assistant paints wavy underlines, and until now that was all it did.
 * The reader could see that something was wrong with a word and had no way to
 * find out what, short of opening a panel and matching it up by eye. This
 * puts the finding where the finding is: a small card on hover naming what
 * was flagged, and a menu on click offering the fix.
 *
 * It builds its own DOM rather than depending on `@trevixal/ui`, as the other
 * extensions with inline controls do. The kit's stylesheet carries the rules,
 * and an editor assembled without the kit still gets working popovers.
 */

import type { Editor } from '@trevixal/core'
import {
  WRITING_ISSUE_ATTR,
  WRITING_KIND_LABELS,
  type WritingAssistant,
  type WritingIssue,
} from './assistant'
import { GRAMMAR_RULES, type GrammarRuleId } from './grammar'

/** Every label this UI prints, so a host can translate it. */
export interface WritingInlineMessages {
  readonly replaceWith?: (suggestion: string) => string
  readonly ignore?: string
  readonly dismiss?: string
  readonly noSuggestion?: string
}

export interface WritingInlineUIOptions {
  /** Where the popovers mount (default: the view document's `body`). */
  readonly container?: HTMLElement
  /** Quiet time on a span before the hover card appears (default 220ms). */
  readonly hoverDelayMs?: number
  readonly messages?: WritingInlineMessages
  /**
   * Open the menu for the issue under the caret (default `'Ctrl-.'`, the
   * binding editors have long used for a quick fix). A hover card that only
   * hovering can reach is unreachable from the keyboard, so the same menu has
   * a key of its own. Pass null to bind nothing.
   */
  readonly quickFixKey?: string | null
}

export interface WritingInlineUI {
  /** Open the suggestion menu over an issue. False when it is no longer there. */
  openMenu(id: string): boolean
  /** The issue whose menu is open, if any. */
  readonly openIssue: WritingIssue | null
  /** Dismiss the card and the menu. */
  close(): void
  destroy(): void
}

/** What the card calls this finding: the grammar rule where there is one. */
export function issueTitle(issue: WritingIssue): string {
  if (issue.kind === 'grammar' && issue.rule) {
    const label = GRAMMAR_RULES[issue.rule as GrammarRuleId]
    if (label) return label
  }
  return WRITING_KIND_LABELS[issue.kind]
}

/** Whether a position sits inside an issue's range. */
function containsCaret(issue: WritingIssue, path: readonly number[], offset: number): boolean {
  if (path.length !== issue.path.length) return false
  for (let index = 0; index < path.length; index++) {
    if (path[index] !== issue.path[index]) return false
  }
  return offset >= issue.from && offset <= issue.to
}

/**
 * Place a floating element beside a span, inside the viewport.
 *
 * Fixed positioning, measured from the span's own box: the decorated span has
 * no stable offset parent, it is re-created on every re-render, so there is
 * nothing to position against relatively.
 */
function placeNear(popover: HTMLElement, anchor: HTMLElement): void {
  const view = popover.ownerDocument.defaultView
  if (!view || typeof anchor.getBoundingClientRect !== 'function') return
  const box = anchor.getBoundingClientRect()
  const own = popover.getBoundingClientRect()
  const margin = 8
  // Below the span by preference, above it when the space below is short.
  const below = box.bottom + margin
  const fits = below + own.height <= view.innerHeight
  const top = fits ? below : Math.max(margin, box.top - own.height - margin)
  const room = view.innerWidth - own.width - margin
  const left = room > margin ? Math.min(Math.max(box.left, margin), room) : margin
  popover.style.top = `${Math.round(top)}px`
  popover.style.left = `${Math.round(left)}px`
}

export function createWritingInlineUI(
  editor: Editor,
  assistant: WritingAssistant,
  options: WritingInlineUIOptions = {},
): WritingInlineUI {
  const surface = editor.view?.dom
  if (!surface) {
    return {
      openMenu: () => false,
      openIssue: null,
      close: () => undefined,
      destroy: () => undefined,
    }
  }
  const doc = surface.ownerDocument
  const container = options.container ?? doc.body
  const hoverDelayMs = options.hoverDelayMs ?? 220
  const messages = options.messages ?? {}
  const quickFixKey = options.quickFixKey === undefined ? 'Ctrl-.' : options.quickFixKey

  const card = doc.createElement('div')
  card.className = 'trevixal-writing-card'
  card.setAttribute('role', 'tooltip')
  card.hidden = true

  const menu = doc.createElement('div')
  menu.className = 'trevixal-writing-menu'
  menu.setAttribute('role', 'menu')
  menu.hidden = true

  container.append(card, menu)

  let hoverTimer: ReturnType<typeof setTimeout> | null = null
  let openIssue: WritingIssue | null = null
  let destroyed = false

  const spanFor = (id: string): HTMLElement | null =>
    surface.querySelector<HTMLElement>(`[${WRITING_ISSUE_ATTR}="${CSS.escape(id)}"]`)

  const cancelHover = (): void => {
    if (hoverTimer !== null) clearTimeout(hoverTimer)
    hoverTimer = null
  }

  const hideCard = (): void => {
    cancelHover()
    card.hidden = true
  }

  const showCard = (issue: WritingIssue, anchor: HTMLElement): void => {
    card.replaceChildren()
    const kind = doc.createElement('span')
    kind.className = `trevixal-writing-card__kind trevixal-writing-card__kind--${issue.kind}`
    kind.textContent = issueTitle(issue)
    const text = doc.createElement('span')
    text.className = 'trevixal-writing-card__message'
    text.textContent = issue.message
    card.append(kind, text)
    card.hidden = false
    placeNear(card, anchor)
  }

  const closeMenu = (): void => {
    menu.hidden = true
    menu.replaceChildren()
    openIssue = null
  }

  const api: WritingInlineUI = {
    openMenu(id) {
      const issue = assistant.issue(id)
      const anchor = spanFor(id)
      if (!issue || !anchor) return false
      hideCard()
      menu.replaceChildren()

      const heading = doc.createElement('p')
      heading.className = 'trevixal-writing-menu__heading'
      const kind = doc.createElement('span')
      kind.className = `trevixal-writing-menu__kind trevixal-writing-menu__kind--${issue.kind}`
      kind.textContent = issueTitle(issue)
      const message = doc.createElement('span')
      message.className = 'trevixal-writing-menu__message'
      message.textContent = issue.message
      heading.append(kind, message)
      menu.appendChild(heading)

      const action = (label: string, run: () => void): HTMLButtonElement => {
        const button = doc.createElement('button')
        button.type = 'button'
        button.className = 'trevixal-writing-menu__item'
        button.setAttribute('role', 'menuitem')
        button.textContent = label
        // Keep the editor's selection: the fix acts on the document.
        button.addEventListener('mousedown', (event) => event.preventDefault())
        button.addEventListener('click', () => {
          run()
          closeMenu()
          editor.view?.focus()
        })
        menu.appendChild(button)
        return button
      }

      if (issue.suggestion !== undefined) {
        const label =
          messages.replaceWith?.(issue.suggestion) ??
          (issue.suggestion.length === 0 ? 'Delete' : `Replace with “${issue.suggestion}”`)
        const button = action(label, () => assistant.applySuggestion(issue))
        button.classList.add('trevixal-writing-menu__item--primary')
        button.dataset.trevixalWritingAction = 'apply'
      } else {
        // Passive voice and over-long sentences are judgements, not typos:
        // there is no one replacement to offer, and saying so is better than
        // an empty menu that looks broken.
        const note = doc.createElement('p')
        note.className = 'trevixal-writing-menu__note'
        note.textContent = messages.noSuggestion ?? 'No automatic fix: rewrite by hand.'
        menu.appendChild(note)
      }

      action(messages.ignore ?? 'Ignore this wording', () =>
        assistant.ignore(issue),
      ).dataset.trevixalWritingAction = 'ignore'
      action(messages.dismiss ?? 'Close', () => undefined).dataset.trevixalWritingAction = 'close'

      openIssue = issue
      menu.hidden = false
      placeNear(menu, anchor)
      menu.querySelector<HTMLButtonElement>('.trevixal-writing-menu__item')?.focus()
      return true
    },
    get openIssue() {
      return openIssue
    },
    close() {
      hideCard()
      closeMenu()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      cancelHover()
      for (const dispose of disposers) dispose()
      card.remove()
      menu.remove()
    },
  }

  const issueFromTarget = (
    target: EventTarget | null,
  ): { issue: WritingIssue; span: HTMLElement } | null => {
    const element = target as HTMLElement | null
    const span = element?.closest?.(`[${WRITING_ISSUE_ATTR}]`) as HTMLElement | null | undefined
    const id = span?.getAttribute(WRITING_ISSUE_ATTR)
    if (!span || !id) return null
    const issue = assistant.issue(id)
    return issue ? { issue, span } : null
  }

  const onOver = (event: MouseEvent): void => {
    const hit = issueFromTarget(event.target)
    cancelHover()
    if (!hit) {
      card.hidden = true
      return
    }
    if (openIssue) return // the menu is up; a card over it would only cover it
    hoverTimer = setTimeout(() => {
      hoverTimer = null
      if (!destroyed) showCard(hit.issue, hit.span)
    }, hoverDelayMs)
  }

  const onLeave = (): void => hideCard()

  const onClick = (event: MouseEvent): void => {
    const hit = issueFromTarget(event.target)
    if (!hit) return
    // The click still places the caret; opening the menu as well is what
    // makes the underline actionable rather than only informative.
    api.openMenu(hit.issue.id)
  }

  const onDocumentPointerDown = (event: Event): void => {
    if (menu.hidden) return
    const target = event.target as Node | null
    if (target && menu.contains(target)) return
    closeMenu()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && (!menu.hidden || !card.hidden)) {
      api.close()
      editor.view?.focus()
    }
  }

  const disposers: (() => void)[] = []
  surface.addEventListener('mouseover', onOver as EventListener)
  surface.addEventListener('mouseleave', onLeave)
  surface.addEventListener('click', onClick as EventListener)
  doc.addEventListener('pointerdown', onDocumentPointerDown, true)
  doc.addEventListener('keydown', onKeyDown)
  disposers.push(() => surface.removeEventListener('mouseover', onOver as EventListener))
  disposers.push(() => surface.removeEventListener('mouseleave', onLeave))
  disposers.push(() => surface.removeEventListener('click', onClick as EventListener))
  disposers.push(() => doc.removeEventListener('pointerdown', onDocumentPointerDown, true))
  disposers.push(() => doc.removeEventListener('keydown', onKeyDown))

  // A re-check repaints every span, so anything anchored to one is stale.
  disposers.push(
    editor.onTransaction(({ transaction }) => {
      if (transaction.docChanged) api.close()
    }),
  )

  if (quickFixKey) {
    const wanted = quickFixKey.toLowerCase()
    const matches = (event: KeyboardEvent): boolean => {
      const parts = wanted.split('-')
      const key = parts[parts.length - 1] ?? ''
      const wantsCtrl = parts.includes('ctrl') || parts.includes('mod')
      const wantsShift = parts.includes('shift')
      const wantsAlt = parts.includes('alt')
      return (
        event.key.toLowerCase() === key &&
        (event.ctrlKey || event.metaKey) === wantsCtrl &&
        event.shiftKey === wantsShift &&
        event.altKey === wantsAlt
      )
    }
    const intercept = editor.view?.addKeydownInterceptor((event) => {
      if (!matches(event)) return false
      const caret = editor.state.selection.from
      const issue = assistant
        .report()
        .issues.find((entry) => containsCaret(entry, caret.path, caret.offset))
      if (!issue) return false
      event.preventDefault()
      api.openMenu(issue.id)
      return true
    })
    if (intercept) disposers.push(intercept)
  }

  return api
}
