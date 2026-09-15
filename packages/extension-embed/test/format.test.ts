import { describe, expect, it } from 'vitest'
import { formatBytes } from '../src'

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1023, '1023 B'],
    [1024, '1 KB'],
    [1536, '1.5 KB'],
    [1258291, '1.2 MB'],
    [104857600, '100 MB'],
    [5 * 1024 ** 3, '5 GB'],
    [3 * 1024 ** 4, '3 TB'],
  ])('formats %d as %s', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text)
  })

  it('treats garbage as zero', () => {
    expect(formatBytes(-1)).toBe('0 B')
    expect(formatBytes(Number.NaN)).toBe('0 B')
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 B')
  })
})
