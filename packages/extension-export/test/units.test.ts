import { describe, expect, it } from 'vitest'
import {
  EMU_PER_PX,
  TWIPS_PER_PX,
  indentSteps,
  lengthToHalfPoints,
  lengthToPoints,
  lengthToPx,
  lengthToTwips,
  parseLineHeight,
} from '../src/units'

describe('lengthToPoints', () => {
  it('treats a bare number as pixels', () => {
    expect(lengthToPoints(16)).toBeCloseTo(12)
    expect(lengthToPoints('16')).toBeCloseTo(12)
  })

  it('converts every unit it recognises', () => {
    expect(lengthToPoints('16px')).toBeCloseTo(12)
    expect(lengthToPoints('12pt')).toBe(12)
    expect(lengthToPoints('1in')).toBe(72)
    expect(lengthToPoints('2.54cm')).toBeCloseTo(72)
    expect(lengthToPoints('25.4mm')).toBeCloseTo(72)
    expect(lengthToPoints('1pc')).toBe(12)
  })

  it('resolves em, rem and percentages against the base size', () => {
    expect(lengthToPoints('2em', 11)).toBe(22)
    expect(lengthToPoints('1.5rem', 10)).toBe(15)
    expect(lengthToPoints('150%', 10)).toBe(15)
  })

  it('defaults the base size to 12pt', () => {
    expect(lengthToPoints('2em')).toBe(24)
  })

  it('accepts whitespace between the number and the unit', () => {
    expect(lengthToPoints(' 10 pt ')).toBe(10)
  })

  it('is case-insensitive about units', () => {
    expect(lengthToPoints('1IN')).toBe(72)
  })

  it('accepts negative and fractional values', () => {
    expect(lengthToPoints('-6pt')).toBe(-6)
    expect(lengthToPoints('.5in')).toBe(36)
  })

  it('returns null for anything unparseable', () => {
    expect(lengthToPoints('auto')).toBeNull()
    expect(lengthToPoints('10vw')).toBeNull()
    expect(lengthToPoints('')).toBeNull()
    expect(lengthToPoints(null)).toBeNull()
    expect(lengthToPoints(undefined)).toBeNull()
    expect(lengthToPoints({})).toBeNull()
    expect(lengthToPoints(Number.NaN)).toBeNull()
  })
})

describe('derived unit helpers', () => {
  it('lengthToPx round-trips a pixel value', () => {
    expect(lengthToPx('16px')).toBeCloseTo(16)
    expect(lengthToPx('1in')).toBeCloseTo(96)
    expect(lengthToPx('nope')).toBeNull()
  })

  it('lengthToTwips rounds to whole twips', () => {
    expect(lengthToTwips('1in')).toBe(1440)
    expect(lengthToTwips('16px')).toBe(16 * TWIPS_PER_PX)
    expect(lengthToTwips('0.7pt')).toBe(14)
    expect(lengthToTwips('bad')).toBeNull()
  })

  it('lengthToHalfPoints rounds and enforces a floor of 2', () => {
    expect(lengthToHalfPoints('11pt')).toBe(22)
    expect(lengthToHalfPoints('0.1pt')).toBe(2)
    expect(lengthToHalfPoints('2em', 11)).toBe(44)
  })

  it('lengthToHalfPoints rejects zero and negative sizes', () => {
    expect(lengthToHalfPoints('0pt')).toBeNull()
    expect(lengthToHalfPoints('-4pt')).toBeNull()
    expect(lengthToHalfPoints('auto')).toBeNull()
  })

  it('exposes the EMU and twip constants Word expects', () => {
    expect(EMU_PER_PX).toBe(9525)
    expect(TWIPS_PER_PX).toBe(15)
    expect(EMU_PER_PX * 96).toBe(914400)
  })
})

describe('parseLineHeight', () => {
  it('reads a bare multiplier', () => {
    expect(parseLineHeight('1.5')).toEqual({ multiplier: 1.5 })
    expect(parseLineHeight(2)).toEqual({ multiplier: 2 })
  })

  it('reads a length as twips', () => {
    expect(parseLineHeight('24pt')).toEqual({ twips: 480 })
    expect(parseLineHeight('2em', 10)).toEqual({ twips: 400 })
  })

  it('rejects multipliers outside the sane range', () => {
    expect(parseLineHeight('0')).toBeNull()
    expect(parseLineHeight('11')).toBeNull()
  })

  it('rejects non-lengths and non-strings', () => {
    expect(parseLineHeight('normal')).toBeNull()
    expect(parseLineHeight(null)).toBeNull()
    expect(parseLineHeight('0pt')).toBeNull()
  })
})

describe('indentSteps', () => {
  it('clamps to the 0-8 range the schema allows', () => {
    expect(indentSteps(0)).toBe(0)
    expect(indentSteps(3)).toBe(3)
    expect(indentSteps(8)).toBe(8)
    expect(indentSteps(99)).toBe(8)
    expect(indentSteps(-4)).toBe(0)
  })

  it('rounds fractions and treats non-numbers as zero', () => {
    expect(indentSteps(2.6)).toBe(3)
    expect(indentSteps('3')).toBe(0)
    expect(indentSteps(null)).toBe(0)
    expect(indentSteps(undefined)).toBe(0)
  })
})
