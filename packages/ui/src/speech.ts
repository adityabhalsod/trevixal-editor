import {
  type Editor,
  type EditorNode,
  type Path,
  TextSelection,
  deleteSelection,
  insertInlineNode,
  insertText,
  nodeAtPath,
  pathsEqual,
  pos,
  splitBlock,
  textblocks,
} from '@trevixal/core'

/**
 * Dictation and read-aloud, through the browser's own Web Speech API: no
 * service of the editor's, nothing bundled. Reading picks out each word as
 * the voice says it; dictation types what it hears at the caret, showing the
 * words as they are recognised. Either is simply unavailable where the
 * browser lacks it.
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

/**
 * The longest piece of text handed to the voice at once. Chrome's network
 * voices fall silent about fifteen seconds into an utterance and never say
 * it ended, so a long paragraph stopped the reading for good; a sentence at
 * a time stays well inside that.
 */
const MAX_PIECE = 200

/** Where a sentence ends: its stop, and the space after it. */
const SENTENCE_END = /[.!?…。！？]+["'”’)\]]*\s+/g

/**
 * What a dictating writer says for punctuation and layout, as voice typing in
 * a word processor takes it, in English. Each says the mark, not the word.
 */
const SPOKEN_MARKS: readonly (readonly [RegExp, string])[] = [
  [/\s*\b(?:period|full stop)\b/gi, '.'],
  [/\s*\bcomma\b/gi, ','],
  [/\s*\bquestion mark\b/gi, '?'],
  [/\s*\bexclamation (?:mark|point)\b/gi, '!'],
  [/\s*\bcolon\b/gi, ':'],
  [/\s*\bsemicolon\b/gi, ';'],
]

/** A spoken break: a new line in the paragraph, or a new paragraph. */
const SPOKEN_BREAK = /\s*\bnew (line|paragraph)\b\s*/i

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

/** A piece of a textblock to read: where it is, what it says, and where each character sits. */
interface Passage {
  readonly path: Path
  readonly text: string
  /** Each character's offset in the block: an atom (an equation, a chip) takes one, unsaid. */
  readonly offsets: readonly number[]
}

/**
 * A textblock's spoken text, and each character's place in the block. Its
 * atoms are passed over in silence, but each still counts one place, so a
 * word after an equation is found where it is, not one place early.
 */
function spokenText(block: EditorNode): { text: string; offsets: number[] } {
  let text = ''
  const offsets: number[] = []
  let offset = 0
  for (const child of block.content.children) {
    if (child.isText) {
      for (const char of child.textContent) {
        text += char
        offsets.push(offset)
        offset += char.length
      }
    } else {
      // A space where the atom stood, so the words either side stay two words.
      text += ' '
      offsets.push(offset)
      offset += 1
    }
  }
  offsets.push(offset)
  return { text, offsets }
}

/** A passage cut into sentences, each no longer than `MAX_PIECE`, at word boundaries. */
function pieces(passage: Passage): Passage[] {
  const out: Passage[] = []
  const take = (start: number, end: number): void => {
    const text = passage.text.slice(start, end)
    if (text.trim() === '') return
    out.push({ path: passage.path, text, offsets: passage.offsets.slice(start, end + 1) })
  }
  let start = 0
  const cut = (end: number): void => {
    // A sentence too long for one breath is cut at the last space that fits.
    while (end - start > MAX_PIECE) {
      const space = passage.text.lastIndexOf(' ', start + MAX_PIECE)
      const at = space > start ? space + 1 : start + MAX_PIECE
      take(start, at)
      start = at
    }
    take(start, end)
    start = end
  }
  for (const match of passage.text.matchAll(SENTENCE_END)) cut((match.index ?? 0) + match[0].length)
  cut(passage.text.length)
  return out
}

/** The textblocks from the caret on, the first starting at the caret, cut into sentences. */
function passagesFrom(editor: Editor): Passage[] {
  const { doc, selection } = editor.state
  const start = selection.from
  const passages: Passage[] = []
  let begun = false
  for (const { path, node } of textblocks(doc)) {
    const here = pathsEqual(path, start.path)
    if (here) begun = true
    if (!begun) continue
    const { text, offsets } = spokenText(node)
    const from = here
      ? Math.max(
          0,
          offsets.findIndex((offset) => offset >= start.offset),
        )
      : 0
    passages.push(...pieces({ path, text: text.slice(from), offsets: offsets.slice(from) }))
  }
  if (passages.length > 0) return passages
  // With nothing after the caret, it reads the whole document from the top.
  return textblocks(doc).flatMap(({ path, node }) => pieces({ path, ...spokenText(node) }))
}

/**
 * The language to hear and speak: the one asked for, else the page's; a bare
 * one (`en`) narrowed to the reader's own region where it agrees (`en-IN`), so
 * the voice and the recogniser are the ones for their accent.
 */
function speechLanguage(
  options: SpeechOptions,
  page: string | undefined,
  browser: string | undefined,
): string {
  if (options.lang) return options.lang
  const own = page || browser || 'en'
  if (browser && !own.includes('-') && browser.toLowerCase().startsWith(`${own.toLowerCase()}-`)) {
    return browser
  }
  return own
}

/**
 * The voice to read with: the system's default where it speaks the language,
 * else one on the device (which marks each word as it says it, where a network
 * voice does not), else any that speaks it. Null leaves the choice to the browser.
 */
function voiceFor(synthesis: SpeechSynthesis, lang: string): SpeechSynthesisVoice | null {
  const voices = synthesis.getVoices?.() ?? []
  const wanted = lang.toLowerCase()
  const primary = wanted.split('-')[0] ?? wanted
  const speaks = (voice: SpeechSynthesisVoice, exact: boolean): boolean => {
    const own = voice.lang.toLowerCase().replace('_', '-')
    return exact ? own === wanted : own.split('-')[0] === primary
  }
  for (const exact of [true, false]) {
    const matching = voices.filter((voice) => speaks(voice, exact))
    const chosen =
      matching.find((voice) => voice.default) ??
      matching.find((voice) => voice.localService) ??
      matching[0]
    if (chosen) return chosen
  }
  return null
}

/**
 * A block's text before an offset, as dictation reads it to space and
 * capitalise what comes next: a line break as one, any other atom as a
 * character, so each still counts the one place it takes.
 */
function textBefore(block: EditorNode | null, offset: number): string {
  let text = ''
  for (const child of block?.content.children ?? []) {
    if (text.length >= offset) break
    text += child.isText ? child.textContent : child.type.name === 'hardBreak' ? '\n' : '\uFFFC'
  }
  return text.slice(0, offset)
}

/** Text as a dictating writer means it: its spoken marks as marks, a sentence's first word capitalised. */
function dictated(words: string, before: string, english: boolean): string {
  let text = words.trim()
  if (english) {
    for (const [spoken, mark] of SPOKEN_MARKS) text = text.replace(spoken, mark)
  }
  // A new sentence starts with a capital: at the start of a block, or after a stop.
  if (before.trim() === '' || /[.!?]\s*$/.test(before)) {
    text = text.charAt(0).toLocaleUpperCase() + text.slice(1)
  }
  // A space between what was there and what is said, as a typist would; none before a mark.
  const gap = before === '' || /\s$/.test(before) || /^[.,!?:;]/.test(text) ? '' : ' '
  return gap + text
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
  const lang = speechLanguage(
    options,
    view?.dom.ownerDocument.documentElement.lang,
    window?.navigator.language,
  )
  const english = lang.toLowerCase().startsWith('en')
  let recognition: RecognitionLike | null = null
  let reading = false
  /**
   * The utterance being spoken. Held here because Chrome lets one nothing
   * else refers to be collected mid-sentence, and its `end` then never comes:
   * reading stopped after the first paragraph.
   */
  let speaking: SpeechSynthesisUtterance | null = null
  /** While reading moves the selection itself: its own transactions are not the writer's. */
  let moving = false
  /** Words recognised but not settled yet, shown where they will go: their block and span. */
  let pending: { path: Path; from: number; to: number } | null = null

  const changed = (): void => options.onChange?.()

  /** Put text at the caret, or in place of the words still being recognised. */
  const place = (text: string): void => {
    if (pending) {
      const block = nodeAtPath(editor.state.doc, pending.path)
      if (block?.isTextblock) {
        editor.dispatch(
          editor.state.tr.setSelection(
            new TextSelection(pos(pending.path, pending.from), pos(pending.path, pending.to)),
          ),
        )
      }
    }
    const { from } = editor.state.selection
    editor.exec(text ? insertText(text) : deleteSelection)
    pending = text ? { path: from.path, from: from.offset, to: from.offset + text.length } : null
  }

  /** What was said, settled: its marks, its breaks, its capitals. */
  const settle = (words: string): void => {
    const parts = words.split(SPOKEN_BREAK)
    // `split` with a group gives the text, then each break's word, then the text after it.
    parts.forEach((part, index) => {
      if (index % 2 === 1) {
        if (pending) place('')
        pending = null
        editor.exec(part.toLowerCase() === 'paragraph' ? splitBlock : insertInlineNode('hardBreak'))
        return
      }
      if (part.trim() === '') {
        if (pending) place('')
        pending = null
        return
      }
      if (pending) place('')
      const { selection, doc } = editor.state
      const before = textBefore(nodeAtPath(doc, selection.from.path), selection.from.offset)
      place(dictated(part, before, english))
      pending = null
    })
  }

  const stopDictation = (): void => {
    const current = recognition
    recognition = null
    pending = null
    current?.stop()
    changed()
  }

  const startDictation = (): void => {
    if (!Recognition) return
    const listener = new Recognition()
    listener.lang = lang
    listener.continuous = true
    // The words appear as they are recognised, and settle when the phrase does.
    listener.interimResults = true
    listener.onresult = (event) => {
      let interim = ''
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index]
        const words = result?.[0].transcript ?? ''
        if (!result) continue
        if (result.isFinal) settle(words)
        else interim += words
      }
      if (interim.trim() !== '') {
        const { selection, doc } = editor.state
        const at = pending ? pos(pending.path, pending.from) : selection.from
        place(dictated(interim, textBefore(nodeAtPath(doc, at.path), at.offset), false))
      }
    }
    // Recognition stops itself after a pause, and Chrome's after a minute
    // whatever; while dictation is on, it listens again.
    listener.onend = () => {
      if (recognition !== listener) return
      try {
        listener.start()
      } catch {
        // A recogniser that cannot start again is done: say so rather than
        // show dictation on while nothing listens.
        stopDictation()
        options.onError?.('Dictation stopped. Start it again from the Tools menu.')
      }
    }
    listener.onerror = (event) => {
      const message = DICTATION_ERRORS[event.error ?? '']
      if (!message || recognition !== listener) return
      // Stopped for good: listening again would only fail again, round and round.
      stopDictation()
      options.onError?.(message)
    }
    recognition = listener
    try {
      listener.start()
    } catch {
      recognition = null
      options.onError?.('Dictation could not start. Allow the microphone, then try again.')
      return
    }
    changed()
  }

  const stopReading = (): void => {
    reading = false
    speaking = null
    synthesis?.cancel()
    changed()
  }

  /** The words being said, picked out as a selection: one the reader can see at a glance. */
  const pickOut = (passage: Passage, charIndex: number, charLength: number | undefined): void => {
    const length =
      charLength && charLength > 0
        ? charLength
        : (/^\S+/.exec(passage.text.slice(charIndex))?.[0].length ?? 0)
    const from = passage.offsets[charIndex]
    const to = passage.offsets[Math.min(passage.offsets.length - 1, charIndex + length)]
    if (from === undefined || to === undefined) return
    moving = true
    try {
      editor.dispatch(
        editor.state.tr.setSelection(
          new TextSelection(pos(passage.path, from), pos(passage.path, to)),
        ),
      )
    } finally {
      moving = false
    }
    editor.view?.scrollSelectionIntoView()
  }

  const startReading = (): void => {
    if (!synthesis) return
    const passages = passagesFrom(editor)
    if (passages.length === 0) return
    reading = true
    changed()
    const voice = voiceFor(synthesis, lang)
    const speak = (index: number): void => {
      const passage = passages[index]
      if (!reading || !passage) {
        if (reading) stopReading()
        return
      }
      // A block edited away since the reading began is no place to pick words out in.
      if (!nodeAtPath(editor.state.doc, passage.path)?.isTextblock) {
        stopReading()
        return
      }
      const utterance = new SpeechSynthesisUtterance(passage.text)
      utterance.lang = voice?.lang ?? lang
      if (voice) utterance.voice = voice
      utterance.onboundary = (event) => {
        if (!reading || speaking !== utterance || event.name === 'sentence') return
        pickOut(passage, event.charIndex, (event as { charLength?: number }).charLength)
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
    if (synthesis.paused) synthesis.resume()
    speak(0)
  }

  // An edit, or the writer moving the caret, stops the reading: its places are
  // stale, and a voice taking the caret back on every word fights the writer.
  const unsubscribe = editor.onTransaction(({ transaction, before, state }) => {
    if (!reading || moving) return
    if (transaction.docChanged || !state.selection.eq(before.selection)) stopReading()
  })

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
      unsubscribe()
      if (recognition) stopDictation()
      if (reading) stopReading()
    },
  }
}
