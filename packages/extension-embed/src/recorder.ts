import { WAVEFORM_BARS, formatTime, waveformPeaks } from './media'
import { openModal } from './modal'

/** A finished recording, ready to store and insert. */
export interface Recording {
  readonly file: File
  /** Its waveform as the `audio` node stores it: bar heights 0-100, comma-separated. */
  readonly waveform: string
  readonly seconds: number
}

export interface AudioRecorderOptions {
  /** The microphone; `getUserMedia({ audio: true })` by default. */
  readonly getStream?: () => Promise<MediaStream>
  /** How often the level is sampled for the meter and the waveform, in ms. */
  readonly sampleEvery?: number
}

/** How long a sample of the level is: the analyser's window. */
const FFT_SIZE = 1024

/**
 * A recording dialog: Record, Stop, then Insert. While it records, a meter
 * shows the level and a timer the length; the levels it samples become the
 * recording's waveform. Resolves with the recording, or null when cancelled.
 *
 * It asks for the microphone only when Record is pressed, and hands it back
 * as soon as the recording stops, so the browser's recording indicator is
 * on no longer than it has to be.
 */
export function openAudioRecorder(
  document: Document,
  options: AudioRecorderOptions = {},
): Promise<Recording | null> {
  const view = document.defaultView
  return new Promise((resolve) => {
    let settled = false
    const modal = openModal(document, 'Record audio', () => close(null))
    modal.dialog.classList.add('trevixal-recorder')
    const meter = document.createElement('div')
    meter.className = 'trevixal-recorder__meter'
    meter.setAttribute('aria-hidden', 'true')
    const bars = Array.from({ length: WAVEFORM_BARS }, () => {
      const bar = document.createElement('span')
      meter.appendChild(bar)
      return bar
    })
    const time = document.createElement('p')
    time.className = 'trevixal-recorder__time'
    time.setAttribute('role', 'timer')
    time.textContent = '0:00'
    const note = document.createElement('p')
    note.className = 'trevixal-dialog__hint'
    note.setAttribute('role', 'status')
    note.textContent = 'Press Record, then Stop when you are done.'
    modal.body.append(meter, time, note)
    const cancel = modal.button('Cancel')
    const record = modal.button('Record', true)
    const stop = modal.button('Stop', true)
    const insert = modal.button('Insert', true)
    stop.hidden = true
    insert.hidden = true
    record.focus()

    let stream: MediaStream | null = null
    let recorder: MediaRecorder | null = null
    let context: AudioContext | null = null
    let sampler: ReturnType<typeof setInterval> | null = null
    let started = 0
    let seconds = 0
    const levels: number[] = []
    const chunks: Blob[] = []
    let result: Recording | null = null

    const release = (): void => {
      if (sampler !== null) clearInterval(sampler)
      sampler = null
      for (const track of stream?.getTracks() ?? []) track.stop()
      stream = null
      void context?.close().catch(() => undefined)
      context = null
    }
    function close(value: Recording | null): void {
      if (settled) return
      settled = true
      release()
      if (recorder && recorder.state !== 'inactive') recorder.stop()
      modal.close()
      resolve(value)
    }
    cancel.addEventListener('click', () => close(null))
    insert.addEventListener('click', () => close(result))

    record.addEventListener('click', async () => {
      record.disabled = true
      try {
        const microphone = options.getStream
          ? await options.getStream()
          : await view?.navigator.mediaDevices?.getUserMedia({ audio: true })
        if (!microphone) throw new Error('no microphone')
        stream = microphone
      } catch (error) {
        record.disabled = false
        note.textContent = `The microphone is not available: ${
          error instanceof Error ? error.message : String(error)
        }`
        return
      }
      const Recorder = view?.MediaRecorder
      if (!Recorder) {
        record.disabled = false
        note.textContent = 'This browser cannot record audio.'
        release()
        return
      }
      recorder = new Recorder(stream)
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      })
      recorder.addEventListener('stop', () => {
        const type = recorder?.mimeType || 'audio/webm'
        const extension = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm'
        const blob = new Blob(chunks, { type })
        const file = new File([blob], `recording-${Date.now()}.${extension}`, { type })
        result = { file, waveform: waveformPeaks(levels).join(','), seconds }
        stop.hidden = true
        insert.hidden = false
        insert.focus()
        note.textContent = `Recorded ${formatTime(seconds)}. Insert it, or Cancel.`
      })
      const AudioContextType = view?.AudioContext
      const analyser = AudioContextType ? new AudioContextType().createAnalyser() : null
      if (analyser) {
        context = analyser.context as AudioContext
        analyser.fftSize = FFT_SIZE
        context.createMediaStreamSource(stream).connect(analyser)
      }
      const samples = new Float32Array(FFT_SIZE)
      started = Date.now()
      sampler = setInterval(() => {
        seconds = (Date.now() - started) / 1000
        time.textContent = formatTime(seconds)
        let level = 0
        if (analyser) {
          analyser.getFloatTimeDomainData(samples)
          let sum = 0
          for (const sample of samples) sum += sample * sample
          // A level people read: the RMS, raised so quiet speech still shows.
          level = Math.min(1, Math.sqrt(sum / samples.length) * 4)
        }
        levels.push(level)
        const shown = levels.slice(-WAVEFORM_BARS)
        bars.forEach((bar, index) => {
          const value = shown[index - (WAVEFORM_BARS - shown.length)] ?? 0
          bar.style.height = `${Math.max(6, Math.round(value * 100))}%`
        })
      }, options.sampleEvery ?? 100)
      recorder.start()
      record.hidden = true
      stop.hidden = false
      stop.focus()
      note.textContent = 'Recording…'
    })

    stop.addEventListener('click', () => {
      stop.disabled = true
      if (sampler !== null) clearInterval(sampler)
      sampler = null
      recorder?.stop()
      for (const track of stream?.getTracks() ?? []) track.stop()
    })
  })
}
