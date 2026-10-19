/**
 * Writes the emoji picker's data, `packages/extension-emoji/src/data.ts`,
 * from Unicode's `emoji-test.txt`:
 *
 *     curl -O https://unicode.org/Public/emoji/latest/emoji-test.txt
 *     node scripts/emoji-data.mjs emoji-test.txt
 *
 * Kept: every fully-qualified emoji up to `MAX_VERSION`, in Unicode's groups
 * and order, without the skin-tone variants or the Component group. Newer
 * emoji are left out on purpose: most systems in use cannot draw them yet,
 * and a picker full of empty boxes reads as broken.
 */
import { readFileSync, writeFileSync } from 'node:fs'

/** The newest emoji version taken. Raise it as systems catch up. */
const MAX_VERSION = 15.1
const OUTPUT = 'packages/extension-emoji/src/data.ts'
const SKIN_TONE = /\u{1F3FB}|\u{1F3FC}|\u{1F3FD}|\u{1F3FE}|\u{1F3FF}/u

const source = process.argv[2]
if (!source) {
  console.error('Usage: node scripts/emoji-data.mjs <emoji-test.txt>')
  process.exit(1)
}

const groups = []
let group = null
for (const line of readFileSync(source, 'utf8').split('\n')) {
  const heading = /^# group: (.+)$/.exec(line)
  if (heading) {
    group = heading[1] === 'Component' ? null : { name: heading[1], emoji: [] }
    if (group) groups.push(group)
    continue
  }
  const entry = /^[0-9A-F ]+;\s*fully-qualified\s*#\s*(\S+)\s+E(\d+\.\d+)\s+(.+)$/.exec(line)
  if (!group || !entry) continue
  const [, char, version, name] = entry
  if (Number(version) > MAX_VERSION || SKIN_TONE.test(char)) continue
  group.emoji.push([char, name.trim()])
}

// A shortcode is the name in lower case, words joined by `_`: `grinning_face`.
// The few names that collapse to the same code take a number.
const taken = new Map()
const shortcode = (name) => {
  const base = name
    .toLowerCase()
    .replace(/#/g, ' number sign ')
    .replace(/\*/g, ' asterisk ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  const seen = taken.get(base) ?? 0
  taken.set(base, seen + 1)
  return seen === 0 ? base : `${base}_${seen + 1}`
}

const rows = groups.map(
  ({ name, emoji }) =>
    // Single quotes, as the code around it: neither a group's name nor a
    // shortcode holds one.
    `  {\n    name: '${name}',\n    emoji: '${emoji
      .map(([char, words]) => `${char} ${shortcode(words)}`)
      .join(';')}',\n  },`,
)
const total = groups.reduce((sum, { emoji }) => sum + emoji.length, 0)

writeFileSync(
  OUTPUT,
  `/**
 * Every emoji up to version ${MAX_VERSION}, in Unicode's groups and order: ${total}
 * of them, fully qualified, without skin-tone variants. Written by
 * \`scripts/emoji-data.mjs\` from Unicode's emoji-test.txt; do not edit by hand.
 *
 * Each group is one string, \`char shortcode\` pairs joined by \`;\`, which
 * costs a fraction of an object per emoji.
 */
export const EMOJI_GROUPS: readonly { readonly name: string; readonly emoji: string }[] = [
${rows.join('\n')}
]
`,
)
console.log(`${OUTPUT}: ${total} emoji in ${groups.length} groups`)
