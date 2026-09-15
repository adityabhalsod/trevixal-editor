import type { Editor } from '@trevixal/core'
import { afterEach, expect, test, vi } from 'vitest'
import { type FileActionsSecurity, createFileActions } from '../src/file-actions'

/**
 * None of the paths below reaches the editor: each one stops at the
 * document's protection or at the list of installed formats, which is the
 * point of testing them here rather than through a whole mount.
 */
const editor = null as unknown as Editor

const security = (overrides: Partial<FileActionsSecurity> = {}): FileActionsSecurity => ({
  allows: () => true,
  report: vi.fn(),
  downloadEncrypted: vi.fn(async () => {}),
  openEncrypted: vi.fn(async () => false),
  ...overrides,
})

afterEach(() => {
  document.body.replaceChildren()
})

test('a document that forbids downloading says so instead of writing a file', async () => {
  const guard = security({ allows: () => false })
  await createFileActions(editor, guard).download('html')

  expect(guard.report).toHaveBeenCalledWith('Downloading is blocked for this document')
  expect(guard.downloadEncrypted).not.toHaveBeenCalled()
})

test('the encrypted format goes through the envelope writer, not an exporter', async () => {
  const guard = security()
  await createFileActions(editor, guard).download('encrypted')

  expect(guard.downloadEncrypted).toHaveBeenCalledOnce()
  expect(guard.report).not.toHaveBeenCalled()
})

test('a format this build cannot write says which package installs it', async () => {
  const pending = createFileActions(editor, security()).download('pdf')
  await Promise.resolve()

  const dialog = document.querySelector('.trevixal-dialog--info')
  expect(dialog?.querySelector('.trevixal-dialog__title')?.textContent).toBe('Format not installed')
  expect(dialog?.querySelector('.trevixal-dialog__body')?.textContent).toContain(
    '@trevixal/extension-export',
  )

  dialog?.querySelector<HTMLButtonElement>('.trevixal-dialog__button--primary')?.click()
  await pending
})
