// @vitest-environment happy-dom
import { Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { goalProgress } from '../src/goals'
import { SPELLCHECK_NOTE, isSpellcheckEnabled, setSpellcheck } from '../src/spellcheck'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

const counts = (words: number, characters: number) => ({ words, characters })

describe('goalProgress', () => {
  it('measures a word goal that is not reached yet', () => {
    const progress = goalProgress({ target: 1000, unit: 'words' }, counts(412, 2200))
    expect(progress).toMatchObject({
      current: 412,
      target: 1000,
      percent: 41,
      remaining: 588,
      reached: false,
    })
    expect(progress.fraction).toBeCloseTo(0.412, 3)
  })

  it('measures a word goal that is exactly reached', () => {
    const progress = goalProgress({ target: 500, unit: 'words' }, counts(500, 2600))
    expect(progress).toMatchObject({ fraction: 1, percent: 100, remaining: 0, reached: true })
  })

  it('clamps a word goal that is overshot', () => {
    const progress = goalProgress({ target: 500, unit: 'words' }, counts(1200, 6000))
    expect(progress).toMatchObject({
      current: 1200,
      fraction: 1,
      percent: 100,
      remaining: 0,
      reached: true,
    })
  })

  it('measures a character goal against the character count', () => {
    const under = goalProgress({ target: 280, unit: 'characters' }, counts(20, 140))
    expect(under).toMatchObject({ current: 140, percent: 50, remaining: 140, reached: false })
    const at = goalProgress({ target: 280, unit: 'characters' }, counts(50, 280))
    expect(at).toMatchObject({ percent: 100, remaining: 0, reached: true })
    const over = goalProgress({ target: 280, unit: 'characters' }, counts(90, 500))
    expect(over).toMatchObject({ current: 500, fraction: 1, reached: true })
  })

  it('labels progress with the unit and thousands separators', () => {
    expect(goalProgress({ target: 1000, unit: 'words' }, counts(412, 0)).label).toBe(
      '412 / 1,000 words',
    )
    expect(goalProgress({ target: 2500, unit: 'characters' }, counts(0, 12000)).label).toBe(
      '12,000 / 2,500 characters',
    )
  })

  it('keeps the goal’s display name out of the progress label', () => {
    const goal = { target: 100, unit: 'words', label: 'Chapter draft' } as const
    expect(goalProgress(goal, counts(10, 0)).label).toBe('10 / 100 words')
  })

  it('treats a non-positive or fractional target sensibly', () => {
    expect(goalProgress({ target: 0, unit: 'words' }, counts(0, 0))).toMatchObject({
      target: 0,
      fraction: 1,
      percent: 100,
      remaining: 0,
      reached: true,
    })
    expect(goalProgress({ target: -50, unit: 'words' }, counts(3, 0)).target).toBe(0)
    expect(goalProgress({ target: 100.9, unit: 'words' }, counts(0, 0)).target).toBe(100)
  })

  it('never reports a negative count', () => {
    expect(goalProgress({ target: 100, unit: 'words' }, counts(-5, -5))).toMatchObject({
      current: 0,
      percent: 0,
      remaining: 100,
    })
  })
})

describe('spellcheck', () => {
  it('turns the surface’s spellcheck attribute on and off', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createEditor({ schema, element: host })
    // Absent means "browser default", which is on.
    expect(isSpellcheckEnabled(editor)).toBe(true)
    setSpellcheck(editor, false)
    expect(editor.view?.dom.getAttribute('spellcheck')).toBe('false')
    expect(isSpellcheckEnabled(editor)).toBe(false)
    setSpellcheck(editor, true)
    expect(editor.view?.dom.getAttribute('spellcheck')).toBe('true')
    expect(isSpellcheckEnabled(editor)).toBe(true)
    editor.destroy()
  })

  it('reports false for a headless editor, which has no surface', () => {
    const editor = createEditor({ schema })
    expect(isSpellcheckEnabled(editor)).toBe(false)
    expect(() => setSpellcheck(editor, true)).not.toThrow()
    expect(isSpellcheckEnabled(editor)).toBe(false)
    editor.destroy()
  })

  it('says who owns the dictionaries', () => {
    expect(SPELLCHECK_NOTE).toContain('browser')
    expect(SPELLCHECK_NOTE).toContain('spellcheck attribute')
  })
})
