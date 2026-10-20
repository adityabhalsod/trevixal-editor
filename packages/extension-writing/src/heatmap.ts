// A reading heat map: each sentence tinted by how hard it is to read, from
// its length and its words' syllables, so a writer sees at a glance where a
// page gets heavy. Painted on its own decoration layer; the document is
// never touched.

import { type Editor, type EditorNode, type InlineDecoration, textblocks } from '@trevixal/core'
import { countSyllables, fleschKincaidGrade, sentenceSpans, splitWords } from './analysis'
import { blockText } from './assistant'

/** How hard one sentence reads, from easy to very hard. */
export type ReadingLevel = 'easy' | 'fair' | 'hard' | 'very-hard'

/** The school grade at which a level starts: 6 and under reads easily. */
const LEVEL_FLOORS: readonly [ReadingLevel, number][] = [
  ['very-hard', 13],
  ['hard', 10],
  ['fair', 7],
]

/** A sentence this long is at least hard, whatever its words. */
const LONG_SENTENCE_WORDS = 25

/** The level of one sentence, by its grade and its length. */
export function readingLevel(sentence: string): { level: ReadingLevel; grade: number } {
  const words = splitWords(sentence)
  const syllables = words.reduce((total, word) => total + countSyllables(word), 0)
  const grade = Math.max(0, fleschKincaidGrade(words.length, 1, syllables))
  const byGrade = LEVEL_FLOORS.find(([, floor]) => grade >= floor)?.[0] ?? 'easy'
  const level =
    words.length > LONG_SENTENCE_WORDS && (byGrade === 'easy' || byGrade === 'fair')
      ? 'hard'
      : byGrade
  return { level, grade: Math.round(grade) }
}

export interface ReadingHeatmap {
  readonly isShown: boolean
  show(): void
  hide(): void
  toggle(): void
  destroy(): void
}

/** Code and other verbatim blocks are not prose. */
function isProse(block: EditorNode): boolean {
  return block.type.spec.preserveWhitespace !== true
}

/**
 * The heat map over an editor, off until shown. While shown it repaints as
 * the text changes, each sentence carrying its level as a class and its
 * grade as `data-reading-grade`.
 */
export function createReadingHeatmap(editor: Editor, layer = 'reading-heatmap'): ReadingHeatmap {
  let shown = false
  const paint = (): void => {
    const view = editor.view
    if (!view) return
    if (!shown) {
      view.setDecorationLayer(layer, null)
      return
    }
    const decorations = new WeakMap<EditorNode, InlineDecoration[]>()
    for (const { node } of textblocks(editor.state.doc)) {
      if (!isProse(node)) continue
      const text = blockText(node)
      decorations.set(
        node,
        sentenceSpans(text).map((sentence) => {
          const { level, grade } = readingLevel(sentence.text)
          return {
            from: sentence.index,
            to: sentence.index + sentence.length,
            className: `trevixal-heat trevixal-heat--${level}`,
            attrs: { 'data-reading-grade': String(grade) },
          }
        }),
      )
    }
    view.setDecorationLayer(layer, (node) => decorations.get(node) ?? null)
  }
  const stop = editor.on('update', () => {
    if (shown) paint()
  })
  return {
    get isShown() {
      return shown
    },
    show() {
      shown = true
      paint()
    },
    hide() {
      shown = false
      paint()
    },
    toggle() {
      shown = !shown
      paint()
    },
    destroy() {
      stop()
      editor.view?.setDecorationLayer(layer, null)
    },
  }
}
