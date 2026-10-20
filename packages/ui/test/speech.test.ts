// @vitest-environment happy-dom
import {
  type Editor,
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  parseHTML,
  pos,
} from '@trevixal/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createSpeech } from '../src/speech'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })
const editors: Editor[] = []

function mount(html: string): Editor {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ schema, element: host, doc: parseHTML(schema, html, document) })
  editors.push(editor)
  return editor
}

/** A stand-in voice: it says each utterance a word at a time, when told. */
class Voice {
  readonly said: SpeechSynthesisUtterance[] = []
  paused = false
  cancelled = 0
  constructor(readonly voices: Partial<SpeechSynthesisVoice>[] = []) {}
  getVoices(): Partial<SpeechSynthesisVoice>[] {
    return this.voices
  }
  speak(utterance: SpeechSynthesisUtterance): void {
    this.said.push(utterance)
  }
  cancel(): void {
    this.cancelled++
  }
  resume(): void {
    this.paused = false
  }
  /** Finish the latest utterance, marking each word's start on the way. */
  finish(): void {
    const utterance = this.said.at(-1)
    if (!utterance) return
    for (const word of utterance.text.matchAll(/\S+/g)) {
      utterance.onboundary?.({ name: 'word', charIndex: word.index ?? 0 } as SpeechSynthesisEvent)
    }
    utterance.onend?.({} as SpeechSynthesisEvent)
  }
}

class FakeUtterance {
  lang = ''
  voice: SpeechSynthesisVoice | null = null
  onboundary: ((event: SpeechSynthesisEvent) => void) | null = null
  onend: ((event: SpeechSynthesisEvent) => void) | null = null
  constructor(readonly text: string) {}
}

/** A stand-in microphone that hears what the test says it hears. */
class Microphone {
  static last: Microphone | null = null
  lang = ''
  continuous = false
  interimResults = false
  onresult: ((event: unknown) => void) | null = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  started = 0
  constructor() {
    Microphone.last = this
  }
  start(): void {
    this.started++
  }
  stop(): void {}
  hear(transcript: string, isFinal = true): void {
    this.onresult?.({ resultIndex: 0, results: [{ isFinal, 0: { transcript } }] })
  }
}

/** Read the document aloud with a fresh stand-in voice, the caret where given. */
function readAloud(html: string, at = pos([0], 0), voices: Partial<SpeechSynthesisVoice>[] = []) {
  const voice = new Voice(voices)
  Object.assign(window, { speechSynthesis: voice, SpeechSynthesisUtterance: FakeUtterance })
  const editor = mount(html)
  editor.dispatch(editor.state.tr.setSelection(new TextSelection(at)))
  const speech = createSpeech(editor)
  speech.toggleReadAloud()
  return { voice, editor, speech }
}

/** Take dictation into the document, the caret at its end. */
function dictate(html: string, Recognition: typeof Microphone = Microphone) {
  Object.assign(window, { SpeechRecognition: Recognition })
  const editor = mount(html)
  const end = editor.state.doc.child(0).textContent.length
  editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], end))))
  const errors: string[] = []
  const speech = createSpeech(editor, { onError: (message) => errors.push(message) })
  speech.toggleDictation()
  return { editor, speech, errors }
}

const texts = (editor: Editor): string[] =>
  editor.state.doc.content.children.map((block) => block.textContent)

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy()
  document.body.innerHTML = ''
})

describe('reading aloud', () => {
  it('reads from the caret, block by block, the caret on each word as it is said', () => {
    const voice = new Voice()
    Object.assign(window, { speechSynthesis: voice, SpeechSynthesisUtterance: FakeUtterance })
    const editor = mount('<p>One two three</p><p>Four five</p>')
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 4))))
    const speech = createSpeech(editor)
    expect(speech.canReadAloud).toBe(true)
    speech.toggleReadAloud()
    expect(voice.said.map((utterance) => utterance.text)).toEqual(['two three'])
    voice.finish()
    expect(voice.said.map((utterance) => utterance.text)).toEqual(['two three', 'Four five'])
    voice.finish()
    expect(editor.state.selection.from).toEqual(pos([1], 5))
    expect(speech.isReading).toBe(false)
  })

  it('says a paragraph a sentence at a time, and cuts a long sentence where a word ends', () => {
    const long = Array.from({ length: 50 }, (_, index) => `word${index}`).join(' ')
    const { voice } = readAloud(`<p>First one here. Then this! ${long}</p>`)
    expect(voice.said.map((utterance) => utterance.text)).toEqual(['First one here. '])
    voice.finish()
    voice.finish()
    voice.finish()
    const said = voice.said.map((utterance) => utterance.text)
    expect(said[1]).toBe('Then this! ')
    // Chrome's voices fall silent some way into a long utterance; each piece
    // but the last ends where a word does.
    const rest = said.slice(2)
    expect(rest.length).toBeGreaterThan(1)
    expect(rest.every((text) => text.length <= 200)).toBe(true)
    expect(rest.slice(0, -1).every((text) => text.endsWith(' '))).toBe(true)
    expect(rest.join('')).toBe(long)
  })

  it('picks out the whole word being said, and finds it past an atom', () => {
    const { voice, editor } = readAloud('<p>One<br>two</p>')
    const utterance = voice.said[0]
    utterance?.onboundary?.({ name: 'word', charIndex: 4 } as SpeechSynthesisEvent)
    expect(editor.state.selection.from).toEqual(pos([0], 4))
    expect(editor.state.selection.to).toEqual(pos([0], 7))
  })

  it('stops when the writer moves the caret or edits, but not for its own picking out', () => {
    const { voice, editor, speech } = readAloud('<p>One two</p>')
    voice.said[0]?.onboundary?.({ name: 'word', charIndex: 0 } as SpeechSynthesisEvent)
    expect(speech.isReading).toBe(true)
    const cancelled = voice.cancelled
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 7))))
    expect(speech.isReading).toBe(false)
    expect(voice.cancelled).toBe(cancelled + 1)
    // An utterance cancelled by the stop ends late, and reads nothing more.
    voice.finish()
    expect(voice.said).toHaveLength(1)
  })

  it('reads with the default voice for the language, else one on the device', () => {
    const voices = [
      { lang: 'fr-FR', default: true, localService: true, name: 'Amélie' },
      { lang: 'en-GB', default: false, localService: false, name: 'Network' },
      { lang: 'en_GB', default: false, localService: true, name: 'Device' },
    ]
    document.documentElement.lang = 'en-GB'
    try {
      const { voice } = readAloud('<p>Hello</p>', pos([0], 0), voices)
      expect(voice.said[0]?.voice?.name).toBe('Device')
      expect(voice.said[0]?.lang).toBe('en_GB')
    } finally {
      document.documentElement.lang = ''
    }
  })

  it('starts again from a queue left paused', () => {
    const voice = new Voice()
    voice.paused = true
    Object.assign(window, { speechSynthesis: voice, SpeechSynthesisUtterance: FakeUtterance })
    createSpeech(mount('<p>Hello</p>')).toggleReadAloud()
    expect(voice.paused).toBe(false)
    expect(voice.said).toHaveLength(1)
  })
})

describe('dictation', () => {
  it('types what it hears at the caret, a space before it, and listens again after a pause', () => {
    Object.assign(window, { SpeechRecognition: Microphone })
    const editor = mount('<p>Hello</p>')
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 5))))
    const speech = createSpeech(editor)
    expect(speech.canDictate).toBe(true)
    speech.toggleDictation()
    Microphone.last?.hear('world again')
    expect(editor.state.doc.textContent).toBe('Hello world again')
    Microphone.last?.onend?.()
    expect(Microphone.last?.started).toBe(2)
    speech.toggleDictation()
    expect(speech.isDictating).toBe(false)
  })

  it('shows the words as they are heard, then settles them in their place', () => {
    const { editor } = dictate('<p></p>')
    expect(Microphone.last?.interimResults).toBe(true)
    Microphone.last?.hear('hello there', false)
    expect(texts(editor)).toEqual(['Hello there'])
    Microphone.last?.hear('hello there comma how are you question mark')
    expect(texts(editor)).toEqual(['Hello there, how are you?'])
  })

  it('takes a spoken new paragraph and new line as breaks, and capitals after a stop', () => {
    const { editor } = dictate('<p>Done.</p>')
    Microphone.last?.hear('next new paragraph more new line last')
    expect(texts(editor)).toEqual(['Done. Next', 'Morelast'])
    // No space after the line break, and no capital: the sentence goes on.
    const broken = editor.state.doc.child(1).content.children
    expect(broken.map((child) => child.type.name)).toEqual(['text', 'hardBreak', 'text'])
    expect(broken[2]?.textContent).toBe('last')
  })

  it('says why it stopped when the microphone cannot listen again', () => {
    class Stubborn extends Microphone {
      override start(): void {
        super.start()
        if (this.started > 1) throw new Error('InvalidStateError')
      }
    }
    const { speech, errors } = dictate('<p>Hi</p>', Stubborn)
    Microphone.last?.onend?.()
    expect(speech.isDictating).toBe(false)
    expect(errors).toEqual(['Dictation stopped. Start it again from the Tools menu.'])
  })
})
