import { afterEach, describe, expect, test } from 'vitest'
import { loadPreferences, savePreferences } from '../src/features'

const KEY = 'trevixal:test:preferences'

afterEach(() => {
  window.localStorage.clear()
})

/**
 * What these two do, pinned before their storage became injectable.
 *
 * Both fail soft on purpose: a hardened embed or a private window can throw
 * from `localStorage` on the first touch, and a page that cannot remember a
 * theme should still open.
 */
describe('preferences', () => {
  test('returns the defaults when nothing is stored', () => {
    expect(loadPreferences(KEY)).toEqual({ theme: 'system', preset: null })
  })

  test('merges what is stored over the defaults', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ theme: 'dark' }))
    expect(loadPreferences(KEY)).toEqual({ theme: 'dark', preset: null })
  })

  test('falls back to the defaults rather than throwing on unreadable JSON', () => {
    window.localStorage.setItem(KEY, 'not json')
    expect(loadPreferences(KEY)).toEqual({ theme: 'system', preset: null })
  })

  test('round-trips through save', () => {
    savePreferences(KEY, { theme: 'light', preset: 'nord' })
    expect(loadPreferences(KEY)).toEqual({ theme: 'light', preset: 'nord' })
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? '{}')).toEqual({
      theme: 'light',
      preset: 'nord',
    })
  })

  test('keeps two namespaces apart', () => {
    savePreferences('a:preferences', { theme: 'dark', preset: null })
    savePreferences('b:preferences', { theme: 'light', preset: null })
    expect(loadPreferences('a:preferences').theme).toBe('dark')
    expect(loadPreferences('b:preferences').theme).toBe('light')
  })

  test('reads and writes a store handed to it, with no global in reach', () => {
    const map = new Map<string, string>()
    const store = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
    }
    savePreferences(KEY, { theme: 'dark', preset: 'nord' }, store)
    expect(map.get(KEY)).toBe('{"theme":"dark","preset":"nord"}')
    expect(loadPreferences(KEY, store)).toEqual({ theme: 'dark', preset: 'nord' })
    // The point of the parameter: nothing reached localStorage.
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  test('still fails soft when the store it was given throws', () => {
    const store = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(loadPreferences(KEY, store)).toEqual({ theme: 'system', preset: null })
    expect(() => savePreferences(KEY, { theme: 'dark', preset: null }, store)).not.toThrow()
  })
})
