import { type Keymap, indentInPreformatted, outdentInPreformatted } from '@trevixal/core'
import { goToNextCell } from './commands'

/**
 * Table key bindings. Pass to `createEditor({ keymap: tableKeymap() })`; they
 * take priority over the base keymap.
 *
 * Each binding chains through every context Tab means something in, because
 * an override replaces the base binding wholesale: cell navigation inside a
 * table, then code-block indentation, then list indentation. Dropping a link
 * from this chain silently removes that behaviour from any host installing
 * this keymap.
 */
export function tableKeymap(): Keymap {
  return {
    Tab: (editor) =>
      editor.exec(goToNextCell(1)) ||
      editor.exec(indentInPreformatted) ||
      editor.commands.sinkListItem(),
    'Shift-Tab': (editor) =>
      editor.exec(goToNextCell(-1)) ||
      editor.exec(outdentInPreformatted) ||
      editor.commands.liftListItem(),
  }
}
