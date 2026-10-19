import {
  type Editor,
  type Path,
  TextSelection,
  insertText,
  nodeAtPath,
  pathsEqual,
  pos,
  textblocks,
} from '@trevixal/core'

/**
 * Dictation and read-aloud, through the browser's own Web Speech API: no
 * service of the editor's, nothing bundled. Reading follows the voice with
 * the caret, word by word; dictation types what it hears at the caret.
 * Either is simply unavailable where the browser lacks it.
 */

/** The parts of the Web Speech recognition API dictation uses. */
interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: RecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
  start(): void
  stop(): void
}

interface RecognitionEventLike {
  readonly resultIndex: number
  readonly results: ArrayLike<{
    readonly isFinal: boolean
    readonly 0: { readonly transcript: string }
  }>
}

type RecognitionConstructor = new () => RecognitionLike

export interface SpeechOptions {
  /** The language to hear and to speak, as a BCP 47 code; the page's by default. */
  readonly lang?: string
  /** Told whenever dictation or reading starts or stops, to show it. */
  readonly onChange?: () => void
  /**
   * Told why dictation or reading stopped on its own: the microphone refused,
   * no network for the browser's recognition service, no voice to read with.
   * Without it a failure looked like a menu entry that did nothing.
   */
  readonly onError?: (message: string) => void
}

/**
 * Recognition errors that end dictation, and what to tell the writer. The
 * rest, a silence (`no-speech`) or our own stop (`aborted`), only pause it.
 */
const DICTATION_ERRORS: Readonly<Record<string, string>> = {
  'not-allowed': 'Dictation needs the microphone. Allow it for this page, then try again.',
  'service-not-allowed': 'This browser does not allow dictation on this page.',
  'audio-capture': 'No microphone was found.',
  network:
    'Dictation needs a network connection: the browser sends the sound to its speech service.',
  'language-not-supported': 'Dictation does not support this language here.',
}

/** Synthesis errors that are our own doing: a stop, or the next passage taking over. */
const READING_STOPS = new Set(['interrupted', 'canceled'])

export interface Speech {
  /** Whether this browser can take dictation. */
  readonly canDictate: boolean
  /** Whether this browser can read aloud. */
  readonly canReadAloud: boolean
  readonly isDictating: boolean
  readonly isReading: boolean
  toggleDictation(): void
  toggleReadAloud(): void
  destroy(): void
}

/** One textblock to read, where it is and what it says. */
interface Passage {
  readonly path: Path
  readonly from: number
  readonly text: string
}

/** The textblocks from the caret on, the first starting at the caret. */
function passagesFrom(editor: Editor): Passage[] {
  const { doc, selection } = editor.state
  const start = selection.from
  const passages: Passage[] = []
  let begun = false
  for (const { path, node } of textblocks(doc)) {
    const here = pathsEqual(path, start.path)
    if (here) begun = true
    if (!begun) continue
    const from = here ? start.offset : 0
    const text = node.textContent.slice(from)
    if (text.trim() !== '') passages.push({ path, from, text })
  }
  // With nothing after the caret, it reads the whole document from the top.
  return passages.length > 0
    ? passages
    : textblocks(doc)
        .filter(({ node }) => node.textContent.trim() !== '')
        .map(({ path, node }) => ({ path, from: 0, text: node.textContent }))
}

export function createSpeech(editor: Editor, options: SpeechOptions = {}): Speech {
  const view = editor.view
  const window = view?.dom.ownerDocument.defaultView as
    | (Window & {
        SpeechRecognition?: RecognitionConstructor
        webkitSpeechRecognition?: RecognitionConstructor
      })
    | null
    | undefined
  const Recognition = window?.SpeechRecognition ?? window?.webkitSpeechRecognition
  const synthesis = window?.speechSynthesis
  // An empty `lang` attribute is no language: the browser's own, then English.
  const lang =
    options.lang ||
    view?.dom.ownerDocument.documentElement.lang ||
    window?.navigator.language ||
    'en'
  let recognition: RecognitionLike | null = null
  let reading = false
  /**
   * The utterance being spoken. Held here because Chrome lets one nothing
   * else refers to be collected mid-sentence, and its `end` then never comes:
   * reading stopped after the first paragraph.
   */
  let speaking: SpeechSynthesisUtterance | null = null

  const changed = (): void => options.onChange?.()

  const stopDictation = (): void => {
    const current = recognition
    recognition = null
    current?.stop()
    changed()
  }

  const startDictation = (): void => {
    if (!Recognition) return
    const listener = new Recognition()
    listener.lang = lang
    listener.continuous = true
    listener.interimResults = false
    listener.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index]
        const words = result?.[0].transcript.trim()
        if (!result?.isFinal || !words) continue
        // A space between what was there and what is said, as a typist would.
        const { selection, doc } = editor.state
        const block = nodeAtPath(doc, selection.from.path)
        const before = block?.textContent.slice(0, selection.from.offset) ?? ''
        const gap = before === '' || /\s$/.test(before) ? '' : ' '
        editor.exec(insertText(`${gap}${words}`))
      }
    }
    // Recognition stops itself after a pause; while dictation is on, it listens again.
    listener.onend = () => {
      if (recognition === listener) listener.start()
    }
    listener.onerror = (event) => {
      const message = DICTATION_ERRORS[event.error ?? '']
      if (!message || recognition !== listener) return
      // Stopped for good: listening again would only fail again, round and round.
      stopDictation()
      options.onError?.(message)
    }
    recognition = listener
    listener.start()
    changed()
  }

  const stopReading = (): void => {
    reading = false
    speaking = null
    synthesis?.cancel()
    changed()
  }

  const startReading = (): void => {
    if (!synthesis) return
    const passages = passagesFrom(editor)
    if (passages.length === 0) return
    reading = true
    changed()
    const speak = (index: number): void => {
      const passage = passages[index]
      if (!reading || !passage) {
        if (reading) stopReading()
        return
      }
      const utterance = new SpeechSynthesisUtterance(passage.text)
      utterance.lang = lang
      // The caret follows the voice: each word as it is spoken.
      utterance.onboundary = (event) => {
        if (!reading || event.name === 'sentence') return
        const offset = passage.from + event.charIndex
        editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos(passage.path, offset))))
        editor.view?.scrollSelectionIntoView()
      }
      // Only the utterance being spoken moves on: one a stop cancelled, or a
      // reading started over, ends late and must not.
      utterance.onend = () => {
        if (speaking === utterance) speak(index + 1)
      }
      utterance.onerror = (event) => {
        if (speaking !== utterance || !reading || READING_STOPS.has(event.error)) return
        stopReading()
        options.onError?.(
          'This browser has no voice to read with. Install one in its speech settings.',
        )
      }
      speaking = utterance
      synthesis.speak(utterance)
    }
    // A previous reading still queued, or the queue left paused, would hold
    // this one back: start from a clean queue.
    synthesis.cancel()
    speak(0)
  }

  return {
    canDictate: Boolean(Recognition),
    canReadAloud: Boolean(synthesis),
    get isDictating() {
      return recognition !== null
    },
    get isReading() {
      return reading
    },
    toggleDictation() {
      if (recognition) stopDictation()
      else startDictation()
    },
    toggleReadAloud() {
      if (reading) stopReading()
      else startReading()
    },
    destroy() {
      if (recognition) stopDictation()
      if (reading) stopReading()
    },
  }
}
