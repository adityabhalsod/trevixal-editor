import { describe, expect, it } from 'vitest'
import {
  type RGB,
  highlightColor,
  nearestHighlight,
  parseColor,
  toCSSHex,
  toHex,
} from '../src/color'

describe('parseColor', () => {
  it('reads six-digit hex', () => {
    expect(parseColor('#4682B4')).toEqual({ r: 0x46, g: 0x82, b: 0xb4 })
  })

  it('expands three-digit hex', () => {
    expect(parseColor('#f0c')).toEqual({ r: 0xff, g: 0x00, b: 0xcc })
  })

  it('drops the alpha channel of eight-digit hex', () => {
    expect(parseColor('#11223380')).toEqual({ r: 0x11, g: 0x22, b: 0x33 })
  })

  it('reads rgb() and rgba(), ignoring alpha', () => {
    expect(parseColor('rgb(1, 2, 3)')).toEqual({ r: 1, g: 2, b: 3 })
    expect(parseColor('rgb(1 2 3)')).toEqual({ r: 1, g: 2, b: 3 })
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual({ r: 10, g: 20, b: 30 })
  })

  it('reads percentage rgb channels and clamps out-of-range values', () => {
    expect(parseColor('rgb(100%, 0%, 50%)')).toEqual({ r: 255, g: 0, b: 128 })
    expect(parseColor('rgb(999, 999, 999)')).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('reads hsl()', () => {
    expect(parseColor('hsl(0, 100%, 50%)')).toEqual({ r: 255, g: 0, b: 0 })
    expect(parseColor('hsl(120, 100%, 50%)')).toEqual({ r: 0, g: 255, b: 0 })
    expect(parseColor('hsl(240, 100%, 50%)')).toEqual({ r: 0, g: 0, b: 255 })
  })

  it('reads a fully desaturated hsl() as grey', () => {
    expect(parseColor('hsl(0, 0%, 50%)')).toEqual({ r: 128, g: 128, b: 128 })
  })

  it('reads CSS named colours case-insensitively', () => {
    expect(parseColor('red')).toEqual({ r: 255, g: 0, b: 0 })
    expect(parseColor('SteelBlue')).toEqual({ r: 0x46, g: 0x82, b: 0xb4 })
    expect(parseColor('rebeccapurple')).toEqual({ r: 0x66, g: 0x33, b: 0x99 })
  })

  it('returns null for transparent', () => {
    expect(parseColor('transparent')).toBeNull()
  })

  it('returns null for unknown names and non-strings', () => {
    expect(parseColor('notacolour')).toBeNull()
    expect(parseColor('')).toBeNull()
    expect(parseColor(null)).toBeNull()
    expect(parseColor(42)).toBeNull()
    expect(parseColor('url(evil)')).toBeNull()
  })
})

describe('toHex and toCSSHex', () => {
  it('formats as uppercase RRGGBB with no hash', () => {
    expect(toHex({ r: 0, g: 0, b: 0 })).toBe('000000')
    expect(toHex({ r: 255, g: 255, b: 255 })).toBe('FFFFFF')
    expect(toHex({ r: 1, g: 2, b: 3 })).toBe('010203')
  })

  it('formats a lowercase CSS hex with a hash', () => {
    expect(toCSSHex({ r: 0x46, g: 0x82, b: 0xb4 })).toBe('#4682b4')
  })

  it('round-trips through parseColor', () => {
    const color = parseColor('#123456')
    expect(parseColor(toCSSHex(color as RGB))).toEqual(color)
  })
})

describe('nearestHighlight and highlightColor', () => {
  it('returns the exact name for a palette colour', () => {
    expect(nearestHighlight({ r: 255, g: 255, b: 0 })).toBe('yellow')
    expect(nearestHighlight({ r: 0, g: 0, b: 0 })).toBe('black')
    expect(nearestHighlight({ r: 0, g: 0, b: 128 })).toBe('darkBlue')
  })

  it('snaps an arbitrary colour to the closest palette entry', () => {
    expect(nearestHighlight({ r: 250, g: 250, b: 10 })).toBe('yellow')
    expect(nearestHighlight({ r: 200, g: 200, b: 200 })).toBe('lightGray')
    expect(nearestHighlight({ r: 10, g: 200, b: 10 })).toBe('green')
  })

  it('maps every palette name back to its RGB', () => {
    for (const name of ['black', 'blue', 'darkRed', 'lightGray']) {
      const rgb = highlightColor(name)
      expect(rgb).not.toBeNull()
      expect(nearestHighlight(rgb as RGB)).toBe(name)
    }
  })

  it('accepts any casing and rejects unknown names', () => {
    expect(highlightColor('DARKBLUE')).toEqual({ r: 0, g: 0, b: 128 })
    expect(highlightColor('chartreuse')).toBeNull()
  })
})
