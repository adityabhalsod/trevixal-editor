// @vitest-environment node
import { describe, expect, it } from 'vitest'

describe('SSR safety', () => {
  it('imports without a DOM and exposes its public symbols', async () => {
    const mod = await import('../src/index')
    expect(typeof mod.useEditor).toBe('function')
    expect(typeof mod.useEditorSnapshot).toBe('function')
    expect(typeof mod.EditorContent).toBe('function')
    expect(typeof mod.EditorProvider).toBe('function')
    expect(typeof mod.useCurrentEditor).toBe('function')
  })
})
