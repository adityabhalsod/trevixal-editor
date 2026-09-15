import { safeColor } from '@trevixal/core'

/** An opaque sRGB colour with 0-255 channels. */
export interface RGB {
  readonly r: number
  readonly g: number
  readonly b: number
}

/**
 * The CSS named colours, packed as `name:hex` pairs and expanded on first
 * use. Both writers need them because Word and RTF only understand numeric
 * colours, while editor marks routinely carry `red` or `steelblue`.
 */
const NAMED_COLORS =
  'aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc ' +
  'bisque:ffe4c4 black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a ' +
  'burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 chocolate:d2691e coral:ff7f50 ' +
  'cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff darkblue:00008b ' +
  'darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 ' +
  'darkkhaki:bdb76b darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc ' +
  'darkred:8b0000 darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f ' +
  'darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff ' +
  'dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0 ' +
  'forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700 ' +
  'goldenrod:daa520 gray:808080 green:008000 greenyellow:adff2f grey:808080 honeydew:f0fff0 ' +
  'hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa ' +
  'lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 ' +
  'lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 ' +
  'lightgrey:d3d3d3 lightpink:ffb6c1 lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa ' +
  'lightslategray:778899 lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0 ' +
  'lime:00ff00 limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:800000 ' +
  'mediumaquamarine:66cdaa mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db ' +
  'mediumseagreen:3cb371 mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc ' +
  'mediumvioletred:c71585 midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 ' +
  'navajowhite:ffdead navy:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 ' +
  'orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee ' +
  'palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f pink:ffc0cb plum:dda0dd ' +
  'powderblue:b0e0e6 purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f ' +
  'royalblue:4169e1 saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 ' +
  'seashell:fff5ee sienna:a0522d silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 ' +
  'slategrey:708090 snow:fffafa springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080 ' +
  'thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:ffffff ' +
  'whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32'

let namedColors: Map<string, RGB> | null = null

function namedColor(name: string): RGB | null {
  if (!namedColors) {
    namedColors = new Map()
    for (const pair of NAMED_COLORS.split(' ')) {
      const [key, hex] = pair.split(':')
      if (key && hex) namedColors.set(key, hexToRGB(hex) as RGB)
    }
  }
  return namedColors.get(name.toLowerCase()) ?? null
}

function hexToRGB(hex: string): RGB | null {
  let digits = hex
  if (digits.length === 3 || digits.length === 4) {
    digits = [...digits].map((char) => char + char).join('')
  }
  if (digits.length !== 6 && digits.length !== 8) return null
  const value = Number.parseInt(digits.slice(0, 6), 16)
  if (Number.isNaN(value)) return null
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff }
}

function channel(raw: string): number {
  const trimmed = raw.trim()
  const number = Number.parseFloat(trimmed)
  if (Number.isNaN(number)) return 0
  const scaled = trimmed.endsWith('%') ? (number / 100) * 255 : number
  return Math.min(255, Math.max(0, Math.round(scaled)))
}

function hslToRGB(h: number, s: number, l: number): RGB {
  const hue = (((h % 360) + 360) % 360) / 360
  const sat = Math.min(1, Math.max(0, s))
  const light = Math.min(1, Math.max(0, l))
  if (sat === 0) {
    const grey = Math.round(light * 255)
    return { r: grey, g: grey, b: grey }
  }
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat
  const p = 2 * light - q
  const component = (t: number): number => {
    let x = t
    if (x < 0) x += 1
    if (x > 1) x -= 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  return {
    r: Math.round(component(hue + 1 / 3) * 255),
    g: Math.round(component(hue) * 255),
    b: Math.round(component(hue - 1 / 3) * 255),
  }
}

/**
 * Parse a CSS colour (hex, `rgb()`, `hsl()`, or a named colour) into RGB.
 * Returns null for anything unparseable, including `transparent`, so the
 * caller can simply omit the attribute rather than emit garbage into Word.
 */
export function parseColor(value: unknown): RGB | null {
  const css = safeColor(value)
  if (!css) return null
  if (css.startsWith('#')) return hexToRGB(css.slice(1))
  const functional = /^(rgba?|hsla?)\(\s*([^)]*)\)$/i.exec(css)
  if (functional) {
    const kind = (functional[1] ?? '').toLowerCase()
    const parts = (functional[2] ?? '')
      .split('/')[0]
      ?.split(/[\s,]+/)
      .filter((part) => part.length > 0)
    if (!parts || parts.length < 3) return null
    if (kind.startsWith('rgb')) {
      return {
        r: channel(parts[0] ?? '0'),
        g: channel(parts[1] ?? '0'),
        b: channel(parts[2] ?? '0'),
      }
    }
    const h = Number.parseFloat(parts[0] ?? '0')
    const s = Number.parseFloat(parts[1] ?? '0') / 100
    const l = Number.parseFloat(parts[2] ?? '0') / 100
    if ([h, s, l].some((n) => Number.isNaN(n))) return null
    return hslToRGB(h, s, l)
  }
  if (css.toLowerCase() === 'transparent') return null
  return namedColor(css)
}

/** `RRGGBB` (uppercase, no hash). The form OOXML attributes expect. */
export function toHex(color: RGB): string {
  return [color.r, color.g, color.b]
    .map((component) => component.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

/** `#rrggbb`: the form the editor's colour marks store. */
export function toCSSHex(color: RGB): string {
  return `#${toHex(color).toLowerCase()}`
}

/** Word's fixed palette of `w:highlight` values. */
const HIGHLIGHTS: readonly (readonly [string, RGB])[] = [
  ['black', { r: 0, g: 0, b: 0 }],
  ['blue', { r: 0, g: 0, b: 255 }],
  ['cyan', { r: 0, g: 255, b: 255 }],
  ['green', { r: 0, g: 255, b: 0 }],
  ['magenta', { r: 255, g: 0, b: 255 }],
  ['red', { r: 255, g: 0, b: 0 }],
  ['yellow', { r: 255, g: 255, b: 0 }],
  ['white', { r: 255, g: 255, b: 255 }],
  ['darkBlue', { r: 0, g: 0, b: 128 }],
  ['darkCyan', { r: 0, g: 128, b: 128 }],
  ['darkGreen', { r: 0, g: 128, b: 0 }],
  ['darkMagenta', { r: 128, g: 0, b: 128 }],
  ['darkRed', { r: 128, g: 0, b: 0 }],
  ['darkYellow', { r: 128, g: 128, b: 0 }],
  ['darkGray', { r: 128, g: 128, b: 128 }],
  ['lightGray', { r: 192, g: 192, b: 192 }],
]

/**
 * The closest of Word's sixteen highlight names, since `w:highlight` cannot
 * carry an arbitrary colour the way the editor's marks can.
 */
export function nearestHighlight(color: RGB): string {
  let best = 'yellow'
  let bestDistance = Number.POSITIVE_INFINITY
  for (const [name, rgb] of HIGHLIGHTS) {
    const distance = (rgb.r - color.r) ** 2 + (rgb.g - color.g) ** 2 + (rgb.b - color.b) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = name
    }
  }
  return best
}

/** The RGB value of a `w:highlight` name, for import; null when unknown. */
export function highlightColor(name: string): RGB | null {
  const lower = name.toLowerCase()
  for (const [candidate, rgb] of HIGHLIGHTS) {
    if (candidate.toLowerCase() === lower) return rgb
  }
  return null
}
