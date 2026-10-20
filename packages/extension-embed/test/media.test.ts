// @vitest-environment happy-dom
import {
  EditorState,
  Fragment,
  NodeSelection,
  Schema,
  defaultMarks,
  defaultNodes,
  parseHTML,
  serializeToHTML,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { embedNodes } from '../src'
import {
  formatTime,
  parseChapters,
  parseWaveform,
  setVideoChapters,
  videoChaptersAt,
  waveformPeaks,
} from '../src/media'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...embedNodes() },
  marks: defaultMarks(),
})

describe('video chapters', () => {
  it('reads chapters as a description lists them, in time order', () => {
    expect(parseChapters('1:30 Setting up\n0:00 Intro\nnot a chapter\n1:02:03 - The end')).toEqual([
      { seconds: 0, title: 'Intro' },
      { seconds: 90, title: 'Setting up' },
      { seconds: 3723, title: 'The end' },
    ])
    expect(formatTime(3723)).toBe('1:02:03')
    expect(formatTime(65)).toBe('1:05')
  })

  it('lists them under the player as links to their start', () => {
    const video = schema.node('video', {
      src: 'https://x.test/talk.mp4',
      chapters: '0:00 Intro\n1:30 Setting up',
    })
    const html = serializeToHTML(schema.node('doc', undefined, Fragment.of(video)))
    expect(html).toContain('data-chapters=')
    expect(html).toContain('<video class="trevixal-video" controls src="https://x.test/talk.mp4">')
    expect(html).toContain('href="https://x.test/talk.mp4#t=90" data-seconds="90"')
    const back = parseHTML(schema, html).child(0)
    expect(back.type.name).toBe('video')
    expect(back.attrs.chapters).toBe('0:00 Intro\n1:30 Setting up')
  })

  it('are set on the selected video, and taken off with nothing', () => {
    const doc = schema.node(
      'doc',
      undefined,
      Fragment.of(schema.node('video', { src: 'https://x.test/talk.mp4' })),
    )
    const state = EditorState.create({ schema, doc, selection: new NodeSelection([0]) })
    expect(videoChaptersAt(state)).toBe('')
    const withChapters = state.apply(
      setVideoChapters('2:00 Questions\n0:00 Talk')(state) as NonNullable<
        ReturnType<ReturnType<typeof setVideoChapters>>
      >,
    )
    expect(withChapters.doc.child(0).attrs.chapters).toBe('0:00 Talk\n2:00 Questions')
    const cleared = setVideoChapters('')(withChapters)
    expect(cleared?.doc.child(0).attrs.chapters).toBeNull()
  })
})

describe('a recording’s waveform', () => {
  it('shares the sampled levels out into bars, each the loudest in its stretch', () => {
    expect(waveformPeaks([0.1, 0.9, 0.2, 0.4], 2)).toEqual([90, 40])
    expect(waveformPeaks([], 4)).toEqual([])
  })

  it('draws above the player and comes back through HTML', () => {
    const audio = schema.node('audio', { src: 'https://x.test/memo.webm', waveform: '10,80,40' })
    const html = serializeToHTML(schema.node('doc', undefined, Fragment.of(audio)))
    expect(html).toContain('class="trevixal-audio-block" data-waveform="10,80,40"')
    expect(html).toContain('<svg class="trevixal-waveform"')
    const back = parseHTML(schema, html).child(0)
    expect(back.attrs).toMatchObject({ src: 'https://x.test/memo.webm', waveform: '10,80,40' })
    expect(parseWaveform('10,x')).toEqual([])
  })
})
