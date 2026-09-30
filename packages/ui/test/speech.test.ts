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
  speak(utterance: SpeechSynthesisUtterance): void {
    this.said.push(utterance)
  }
  cancel(): void {}
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
  hear(transcript: string): void {
    this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript } }] })
  }
}

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
})
