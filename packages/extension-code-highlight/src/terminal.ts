import type { Command } from '@trevixal/core'
import { insertCodeBlock } from './insert'
import { TERMINAL_PROMPT, findLanguage } from './languages'

/** Whether a code block's language is the terminal session. */
export function isTerminalLanguage(language: unknown): boolean {
  return typeof language === 'string' && findLanguage(language)?.name === 'console'
}

/**
 * What copying a code block puts on the clipboard: its code, or for a
 * terminal session only the commands, without their prompts, so a paste
 * into a shell runs them and not what they printed. A command ending in `\`
 * goes on into the next line, which is copied with it. A session with no
 * prompt at all is copied as it is.
 */
export function copyableCode(code: string, language: unknown): string {
  if (!isTerminalLanguage(language)) return code
  const commands: string[] = []
  let continuing = false
  for (const line of code.split('\n')) {
    if (TERMINAL_PROMPT.test(line)) {
      commands.push(line.replace(TERMINAL_PROMPT, ''))
    } else if (continuing) {
      commands.push(line)
    } else {
      continue
    }
    continuing = /\\\s*$/.test(line)
  }
  return commands.length > 0 ? commands.join('\n') : code
}

/** Put in a terminal session block, its first prompt ready for a command. */
export function insertTerminal(): Command {
  return insertCodeBlock({ language: 'console' }, '$ ')
}
