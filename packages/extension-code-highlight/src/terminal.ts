import {
  type Command,
  type Editor,
  Fragment,
  ReplaceInlineStep,
  ReplaceNodesStep,
  TextSelection,
  nodeAtPath,
  pos,
} from '@trevixal/core'
import { insertCodeBlock } from './insert'
import { TERMINAL_PROMPT, findLanguage } from './languages'

/** The prompt a new command line starts with when the line above has none. */
const DEFAULT_PROMPT = '$ '

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
  return insertCodeBlock({ language: 'console' }, DEFAULT_PROMPT)
}

/**
 * Enter in a terminal session: the next line starts with a prompt, as a shell
 * gives one. It is the prompt of the line above, or `$ ` after a line of
 * output. On a prompt with no command yet, Enter leaves the session, as it
 * leaves a list from an empty item. A command ending in `\` goes on into the
 * next line, which a shell reads as the same command, so that line gets no
 * prompt, and neither does Shift+Enter's, which is for output.
 */
export const newTerminalLine: Command = (state) => {
  const selection = state.selection
  if (!(selection instanceof TextSelection) || !selection.empty) return null
  const path = selection.from.path
  const block = nodeAtPath(state.doc, path)
  if (block?.type.name !== 'codeBlock' || !isTerminalLanguage(block.attrs.language)) return null
  const text = block.textContent
  const offset = selection.from.offset
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1
  const next = text.indexOf('\n', offset)
  const line = text.slice(lineStart, next === -1 ? text.length : next)
  if (/\\\s*$/.test(text.slice(lineStart, offset))) return null
  const prompt = TERMINAL_PROMPT.exec(line)?.[0]
  // Before or inside the prompt: a plain line, or the prompt would double up.
  if (prompt !== undefined && offset < lineStart + prompt.length) return null

  const tr = state.tr
  const paragraph = state.schema.nodes.paragraph
  if (prompt !== undefined && line === prompt && lineStart > 0 && next === -1 && paragraph) {
    tr.step(new ReplaceInlineStep(path, lineStart - 1, text.length, Fragment.empty))
    const parentPath = path.slice(0, -1)
    const index = (path[path.length - 1] as number) + 1
    tr.step(new ReplaceNodesStep(parentPath, index, index, Fragment.of(paragraph.create())))
    return tr.setSelection(new TextSelection(pos([...parentPath, index], 0)))
  }

  const inserted = `\n${prompt ?? DEFAULT_PROMPT}`
  tr.step(new ReplaceInlineStep(path, offset, offset, Fragment.of(state.schema.text(inserted))))
  return tr.setSelection(new TextSelection(pos(path, offset + inserted.length)))
}

/** Put {@link newTerminalLine} on Enter. Returns a disposer. */
export function terminalPrompts(editor: Editor): () => void {
  const view = editor.view
  if (!view) return () => undefined
  return view.addKeydownInterceptor((event) => {
    if (event.key !== 'Enter' || event.isComposing) return false
    if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false
    return editor.exec(newTerminalLine)
  })
}
