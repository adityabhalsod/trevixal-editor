import {
  type Command,
  type Editor,
  type EditorState,
  NodeSelection,
  type Path,
  SetNodeAttrsStep,
  escapeHTML,
  nodeAtPath,
  pathOfElement,
} from '@trevixal/core'
import { embedAtSelection, isEmbedBlock } from './commands'

// ------------------------------------------------------------------ chapters

/** One chapter of a video: where it starts, in seconds, and what it is called. */
export interface VideoChapter {
  readonly seconds: number
  readonly title: string
}

/**
 * Chapters as a video description lists them, one a line: `0:00 Intro`,
 * `1:30 Setting up`, `1:02:03 The end`. Lines that do not start with a time
 * are left out, and the chapters come back in time order.
 */
export function parseChapters(text: unknown): VideoChapter[] {
  if (typeof text !== 'string') return []
  const chapters: VideoChapter[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s*[-–—:]?\s*(.+?)\s*$/.exec(line)
    if (!match) continue
    const [, hours, minutes, seconds, title] = match
    const total = Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds)
    if (Number(seconds) >= 60 || !title) continue
    chapters.push({ seconds: total, title })
  }
  return chapters.sort((a, b) => a.seconds - b.seconds)
}

/** Seconds as a video player writes them: `1:05`, `1:02:03`. */
export function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = String(whole % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

/**
 * The chapter list under a video, as markup: each chapter a link to its
 * start in the video's own address (`video.mp4#t=90`), which is how a saved
 * page with no script still reaches it. In the editor a click seeks the
 * player instead.
 */
export function chaptersHTML(src: string, chapters: readonly VideoChapter[]): string {
  const items = chapters
    .map(
      ({ seconds, title }) =>
        `<li><a href="${escapeHTML(`${src}#t=${seconds}`)}" data-seconds="${seconds}">` +
        `<span class="trevixal-chapters__time">${formatTime(seconds)}</span> ${escapeHTML(title)}</a></li>`,
    )
    .join('')
  return `<ol class="trevixal-chapters">${items}</ol>`
}

/**
 * The video at the selection: the one selected, the one the caret sits
 * beside, or the one just above a caret at the start of the next block,
 * which is where the caret lands after a video goes in. A click on a player
 * does not reach the page in every engine, so the caret has to be enough.
 */
function selectedVideo(state: EditorState): { path: Path; attrs: Record<string, unknown> } | null {
  const found = embedAtSelection(state)
  if (found?.node.type.name === 'video') return { path: found.path, attrs: found.node.attrs }
  const { from } = state.selection
  const index = from.path[from.path.length - 1]
  if (index === undefined || index === 0 || from.offset !== 0) return null
  const above = [...from.path.slice(0, -1), index - 1]
  const node = nodeAtPath(state.doc, above)
  return node?.type.name === 'video' ? { path: above, attrs: node.attrs } : null
}

/** The selected video's chapters as the dialog should show them, or null without one. */
export function videoChaptersAt(state: EditorState): string | null {
  const video = selectedVideo(state)
  if (!video) return null
  return typeof video.attrs.chapters === 'string' ? video.attrs.chapters : ''
}

/**
 * Give the selected video its chapters, written one a line (`1:30 Setup`);
 * empty text takes them off. Declines without a video selected.
 */
export function setVideoChapters(text: string | null): Command {
  return (state) => {
    const video = selectedVideo(state)
    if (!video) return null
    const chapters = parseChapters(text ?? '')
    const value =
      chapters.length > 0
        ? chapters.map((chapter) => `${formatTime(chapter.seconds)} ${chapter.title}`).join('\n')
        : null
    if ((video.attrs.chapters ?? null) === value) return null
    return state.tr.step(new SetNodeAttrsStep(video.path, { ...video.attrs, chapters: value }))
  }
}

/**
 * Make a video's chapter links seek its player rather than leave the page.
 * Returns a disposer.
 */
export function enableChapterLinks(editor: Editor): () => void {
  const view = editor.view
  if (!view) return () => {}
  const onClick = (event: MouseEvent): void => {
    const link = (event.target as Element | null)?.closest?.('.trevixal-chapters a[data-seconds]')
    if (!(link instanceof HTMLElement) || !view.dom.contains(link)) return
    const player = link.closest('.trevixal-video-chapters')?.querySelector('video')
    if (!player) return
    event.preventDefault()
    player.currentTime = Number(link.dataset.seconds ?? 0)
    void player.play?.()?.catch?.(() => undefined)
  }
  view.dom.addEventListener('click', onClick)
  return () => view.dom.removeEventListener('click', onClick)
}

/** The rendered players a click selects: a video or audio block, with chapters or a waveform. */
const PLAYERS =
  'video.trevixal-video, audio.trevixal-audio, .trevixal-video-chapters, .trevixal-audio-block'

/**
 * Select a video or audio block with a click on it, as an image is, so the
 * commands that act on the selected block (chapters, delete) find it. The
 * click still reaches the player's own controls. Returns a disposer.
 */
export function enableEmbedSelection(editor: Editor): () => void {
  const view = editor.view
  if (!view) return () => {}
  let pending: ReturnType<typeof setTimeout> | null = null
  const onPress = (event: MouseEvent): void => {
    const player = (event.target as Element | null)?.closest?.(PLAYERS)
    if (!(player instanceof HTMLElement) || !view.dom.contains(player)) return
    // The block is the wrapper when there is one, else the player itself.
    const block =
      player.closest<HTMLElement>('.trevixal-video-chapters, .trevixal-audio-block') ?? player
    const path = pathOfElement(view.dom, view.renderer, block)
    if (!path || !isEmbedBlock(nodeAtPath(editor.state.doc, path))) return
    // After the press has done what a press does, so the selection it leaves
    // is this one rather than a caret the browser put down beside the player.
    // On the press, not the click: a player's own controls swallow the click
    // in some engines.
    if (pending !== null) clearTimeout(pending)
    pending = setTimeout(() => {
      pending = null
      const selection = editor.state.selection
      if (selection instanceof NodeSelection && selection.path.join('/') === path.join('/')) return
      if (nodeAtPath(editor.state.doc, path) === null) return
      editor.exec((state) => state.tr.setSelection(new NodeSelection(path)))
    }, 0)
  }
  view.dom.addEventListener('mousedown', onPress)
  return () => {
    view.dom.removeEventListener('mousedown', onPress)
    if (pending !== null) clearTimeout(pending)
  }
}

// ------------------------------------------------------------------ waveforms

/** How many bars a recording's waveform is drawn with. */
export const WAVEFORM_BARS = 48

/**
 * Levels sampled while recording (each 0-1), shared out into `bars` bars,
 * each the loudest level in its stretch: the shape a player's waveform
 * shows. Written 0-100, as the `waveform` attribute stores them.
 */
export function waveformPeaks(levels: readonly number[], bars = WAVEFORM_BARS): number[] {
  if (levels.length === 0) return []
  const peaks: number[] = []
  for (let bar = 0; bar < bars; bar++) {
    const start = Math.floor((bar * levels.length) / bars)
    const end = Math.max(start + 1, Math.floor(((bar + 1) * levels.length) / bars))
    let peak = 0
    for (let index = start; index < end && index < levels.length; index++) {
      peak = Math.max(peak, Math.abs(levels[index] ?? 0))
    }
    peaks.push(Math.round(Math.min(1, peak) * 100))
  }
  return peaks
}

/** A stored `waveform` attribute read back as peaks, 0-100 each; empty for anything else. */
export function parseWaveform(value: unknown): number[] {
  if (typeof value !== 'string' || value === '') return []
  const peaks = value.split(',').map((part) => Number(part))
  return peaks.every((peak) => Number.isFinite(peak) && peak >= 0 && peak <= 100) ? peaks : []
}

/** The waveform as an SVG of bars, drawn in the text colour. */
export function waveformSVG(peaks: readonly number[]): string {
  const width = peaks.length * 3
  const bars = peaks
    .map((peak, index) => {
      const height = Math.max(2, Math.round((peak / 100) * 32))
      return `<rect x="${index * 3}" y="${(32 - height) / 2}" width="2" height="${height}" rx="1"/>`
    })
    .join('')
  return `<svg class="trevixal-waveform" viewBox="0 0 ${width} 32" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>`
}
