import { type EditorNode, Fragment, Schema, defaultMarks, defaultNodes } from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { serializeToPPTX } from '../src/pptx'
import { documentSlides } from '../src/slides'
import { parseXML } from '../src/xml'
import { readZip } from '../src/zip'
import { partText } from './helpers'

// A note callout, as extension-blocks makes it: speaker's notes on a slide.
const schema = new Schema({
  nodes: {
    ...defaultNodes(),
    callout: { content: 'block+', group: 'block', attrs: { variant: { default: 'info' } } },
  },
  marks: defaultMarks(),
})

const text = (value: string, ...marks: string[]): EditorNode =>
  schema.text(
    value,
    marks.map((name) => schema.mark(name)),
  )
const p = (...inline: EditorNode[]): EditorNode =>
  schema.node('paragraph', undefined, Fragment.from(inline))
const h = (level: number, value: string): EditorNode =>
  schema.node('heading', { level }, [text(value)])
const bullets = (...items: EditorNode[][]): EditorNode =>
  schema.node(
    'bulletList',
    undefined,
    items.map((content) => schema.node('listItem', undefined, content)),
  )

const talk = schema.node('doc', undefined, [
  p(text('Opening words')),
  h(2, 'Why'),
  p(text('Because '), text('it matters', 'bold'), text(' & helps.')),
  schema.node('callout', { variant: 'note' }, [p(text('Pause for questions here.'))]),
  h(2, 'How'),
  bullets([p(text('First step'))], [p(text('Second step')), bullets([p(text('A detail'))])]),
  h(3, 'Not a slide of its own'),
])

describe('slides from a document', () => {
  it('start one at each top-level heading, notes taken out of the slide', () => {
    const slides = documentSlides(talk)
    expect(slides.map((slide) => slide.title)).toEqual(['', 'Why', 'How'])
    expect(slides[1]?.notes).toEqual(['Pause for questions here.'])
    expect(slides[1]?.blocks.map((block) => block.type.name)).toEqual(['paragraph'])
    expect(slides[2]?.blocks.map((block) => block.type.name)).toEqual(['bulletList', 'heading'])
  })
})

describe('the PowerPoint file', () => {
  it('has every part PowerPoint needs, well formed, with the slides and their notes', async () => {
    const parts = await readZip(serializeToPPTX(talk, { modified: new Date(Date.UTC(2026, 0, 1)) }))
    for (const name of [
      '[Content_Types].xml',
      'ppt/presentation.xml',
      'ppt/slideMasters/slideMaster1.xml',
      'ppt/slideLayouts/slideLayout1.xml',
      'ppt/notesMasters/notesMaster1.xml',
      'ppt/theme/theme1.xml',
      'ppt/slides/slide3.xml',
      'ppt/notesSlides/notesSlide2.xml',
    ]) {
      expect(parts.has(name), name).toBe(true)
    }
    for (const [name, bytes] of parts) {
      if (!name.endsWith('.xml') && !name.endsWith('.rels')) continue
      expect(() => parseXML(new TextDecoder().decode(bytes)), name).not.toThrow()
    }
    const why = partText(parts, 'ppt/slides/slide2.xml')
    expect(why).toContain('<a:t>Why</a:t>')
    expect(why).toContain('<a:rPr lang="en-US" b="1" dirty="0"></a:rPr><a:t>it matters</a:t>')
    expect(why).toContain('<a:t> &amp; helps.</a:t>')
    expect(partText(parts, 'ppt/notesSlides/notesSlide2.xml')).toContain(
      'Pause for questions here.',
    )
    const how = partText(parts, 'ppt/slides/slide3.xml')
    expect(how).toContain('<a:p><a:r><a:rPr lang="en-US" dirty="0"></a:rPr><a:t>First step</a:t>')
    expect(how).toContain(
      '<a:pPr lvl="1"/><a:r><a:rPr lang="en-US" dirty="0"></a:rPr><a:t>A detail</a:t>',
    )
    expect(partText(parts, 'ppt/presentation.xml').match(/<p:sldId /g)).toHaveLength(3)
  })
})
