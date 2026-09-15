import { UnsupportedEnvironmentError } from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { ArchiveError, readZip } from '../src/zip'

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text)

/**
 * The two ways reading an archive fails, told apart by type.
 *
 * A host shows different things for them: a broken file is worth reporting to
 * the person who chose it, a missing browser API is not. They can pick a
 * different file all day and it will not help.
 */
describe('archive failures', () => {
  it('reports a file that is not an archive as an ArchiveError', async () => {
    await expect(readZip(bytes('not a zip at all'))).rejects.toThrow(ArchiveError)
  })

  it('keeps ArchiveError catchable as an Error, message and all', async () => {
    const error = await readZip(bytes('not a zip at all')).catch((thrown: unknown) => thrown)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).name).toBe('ArchiveError')
    expect((error as Error).message).toMatch(/Not a ZIP archive/)
  })

  it('keeps the two kinds apart', () => {
    expect(new ArchiveError('x')).not.toBeInstanceOf(UnsupportedEnvironmentError)
    expect(new UnsupportedEnvironmentError('x')).not.toBeInstanceOf(ArchiveError)
  })
})
