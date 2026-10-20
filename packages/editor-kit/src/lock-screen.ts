/** On the kit's root while the screen is locked: the document is hidden under it. */
export const LOCKED_CLASS = 'trevixal-kit--locked'

const TITLE_ID = 'trevixal-lock-screen-title'

/**
 * Cover the editor until its password is given again. The editor underneath
 * is made inert and hidden, so nothing of the document can be read, reached
 * with the keyboard or heard through a screen reader while it is locked. The
 * screen wears the dialogs' classes, so it looks like the rest of the chrome.
 * Resolves once `isPassword` accepts what was typed.
 */
export function showLockScreen(
  root: HTMLElement,
  isPassword: (candidate: string) => boolean,
  /** Unlock with a passkey instead: true once one checks out. */
  passkey?: () => Promise<boolean>,
): Promise<void> {
  const document = root.ownerDocument
  const element = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text = '',
  ): HTMLElementTagNameMap[K] => {
    const created = document.createElement(tag)
    created.className = className
    created.textContent = text
    return created
  }

  const screen = element('div', 'trevixal-dialog-overlay trevixal-lock-screen')
  const card = element('div', 'trevixal-dialog')
  card.setAttribute('role', 'dialog')
  card.setAttribute('aria-modal', 'true')
  card.setAttribute('aria-labelledby', TITLE_ID)
  const title = element('h2', 'trevixal-dialog__title', 'Document locked')
  title.id = TITLE_ID
  const form = element('form', 'trevixal-dialog__form')
  const note = element('p', 'trevixal-dialog__body', 'Enter the document’s password to go on.')
  const field = element('label', 'trevixal-dialog__field')
  const input = element('input', 'trevixal-dialog__input')
  input.type = 'password'
  input.name = 'password'
  input.required = true
  input.autocomplete = 'current-password'
  field.append(element('span', 'trevixal-dialog__label', 'Password'), input)
  const error = element('p', 'trevixal-lock-screen__error', 'That is not the password.')
  error.setAttribute('role', 'alert')
  error.hidden = true
  const actions = element('div', 'trevixal-dialog__actions')
  const unlock = element(
    'button',
    'trevixal-dialog__button trevixal-dialog__button--primary',
    'Unlock',
  )
  unlock.type = 'submit'
  const withPasskey = passkey ? element('button', 'trevixal-dialog__button', 'Use a passkey') : null
  if (withPasskey) {
    withPasskey.type = 'button'
    actions.append(withPasskey)
  }
  actions.append(unlock)
  form.append(note, field, error, actions)
  card.append(title, form)
  screen.append(card)

  root.inert = true
  root.classList.add(LOCKED_CLASS)
  root.after(screen)
  input.focus()

  return new Promise((resolve) => {
    const open = (): void => {
      screen.remove()
      root.inert = false
      root.classList.remove(LOCKED_CLASS)
      resolve()
    }
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      if (!isPassword(input.value)) {
        error.hidden = false
        input.select()
        return
      }
      open()
    })
    withPasskey?.addEventListener('click', () => {
      void passkey?.().then((checked) => {
        if (checked) open()
        else {
          error.textContent = 'The passkey did not check out.'
          error.hidden = false
        }
      })
    })
  })
}
