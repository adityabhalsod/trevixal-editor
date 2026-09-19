// @vitest-environment node
import { describe, expect, it } from 'vitest'

describe('SSR safety', () => {
  // The assertions are instant; the cost is the dynamic import, which makes
  // Vitest transform this package and its dependencies on first load. On a
  // cold CI runner that has taken over 5s against ~0.3s locally, so the
  // default 5s timeout failed a release on transform speed rather than on
  // anything this test is about.
  it('imports without a DOM and exposes its public symbols', async () => {
    const mod = await import('../src/index')
    expect(typeof mod.useEditor).toBe('function')
    expect(typeof mod.useEditorSnapshot).toBe('function')
    expect(typeof mod.EditorContent).toBe('object')
    expect((mod.EditorContent as { name?: string }).name).toBe('TrevixalEditorContent')
  }, 20_000)
})
