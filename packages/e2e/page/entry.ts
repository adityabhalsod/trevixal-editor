import {
  type Command,
  type Editor,
  type Path,
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  pos,
} from '@trevixal/core'
import {
  goToNextCell,
  insertTable,
  mergeCells,
  splitCell,
  tableKeymap,
  tableNodes,
  toggleHeaderRow,
} from '@trevixal/extension-table'

declare global {
  interface Window {
    editor: Editor
    trevixal: {
      exec(name: keyof typeof commands): boolean
      insertTable(rows: number, cols: number): boolean
      selectRange(fromPath: Path, fromOffset: number, toPath: Path, toOffset: number): void
    }
  }
}

const schema = new Schema({
  nodes: { ...defaultNodes(), ...tableNodes() },
  marks: defaultMarks(),
})
const element = document.getElementById('editor')
if (!element) throw new Error('missing #editor mount point')

const editor = createEditor({ schema, element, autofocus: true, keymap: tableKeymap() })
window.editor = editor

const commands: Record<string, Command> = {
  mergeCells,
  splitCell,
  toggleHeaderRow,
  nextCell: goToNextCell(1),
  previousCell: goToNextCell(-1),
}

window.trevixal = {
  exec: (name) => editor.exec(commands[name] as Command),
  insertTable: (rows, cols) => editor.exec(insertTable({ rows, cols })),
  selectRange: (fromPath, fromOffset, toPath, toOffset) => {
    editor.dispatch(
      editor.state.tr.setSelection(
        new TextSelection(pos(fromPath, fromOffset), pos(toPath, toOffset)),
      ),
    )
  },
}
