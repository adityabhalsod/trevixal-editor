import type { Command } from '@trevixal/core'
import { insertMath, insertMathBlock, setMathLatex } from './commands'

/**
 * The command bundle `@trevixal/ui` is handed so its Insert menu and equation
 * dialog can drive math without importing this package (see
 * `tableUICommands`): `createEditorUI(editor, { mathCommands: mathUICommands() })`.
 */
export interface MathUICommands {
  /** Inline formula at the caret; a selected run of text becomes the source. */
  readonly insertMath: (latex: string) => Command
  /** Display formula as its own block, replacing an empty paragraph. */
  readonly insertMathBlock: (latex: string) => Command
  /** Apply edited source to the formula at the selection. */
  readonly setMathLatex: (latex: string) => Command
}

/** Build the UI command bundle. */
export function mathUICommands(): MathUICommands {
  return {
    insertMath: (latex) => insertMath(latex),
    insertMathBlock: (latex) => insertMathBlock(latex),
    setMathLatex: (latex) => setMathLatex(latex),
  }
}
