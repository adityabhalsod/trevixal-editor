import type { Command } from '@trevixal/core'
import { insertMath, insertMathBlock, setMathLatex, setMathNumbered } from './commands'
import { type MathRenderer, defaultMathRenderer } from './mathml'

/**
 * The command bundle `@trevixal/ui` is handed so its Insert menu and equation
 * dialog can drive math without importing this package (see
 * `tableUICommands`): `createEditorUI(editor, { mathCommands: mathUICommands() })`.
 */
export interface MathUICommands {
  /** Inline formula at the caret; a selected run of text becomes the source. */
  readonly insertMath: (latex: string) => Command
  /** Display formula as its own block, replacing an empty paragraph; numbered when asked. */
  readonly insertMathBlock: (latex: string, numbered?: boolean) => Command
  /** Apply edited source to the formula at the selection. */
  readonly setMathLatex: (latex: string) => Command
  /** Number the display formula at the selection, or stop. */
  readonly setMathNumbered: (numbered: boolean) => Command
  /** Draw LaTeX as the document does, for the equation dialog's preview. */
  readonly render: MathRenderer
}

/** Build the UI command bundle. */
export function mathUICommands(): MathUICommands {
  return {
    insertMath: (latex) => insertMath(latex),
    insertMathBlock: (latex, numbered) => insertMathBlock(latex, { numbered }),
    setMathLatex: (latex) => setMathLatex(latex),
    setMathNumbered: (numbered) => setMathNumbered(numbered),
    render: defaultMathRenderer,
  }
}
