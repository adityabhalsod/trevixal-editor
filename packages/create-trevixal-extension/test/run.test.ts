import { describe, expect, it } from 'vitest'
import { type CreateIO, run } from '../src/run'

/** A file system of `taken` directories, recording what is written and said. */
function memory(taken: readonly string[] = []) {
  const written = new Map<string, string>()
  const said: string[] = []
  const complained: string[] = []
  const io: CreateIO = {
    isFree: async (directory) => !taken.includes(directory),
    write: async (path, text) => {
      written.set(path, text)
    },
    log: (line) => said.push(line),
    error: (line) => complained.push(line),
  }
  return { io, written, said, complained }
}

describe('create-trevixal-extension', () => {
  it('says how it is used, asked or not', async () => {
    const asked = memory()
    expect(await run(['--help'], asked.io)).toBe(0)
    expect(asked.said.join('\n')).toContain('create-trevixal-extension <package-name> [directory]')
    const bare = memory()
    expect(await run([], bare.io)).toBe(1)
    expect(bare.complained.join('\n')).toContain('Usage')
  })

  it('writes the package into a directory named after it, and says what next', async () => {
    const { io, written, said } = memory()
    expect(await run(['trevixal-extension-sticky-note'], io, '1.0.3')).toBe(0)
    expect(written.has('trevixal-extension-sticky-note/src/schema.ts')).toBe(true)
    expect(written.has('trevixal-extension-sticky-note/package.json')).toBe(true)
    expect(said.join('\n')).toContain('cd trevixal-extension-sticky-note')
  })

  it('writes into the directory given', async () => {
    const { io, written } = memory()
    expect(await run(['sticky-note', 'extensions/note'], io, '1.0.3')).toBe(0)
    expect(written.has('extensions/note/src/index.ts')).toBe(true)
  })

  it('refuses a name that is not one, and a directory already in use', async () => {
    const bad = memory()
    expect(await run(['Sticky Note'], bad.io)).toBe(1)
    expect(bad.complained.join('\n')).toContain('not a package name')
    const taken = memory(['sticky-note'])
    expect(await run(['sticky-note'], taken.io)).toBe(1)
    expect(taken.complained.join('\n')).toContain('sticky-note is not empty')
    expect(taken.written.size).toBe(0)
  })
})
