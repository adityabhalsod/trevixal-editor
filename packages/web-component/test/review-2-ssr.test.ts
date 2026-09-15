// @vitest-environment node
import { describe, expect, it } from 'vitest'

describe('SSR safety', () => {
  it('imports without a DOM and exposes its public symbols', async () => {
    const mod = await import('../src/index')
    expect(typeof mod.defineTrevixalEditor).toBe('function')
    expect(typeof mod.TrevixalEditorElement).toBe('function')
  })

  it('defineTrevixalEditor is a no-op without customElements', async () => {
    const mod = await import('../src/index')
    expect(() => mod.defineTrevixalEditor()).not.toThrow()
  })
})
