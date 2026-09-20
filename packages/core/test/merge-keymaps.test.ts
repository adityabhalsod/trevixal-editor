import { describe, expect, it } from 'vitest'
import type { Editor } from '../src/editor/editor'
import { mergeKeymaps } from '../src/view/keymap'

const editor = {} as Editor

describe('mergeKeymaps', () => {
  it('tries a shared key in order until one consumes it', () => {
    const calls: string[] = []
    const merged = mergeKeymaps(
      {
        Enter: () => {
          calls.push('first')
          return false
        },
      },
      {
        Enter: () => {
          calls.push('second')
          return true
        },
      },
    )
    expect(merged.Enter?.(editor)).toBe(true)
    expect(calls).toEqual(['first', 'second'])
  })

  it('stops at the first binding that consumes the key', () => {
    const calls: string[] = []
    const merged = mergeKeymaps(
      {
        Enter: () => {
          calls.push('first')
          return true
        },
      },
      {
        Enter: () => {
          calls.push('second')
          return true
        },
      },
    )
    expect(merged.Enter?.(editor)).toBe(true)
    expect(calls).toEqual(['first'])
  })

  it('reports not consumed when every binding declines', () => {
    const merged = mergeKeymaps({ Enter: () => false }, { Enter: () => false })
    expect(merged.Enter?.(editor)).toBe(false)
  })

  it('keeps keys that only one keymap binds', () => {
    const merged = mergeKeymaps({ Tab: () => true }, { Enter: () => true })
    expect(Object.keys(merged).sort()).toEqual(['Enter', 'Tab'])
  })
})
