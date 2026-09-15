import {
  type Editor,
  type Path,
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  pos,
} from '@trevixal/core'
import { TrackChanges, trackChangesMarks } from '@trevixal/extension-track-changes'

declare global {
  interface Window {
    trackChangesPage: {
      editor: Editor
      selectRange(fromPath: Path, fromOffset: number, toPath: Path, toOffset: number): void
      track: TrackChanges
    }
  }
}

const schema = new Schema({
  nodes: defaultNodes(),
  marks: { ...defaultMarks(), ...trackChangesMarks() },
})

function mount(id: string): HTMLElement {
  const element = document.getElementById(id)
  if (!element) throw new Error(`missing #${id}`)
  return element
}

const editor = createEditor({ schema, element: mount('editor') })
const track = new TrackChanges(editor, { author: 'me' })

// ---- page API ----------------------------------------------------------------

window.trackChangesPage = {
  editor,
  // Selections a keyboard cannot reliably make from Playwright; the spec needs
  // an exact range, not whatever a double-click happens to pick.
  selectRange: (fromPath, fromOffset, toPath, toOffset) => {
    editor.dispatch(
      editor.state.tr.setSelection(
        new TextSelection(pos(fromPath, fromOffset), pos(toPath, toOffset)),
      ),
    )
  },
  track,
}

document.getElementById('tc-enable')?.addEventListener('click', () => track.enable())
document.getElementById('tc-accept')?.addEventListener('click', () => track.acceptAll())
document.getElementById('tc-reject')?.addEventListener('click', () => track.rejectAll())
