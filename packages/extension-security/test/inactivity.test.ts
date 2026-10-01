// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { watchInactivity } from '../src'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('watchInactivity', () => {
  it('reports once the page has been left alone, not while it is used', () => {
    const onIdle = vi.fn()
    const dispose = watchInactivity(document, 60_000, onIdle)
    vi.advanceTimersByTime(59_000)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    vi.advanceTimersByTime(59_000)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1_000)
    expect(onIdle).toHaveBeenCalledTimes(1)
    dispose()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    vi.advanceTimersByTime(120_000)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('refuses a wait that is not a positive number', () => {
    expect(() => watchInactivity(document, 0, () => {})).toThrow(RangeError)
  })
})
