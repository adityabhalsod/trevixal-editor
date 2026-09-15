import { describe, expect, it } from 'vitest'
import { setTextAlign } from '../src/commands/commands'
import { createEditor } from '../src/editor/editor'
import { FormatPainter, describeFormat } from '../src/editor/format-painter'
import { testSchema } from './helpers'

/** An editor holding `text`, with the whole document selected. */
function editorWith(text: string) {
  const editor = createEditor({ schema: testSchema })
  editor.commands.insertText(text)
  editor.commands.selectAll()
  return editor
}

describe('FormatPainter', () => {
  it('starts with nothing copied and disarmed', () => {
    const editor = editorWith('text')
    const painter = new FormatPainter(editor)
    expect(painter.state).toEqual({ format: null, armed: false, locked: false })
    expect(painter.apply()).toBe(false)
    editor.destroy()
  })

  it('copies the marks at the selection and applies them elsewhere', () => {
    const editor = editorWith('source')
    editor.commands.toggleMark('bold')
    editor.commands.toggleMark('italic')

    const painter = new FormatPainter(editor)
    painter.copy()
    expect(Object.keys(painter.state.format?.marks ?? {}).sort()).toEqual(['bold', 'italic'])

    // A second paragraph, unformatted, becomes the target.
    editor.commands.selectAll()
    editor.commands.insertText('target')
    editor.commands.selectAll()
    painter.apply()

    const html = editor.getHTML()
    expect(html).toContain('<strong>')
    expect(html).toContain('<em>')
    editor.destroy()
  })

  it('replaces the target formatting rather than merging with it', () => {
    const editor = editorWith('plain')
    const painter = new FormatPainter(editor)
    painter.copy() // nothing but a plain paragraph

    editor.commands.selectAll()
    editor.commands.toggleMark('bold')
    expect(editor.getHTML()).toContain('<strong>')

    // Painting a plain format must strip the bold, not leave it in place.
    editor.commands.selectAll()
    painter.apply()
    expect(editor.getHTML()).not.toContain('<strong>')
    editor.destroy()
  })

  it('disarms after one use, and stays armed when locked', () => {
    const editor = editorWith('text')
    const painter = new FormatPainter(editor)

    painter.copy()
    expect(painter.state.armed).toBe(true)
    painter.apply()
    expect(painter.state.armed).toBe(false)
    // The captured format survives, so the button can still describe it.
    expect(painter.state.format).not.toBeNull()

    painter.copyAndLock()
    expect(painter.state).toMatchObject({ armed: true, locked: true })
    painter.apply()
    expect(painter.state).toMatchObject({ armed: true, locked: true })

    painter.cancel()
    expect(painter.state).toMatchObject({ armed: false, locked: false })
    editor.destroy()
  })

  it('reports state changes to the listener', () => {
    const editor = editorWith('text')
    const seen: boolean[] = []
    const painter = new FormatPainter(editor, {
      onChange: (state) => seen.push(state.armed),
    })

    painter.copy()
    painter.apply()
    expect(seen).toEqual([true, false])
    editor.destroy()
  })

  it('carries block type and alignment, but not a block-defining attribute', () => {
    const editor = editorWith('heading text')
    editor.commands.setHeading(2)
    editor.exec(setTextAlign('center'))

    const painter = new FormatPainter(editor)
    painter.copy()

    expect(painter.state.format?.blockType).toBe('heading')
    expect(painter.state.format?.blockAttrs).toMatchObject({ align: 'center', level: 2 })
    editor.destroy()
  })

  it('omits block formatting when asked to', () => {
    const editor = editorWith('heading')
    editor.commands.setHeading(1)

    const painter = new FormatPainter(editor, { includeBlock: false })
    painter.copy()
    expect(painter.state.format?.blockType).toBeNull()
    expect(painter.state.format?.blockAttrs).toBeNull()
    editor.destroy()
  })

  it('does not copy links or suggestion marks as formatting', () => {
    const editor = editorWith('linked')
    editor.commands.setLink('https://example.com')

    const painter = new FormatPainter(editor)
    painter.copy()
    // Painting a style must not spread someone's URL across the document.
    expect(painter.state.format?.marks).not.toHaveProperty('link')
    editor.destroy()
  })

  it('copies attributed marks with their values', () => {
    const editor = editorWith('styled')
    editor.commands.setFontSize('24pt')
    editor.commands.setTextColor('#ff0000')

    const painter = new FormatPainter(editor)
    painter.copy()
    expect(painter.state.format?.marks.fontSize).toEqual({ size: '24pt' })
    expect(painter.state.format?.marks.textColor).toEqual({ color: '#ff0000' })

    editor.commands.selectAll()
    editor.commands.insertText('other')
    editor.commands.selectAll()
    painter.apply()

    const html = editor.getHTML()
    expect(html).toContain('24pt')
    expect(html).toContain('#ff0000')
    editor.destroy()
  })

  it('describes what was copied', () => {
    expect(describeFormat(null)).toBe('Nothing copied')
    expect(describeFormat({ marks: {}, blockType: 'paragraph', blockAttrs: null })).toBe(
      'Plain text',
    )
    expect(describeFormat({ marks: { bold: {} }, blockType: 'heading', blockAttrs: null })).toBe(
      'heading, bold',
    )
  })
})
