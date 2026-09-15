// @vitest-environment happy-dom
import { Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { describe, expect, it, vi } from 'vitest'
import { createCopyCodeButtons } from '../src'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

function setup() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ schema, element: host })
  return { editor, host }
}

/** Replace navigator.clipboard for one test, returning a restore function. */
function stubClipboard(writeText: (text: string) => Promise<void>): () => void {
  const original = Object.getOwnPropertyDescriptor(window.navigator, 'clipboard')
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
  return () => {
    if (original) Object.defineProperty(window.navigator, 'clipboard', original)
    else Reflect.deleteProperty(window.navigator as object, 'clipboard')
  }
}

function buttonIn(host: HTMLElement): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>('.trevixal-copycode')
  expect(button).not.toBeNull()
  return button as HTMLButtonElement
}

describe('createCopyCodeButtons', () => {
  it('adds a button for each code block and removes it with the block', () => {
    const { editor, host } = setup()
    editor.commands.setCodeBlock()
    editor.commands.insertText('const x = 1')
    const dispose = createCopyCodeButtons(editor)
    expect(host.querySelectorAll('.trevixal-copycode')).toHaveLength(1)

    editor.commands.setParagraph()
    expect(host.querySelectorAll('.trevixal-copycode')).toHaveLength(0)

    dispose()
    editor.destroy()
  })

  it('copies the code block text and shows a transient copied state', async () => {
    const writeText = vi.fn(async () => {})
    const restore = stubClipboard(writeText)
    const { editor, host } = setup()
    editor.commands.setCodeBlock()
    editor.commands.insertText('const x = 1')
    const dispose = createCopyCodeButtons(editor, { resetDelay: 5000 })

    const button = buttonIn(host)
    button.click()
    await vi.waitFor(() => expect(button.dataset.state).toBe('copied'))
    expect(writeText).toHaveBeenCalledWith('const x = 1')
    expect(button.textContent).toBe('Copied')

    dispose()
    restore()
    editor.destroy()
  })

  it('falls back to idle after the reset delay', async () => {
    const restore = stubClipboard(async () => {})
    const { editor, host } = setup()
    editor.commands.setCodeBlock()
    editor.commands.insertText('code')
    const dispose = createCopyCodeButtons(editor, { resetDelay: 10 })

    const button = buttonIn(host)
    button.click()
    // The copied state is transient: it must clear itself even if the user
    // never interacts again, or a stale label lies about the clipboard.
    await vi.waitFor(() => {
      expect(button.dataset.state).toBe('idle')
      expect(button.textContent).toBe('Copy')
    })

    dispose()
    restore()
    editor.destroy()
  })

  it('shows a failure state when the clipboard promise rejects', async () => {
    // A denied permission or an insecure context rejects here; an unhandled
    // rejection would leave the button stuck and swallow the error.
    const restore = stubClipboard(async () => {
      throw new Error('NotAllowedError')
    })
    const { editor, host } = setup()
    editor.commands.setCodeBlock()
    editor.commands.insertText('secret')
    // Deny the legacy fallback too, so the whole path is exhausted.
    const execCommand = vi.fn(() => false)
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true })
    const dispose = createCopyCodeButtons(editor, { resetDelay: 5000 })

    const button = buttonIn(host)
    button.click()
    await vi.waitFor(() => expect(button.dataset.state).toBe('failed'))
    expect(button.textContent).toBe('Failed')

    dispose()
    restore()
    editor.destroy()
  })

  it('falls back to execCommand when the clipboard API is unavailable', async () => {
    const restore = stubClipboard(undefined as never)
    Object.defineProperty(window.navigator, 'clipboard', { value: undefined, configurable: true })
    const execCommand = vi.fn(() => true)
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true })

    const { editor, host } = setup()
    editor.commands.setCodeBlock()
    editor.commands.insertText('fallback')
    const dispose = createCopyCodeButtons(editor, { resetDelay: 5000 })

    buttonIn(host).click()
    await vi.waitFor(() => expect(buttonIn(host).dataset.state).toBe('copied'))
    expect(execCommand).toHaveBeenCalledWith('copy')

    dispose()
    restore()
    editor.destroy()
  })

  it('removes every button and leaves no timer behind when disposed', async () => {
    const restore = stubClipboard(async () => {})
    const { editor, host } = setup()
    editor.commands.setCodeBlock()
    editor.commands.insertText('code')
    const dispose = createCopyCodeButtons(editor, { resetDelay: 5000 })

    const button = buttonIn(host)
    button.click()
    await vi.waitFor(() => expect(button.dataset.state).toBe('copied'))
    dispose()
    expect(host.querySelectorAll('.trevixal-copycode')).toHaveLength(0)

    restore()
    editor.destroy()
  })
})
