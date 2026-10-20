import { describe, expect, it } from 'vitest'
import { ExtensionNameError, extensionFiles, extensionNames } from '../src/templates'

describe('the names a package gives its extension', () => {
  it('come from the package name, its scope and prefix left off', () => {
    expect(extensionNames('@acme/trevixal-extension-sticky-note')).toEqual({
      packageName: '@acme/trevixal-extension-sticky-note',
      directory: 'trevixal-extension-sticky-note',
      kebab: 'sticky-note',
      camel: 'stickyNote',
      pascal: 'StickyNote',
      title: 'Sticky note',
    })
    expect(extensionNames('pull_quote').camel).toBe('pullQuote')
  })

  it('refuse a package name npm would, or one with no name in it', () => {
    for (const name of ['Bad Name', '', '@acme/', 'trevixal-extension-', '-dash', '9lives']) {
      expect(() => extensionNames(name), name).toThrow(ExtensionNameError)
    }
  })
})

describe('the files of a new extension', () => {
  const files = extensionFiles('@acme/trevixal-extension-sticky-note', '1.0.3')

  it('are a package laid out as the shipped extensions are', () => {
    expect([...files.keys()].sort()).toEqual([
      '.gitignore',
      'README.md',
      'package.json',
      'src/commands.ts',
      'src/index.ts',
      'src/menu.ts',
      'src/schema.ts',
      'test/sticky-note.test.ts',
      'tsconfig.json',
      'tsup.config.ts',
      'vitest.config.ts',
    ])
  })

  it('depend on the Trevixal they were made for', () => {
    const manifest = JSON.parse(files.get('package.json') ?? '{}')
    expect(manifest.name).toBe('@acme/trevixal-extension-sticky-note')
    expect(manifest.peerDependencies).toEqual({
      '@trevixal/core': '^1.0.3',
      '@trevixal/ui': '^1.0.3',
    })
    expect(manifest.peerDependenciesMeta['@trevixal/ui'].optional).toBe(true)
    expect(manifest.scripts).toEqual({
      build: 'tsup',
      test: 'vitest run',
      typecheck: 'tsc --noEmit',
    })
  })

  it('name the node, its command and its menu entry after the extension', () => {
    expect(files.get('src/schema.ts')).toContain('export function stickyNoteNodes()')
    expect(files.get('src/schema.ts')).toContain("'data-sticky-note': ''")
    expect(files.get('src/commands.ts')).toContain('export function insertStickyNote(')
    expect(files.get('src/menu.ts')).toContain("name: 'insertStickyNote'")
    expect(files.get('src/menu.ts')).toContain("label: 'Sticky note'")
  })
})
