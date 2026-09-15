import { UploadError as CoreUploadError } from '@trevixal/core'
import { UploadError as AttachmentUploadError } from '@trevixal/extension-embed'
import { UploadError as ImageUploadError } from '@trevixal/extension-image'
import { describe, expect, test } from 'vitest'

/**
 * Both upload extensions raise the same class.
 *
 * They each used to declare their own, identical down to the byte, and two
 * classes of one name are two classes. A host catching `UploadError` imported
 * from @trevixal/extension-image would let an attachment's failure past the
 * guard and out to the window. This is the package that sees both, so it is
 * where that can be asserted.
 */
describe('UploadError', () => {
  test('is one class, whichever package it is imported from', () => {
    expect(ImageUploadError).toBe(CoreUploadError)
    expect(AttachmentUploadError).toBe(CoreUploadError)
  })

  test('an attachment failure is caught by a guard written against the image one', () => {
    const thrown = new AttachmentUploadError('Storage is offline')
    expect(thrown instanceof ImageUploadError).toBe(true)
  })

  test('still carries the name, message and cause it always did', () => {
    const cause = new Error('socket closed')
    const error = new ImageUploadError('Upload failed with status 500', cause)
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('UploadError')
    expect(error.message).toBe('Upload failed with status 500')
    expect(error.cause).toBe(cause)
  })
})
