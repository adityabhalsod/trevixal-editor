/**
 * The AutoCorrect list as the options dialog edits it: one entry per line,
 * the misspelling, an arrow, then what it becomes (`teh -> the`). `=` and the
 * arrow `→` separate them too, so a list typed by hand reads back either way.
 */

const SEPARATOR = /\s*(?:->|→|=)\s*/

/** The list as lines, in the order a reader looks for them: alphabetical. */
export function autocorrectLines(words: Readonly<Record<string, string>>): string {
  return Object.keys(words)
    .sort((a, b) => a.localeCompare(b))
    .map((typo) => `${typo} -> ${words[typo]}`)
    .join('\n')
}

/**
 * The lines back as a list. A line without a separator, or with either side
 * empty, is skipped rather than guessed at; keys are kept in lower case, as
 * the rule matches them.
 */
export function parseAutocorrectLines(text: string): Record<string, string> {
  const words: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split(SEPARATOR)
    if (parts.length !== 2) continue
    const typo = (parts[0] ?? '').trim().toLowerCase()
    const correction = (parts[1] ?? '').trim()
    if (typo && correction && /^[\p{L}'’]+$/u.test(typo)) words[typo] = correction
  }
  return words
}
