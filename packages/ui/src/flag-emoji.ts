/**
 * Country flags where the system has none to draw. Windows ships no flag
 * glyphs: 🇮🇳 shows as the letters "IN", in the emoji picker and in the text.
 * There, a web font of the flags alone (Twemoji's, as the MIT-licensed
 * country-flag-emoji-polyfill package serves it; the art is CC BY 4.0) is
 * declared for the flags' code points only, and the editor's font stack
 * names it first, so every other character keeps the font it had.
 */

/** The family the font stacks name first; unknown, and so skipped, until declared. */
export const FLAG_EMOJI_FAMILY = 'Twemoji Country Flags'

const FLAG_FONT_URL =
  'https://cdn.jsdelivr.net/npm/country-flag-emoji-polyfill@0.1.10/dist/TwemojiCountryFlags.woff2'
const FLAG_STYLE_ID = 'trevixal-flag-emoji'
const EMOJI_FONTS =
  '"Twemoji Mozilla","Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji",sans-serif'

/**
 * Whether `text` draws in colour. A colour glyph ignores the fill style and
 * letters take it, so one pixel of it drawn white and then black tells them
 * apart. Null where there is no canvas to ask.
 */
function drawsInColour(document: Document, text: string): boolean | null {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.textBaseline = 'top'
  context.font = `100px ${EMOJI_FONTS}`
  context.scale(0.01, 0.01)
  const pixel = (fill: string): string => {
    context.clearRect(0, 0, 100, 100)
    context.fillStyle = fill
    context.fillText(text, 0, 0)
    return context.getImageData(0, 0, 1, 1).data.join(',')
  }
  const white = pixel('#fff')
  const black = pixel('#000')
  return white === black && !black.startsWith('0,0,0,')
}

/**
 * Declare the flag font when the system draws emoji in colour but not
 * flags. Returns whether it is declared. Once a page: a second call finds it.
 *
 * Inside `@supports` on a `--tvx-` property, which every browser passes, so
 * `collectDocumentCSS` carries it into the preview and a downloaded page,
 * whose flags would otherwise be letters again.
 */
export function polyfillFlagEmoji(document: Document): boolean {
  if (document.getElementById(FLAG_STYLE_ID)) return true
  if (drawsInColour(document, '😊') !== true || drawsInColour(document, '🇨🇭') !== false) {
    return false
  }
  const style = document.createElement('style')
  style.id = FLAG_STYLE_ID
  style.textContent = [
    '@supports (--tvx-flag-emoji: 1) { @font-face {',
    `font-family: "${FLAG_EMOJI_FAMILY}";`,
    'unicode-range: U+1F1E6-1F1FF, U+1F3F4, U+E0062-E0063, U+E0065, U+E0067, U+E006C, U+E006E, U+E0073-E0074, U+E0077, U+E007F;',
    `src: url("${FLAG_FONT_URL}") format("woff2");`,
    'font-display: swap;',
    '} }',
  ].join(' ')
  document.head.appendChild(style)
  return true
}
