import { type Editor, editorDocument } from '@trevixal/core'
import { bindListNavigation, createDropdown, focusFirstItem } from './dropdown'
import { type IconName, createIcon } from './icons'

/** One selectable language. `value` is written to the block's attribute. */
export interface CodeLanguageOption {
  readonly value: string
  readonly label: string
  /** Defaults to `lang<Value>` when that icon exists, else a generic glyph. */
  readonly icon?: IconName
}

export interface CodeLanguageSelectOptions {
  readonly languages: readonly CodeLanguageOption[]
  /** Label for the "no highlighting" entry (default "Plain text"). */
  readonly plainLabel?: string
  /**
   * Guess the language of a block that names none, from its text. Supply
   * `detectLanguage` from `@trevixal/extension-code-highlight`; keeping it an
   * option means this package needs no dependency on that one.
   *
   * The guess is shown as a suggestion. The block's own attribute always
   * wins, and nothing is written to the document until the user picks.
   */
  readonly detect?: (code: string) => string | null
  /** Node type carrying the `language` attribute (default `"codeBlock"`). */
  readonly nodeName?: string
  /**
   * Where the floating control is appended. Defaults to the view's parent,
   * which must be a positioned ancestor of the surface.
   */
  readonly container?: HTMLElement
  /**
   * The keyboard hint shown beside the picker: by default, that Enter adds a
   * line and Mod-Enter leaves the block. A string replaces it; `false` drops
   * it. Hidden on its own over a block too narrow to hold it.
   */
  readonly hint?: string | false
  /**
   * Copy the block's code. Supplying this adds a Copy button to the bar; it
   * reports "Copied" or "Failed" for a moment from the returned result.
   */
  readonly onCopy?: (code: string) => boolean | Promise<boolean>
  /** Labels for the copy button, overridable for localization. */
  readonly copyLabels?: {
    readonly idle?: string
    readonly copied?: string
    readonly failed?: string
  }
}

/** Below this the hint is more clutter than help; the picker still fits. */
const HINT_MIN_BLOCK_WIDTH = 440
/** How long "Copied" or "Failed" stands before the button says "Copy" again. */
const COPY_STATE_RESET_MS = 1600
const COPY_LABELS = { idle: 'Copy', copied: 'Copied', failed: 'Failed' } as const

export interface CodeLanguageSelect {
  readonly element: HTMLElement
  destroy(): void
}

/** `typescript` → `langTypescript`, so bundled languages get icons for free. */
function iconFor(option: CodeLanguageOption): IconName {
  if (option.icon) return option.icon
  const candidate = `lang${option.value.charAt(0).toUpperCase()}${option.value.slice(1)}`
  return candidate as IconName
}

/**
 * A language picker that floats over the code block holding the caret, so
 * the control is where the code is, rather than in a bar above the document.
 *
 * Built on the same dropdown primitive as the rest of the chrome, so it
 * inherits the theme, focus ring, keyboard navigation and click-outside
 * behaviour instead of rendering an OS-styled `<select>`.
 *
 * Setting a language writes the block's `language` attribute; the highlighter
 * re-tokenizes from there, and the document text never changes.
 */
export function createCodeLanguageSelect(
  editor: Editor,
  options: CodeLanguageSelectOptions,
): CodeLanguageSelect {
  const view = editor.view
  const doc = editorDocument(editor, options.container, 'createCodeLanguageSelect')

  const nodeName = options.nodeName ?? 'codeBlock'
  const host = options.container ?? (view?.dom.parentElement as HTMLElement)
  const plainLabel = options.plainLabel ?? 'Plain text'

  // "Plain text" is a real choice, not an absent one, so it gets an entry.
  const entries: readonly CodeLanguageOption[] = [
    { value: '', label: plainLabel, icon: 'langPlain' },
    ...options.languages,
  ]

  const root = doc.createElement('div')
  root.className = 'trevixal-codelang'
  root.hidden = true
  // A control over the document must never steal the selection it acts on.
  root.addEventListener('mousedown', (event) => event.preventDefault())

  const triggerIcon = doc.createElement('span')
  triggerIcon.className = 'trevixal-codelang__icon'
  const triggerLabel = doc.createElement('span')
  triggerLabel.className = 'trevixal-codelang__label'

  let disposeNavigation: (() => void) | null = null

  const dropdown = createDropdown({
    document: doc,
    className: 'trevixal-codelang__dropdown',
    render: (panel, self) => {
      for (const entry of entries) {
        const button = doc.createElement('button')
        button.type = 'button'
        button.className = 'trevixal-menu__item'
        button.setAttribute('role', 'menuitemradio')
        button.dataset.trevixalLanguage = entry.value

        const glyph = doc.createElement('span')
        glyph.className = 'trevixal-menu__icon'
        // Colour is applied from CSS off this attribute, so `createIcon` stays
        // monochrome for every other icon in the chrome.
        glyph.dataset.trevixalLanguageIcon = entry.value
        const icon = createIcon(doc, iconFor(entry))
        // A host-supplied language with no glyph falls back rather than
        // leaving an empty slot that misaligns the row.
        if (icon) glyph.appendChild(icon)
        else {
          const generic = createIcon(doc, 'codeLanguage')
          if (generic) glyph.appendChild(generic)
        }

        const label = doc.createElement('span')
        label.className = 'trevixal-menu__label'
        label.textContent = entry.label

        const check = doc.createElement('span')
        check.className = 'trevixal-menu__check'
        const tick = createIcon(doc, 'check')
        if (tick) check.appendChild(tick)

        button.append(glyph, label, check)
        button.addEventListener('mousedown', (event) => event.preventDefault())
        button.addEventListener('click', () => {
          self.close()
          editor.commands.setBlockAttrs({ language: entry.value || null })
          editor.view?.focus()
        })
        panel.appendChild(button)
      }
      disposeNavigation = bindListNavigation(panel)
    },
    onOpen: (panel) => {
      // Mark the active language and put focus on it, so Enter re-selects and
      // the arrows walk from where the user is.
      const current = currentLanguage()
      let active: HTMLElement | null = null
      for (const button of panel.querySelectorAll<HTMLElement>('[data-trevixal-language]')) {
        const on = (button.dataset.trevixalLanguage ?? '') === current
        button.setAttribute('aria-checked', String(on))
        if (on) active = button
      }
      if (active) active.focus()
      else focusFirstItem(panel)
    },
  })

  dropdown.trigger.classList.add('trevixal-codelang__trigger')
  dropdown.trigger.setAttribute('aria-label', 'Code language')
  dropdown.trigger.title = 'Code language'
  const chevron = createIcon(doc, 'chevronDown')
  dropdown.trigger.append(triggerIcon, triggerLabel)
  if (chevron) dropdown.trigger.appendChild(chevron)

  root.appendChild(dropdown.element)

  // The copy button, when the host can reach a clipboard.
  const copyLabels = { ...COPY_LABELS, ...options.copyLabels }
  let copyTimer: ReturnType<typeof setTimeout> | null = null
  let copyButton: HTMLButtonElement | null = null
  const setCopyState = (state: keyof typeof COPY_LABELS): void => {
    if (!copyButton) return
    copyButton.dataset.state = state
    const label = copyButton.querySelector('.trevixal-codelang__copy-label')
    if (label) label.textContent = copyLabels[state]
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = null
    // A transient state always falls back, or a stale "Copied" lies about the
    // clipboard.
    if (state !== 'idle') copyTimer = setTimeout(() => setCopyState('idle'), COPY_STATE_RESET_MS)
  }
  const onCopy = options.onCopy
  if (onCopy) {
    copyButton = doc.createElement('button')
    copyButton.type = 'button'
    copyButton.className = 'trevixal-codelang__copy'
    copyButton.dataset.state = 'idle'
    copyButton.setAttribute('aria-label', 'Copy code to clipboard')
    copyButton.title = 'Copy code'
    const glyph = createIcon(doc, 'copyCode')
    if (glyph) copyButton.appendChild(glyph)
    const copyLabel = doc.createElement('span')
    copyLabel.className = 'trevixal-codelang__copy-label'
    copyLabel.textContent = copyLabels.idle
    copyButton.appendChild(copyLabel)
    copyButton.addEventListener('click', () => {
      // Read at click time: the block may have been edited since it was shown.
      const block = activeBlock()
      if (!block) return
      const code = (block.querySelector('code') ?? block).textContent ?? ''
      Promise.resolve()
        .then(() => onCopy(code))
        .then(
          (ok) => setCopyState(ok ? 'copied' : 'failed'),
          () => setCopyState('failed'),
        )
    })
    root.appendChild(copyButton)
  }

  // The keyboard hint: what Enter does here, and how to get out.
  let hint: HTMLElement | null = null
  if (options.hint !== false) {
    hint = doc.createElement('span')
    hint.className = 'trevixal-codelang__hint'
    // Purely visual: the shortcuts are documented for assistive tech
    // elsewhere, and a live label here would be read on every caret move.
    hint.setAttribute('aria-hidden', 'true')
    if (typeof options.hint === 'string') hint.textContent = options.hint
    else hint.append(...defaultHint(doc))
    root.appendChild(hint)
  }

  host.appendChild(root)

  /** The block's language attribute, normalized to '' for plain text. */
  const currentLanguage = (): string => {
    const language = editor.getSnapshot().blockAttrs?.language
    return typeof language === 'string' ? language : ''
  }

  /** The code block holding the caret, or null when elsewhere. */
  const activeBlock = (): HTMLElement | null => {
    const current = editor.view
    if (!current) return null
    if (editor.getSnapshot().blockType !== nodeName) return null
    const selection = doc.getSelection()
    const anchor = selection?.anchorNode
    if (!anchor || !current.dom.contains(anchor)) return null
    let node: Node | null = anchor
    while (node && node !== current.dom) {
      if (node instanceof HTMLPreElement) return node
      node = node.parentNode
    }
    return null
  }

  const update = (): void => {
    const block = activeBlock()
    if (!block) {
      if (!root.hidden) {
        dropdown.close()
        root.hidden = true
      }
      return
    }

    const value = currentLanguage()
    // Only guess when the block names nothing: an explicit language, including
    // "Plain text", is a decision and detection is only an inference.
    // The detector is host code running on every caret move; one that throws
    // must cost the suggestion, not the picker.
    let detected: string | null = null
    if (!value && options.detect) {
      try {
        detected = options.detect(block.textContent ?? '') ?? null
      } catch {
        detected = null
      }
    }
    const entry = entries.find((candidate) => candidate.value === (value || detected)) ?? entries[0]
    triggerLabel.textContent = entry?.label ?? plainLabel
    // Styled as a suggestion, so the label does not claim the block carries a
    // language it does not.
    if (detected && entry?.value === detected) {
      root.dataset.trevixalDetected = 'true'
      dropdown.trigger.title = `Detected: ${entry.label}, click to set it`
    } else {
      delete root.dataset.trevixalDetected
      dropdown.trigger.title = 'Code language'
    }
    triggerIcon.replaceChildren()
    triggerIcon.dataset.trevixalLanguageIcon = entry?.value ?? ''
    const icon = entry ? createIcon(doc, iconFor(entry)) : null
    if (icon) triggerIcon.appendChild(icon)

    root.hidden = false
    // Top-right of the block, in the host's coordinate space, so it tracks
    // scrolling and reflow without measuring the page.
    const blockBox = block.getBoundingClientRect()
    if (hint) hint.hidden = blockBox.width < HINT_MIN_BLOCK_WIDTH
    // Both boxes are viewport-relative, but the control is positioned against
    // the host's content origin, which the host's own scroll has moved.
    const hostBox = host.getBoundingClientRect()
    const offsetLeft = blockBox.right - hostBox.left - host.clientLeft + host.scrollLeft
    const offsetTop = blockBox.top - hostBox.top - host.clientTop + host.scrollTop
    root.style.left = `${offsetLeft - root.offsetWidth - 8}px`
    root.style.top = `${offsetTop + 8}px`
  }

  const offTransaction = editor.on('transaction', update)
  const offSelection = editor.on('selectionUpdate', update)
  // `selectionchange` is asynchronous, so a plain click into a block is not
  // covered by the editor's own events.
  doc.addEventListener('selectionchange', update)
  update()

  return {
    element: root,
    destroy() {
      offTransaction()
      offSelection()
      doc.removeEventListener('selectionchange', update)
      if (copyTimer) clearTimeout(copyTimer)
      disposeNavigation?.()
      dropdown.destroy()
      root.remove()
    },
  }
}

/**
 * `Enter new line · Ctrl+Enter leave block`, with the keys as `<kbd>` and the
 * modifier named for the platform: what the base keymap actually binds.
 */
function defaultHint(doc: Document): readonly Node[] {
  const platform = doc.defaultView?.navigator.platform ?? ''
  const modifier = /Mac|iP(hone|ad|od)/.test(platform) ? '⌘' : 'Ctrl'
  const key = (label: string): HTMLElement => {
    const kbd = doc.createElement('kbd')
    kbd.textContent = label
    return kbd
  }
  const separator = doc.createElement('span')
  separator.className = 'trevixal-codelang__hint-separator'
  separator.textContent = '·'
  return [
    key('Enter'),
    doc.createTextNode(' new line '),
    separator,
    key(modifier),
    doc.createTextNode('+'),
    key('Enter'),
    doc.createTextNode(' leave block'),
  ]
}
