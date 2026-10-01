import {
  ADD_TO_HISTORY,
  type Command,
  type Editor,
  type EditorNode,
  LiftNodesStep,
  type NodeSpec,
  type Path,
  nodeAtPath,
  wrapIn,
} from '@trevixal/core'

/**
 * Locked sections: blocks in an otherwise editable document that no edit can
 * change until they are unlocked. The section is not editable on the page,
 * and a guard refuses any transaction that would alter one, whatever it came
 * from: a selection dragged across it, a command, a paste.
 */

export const LOCKED_SECTION = 'lockedSection'

/** Transaction meta that lets a change to a locked section through: unlocking it. */
export const SECTION_LOCK_META = 'sectionLock$'

/** The `lockedSection` node, to merge into a schema's nodes. */
export function lockedSectionNodes(): Record<string, NodeSpec> {
  return {
    [LOCKED_SECTION]: {
      content: 'block+',
      group: 'block',
      toHTML: () => ({
        tag: 'section',
        attrs: {
          class: 'trevixal-locked-section',
          'data-locked-section': '',
          contenteditable: 'false',
        },
      }),
      parseHTML: [{ tag: 'section', attribute: 'data-locked-section' }],
    },
  }
}

/** Every locked section in the document, outermost first, in document order. */
export function lockedSections(doc: EditorNode): readonly { path: Path; node: EditorNode }[] {
  const found: { path: Path; node: EditorNode }[] = []
  const walk = (node: EditorNode, path: Path): void => {
    node.content.children.forEach((child, index) => {
      if (child.isTextblock) return
      if (child.type.name === LOCKED_SECTION) found.push({ path: [...path, index], node: child })
      else walk(child, [...path, index])
    })
  }
  walk(doc, [])
  return found
}

/** Lock the selected blocks, as one section. */
export const lockSection: Command = (state) =>
  state.schema.nodes[LOCKED_SECTION] ? wrapIn(LOCKED_SECTION)(state) : null

/** Unlock the section at `path`: its blocks stay, editable again. */
export function unlockSection(path: Path): Command {
  return (state) => {
    const section = nodeAtPath(state.doc, path)
    if (section?.type.name !== LOCKED_SECTION) return null
    const tr = state.tr
    tr.step(new LiftNodesStep(path, section.childCount))
    tr.setMeta(SECTION_LOCK_META, true)
    return tr
  }
}

export interface SectionLockOptions {
  /** Called when an edit is refused, to say why nothing happened. */
  readonly onBlocked?: () => void
}

/**
 * Refuse edits that change a locked section. A section may move, since the
 * blocks around it are editable, but it must come out of every transaction
 * exactly as it went in. Loading another document is not an edit of this
 * one, so a transaction kept out of the history passes, as it does for the
 * suggestion tracker. Register this before transforms that keep derived
 * content current (fields, formulas), so it judges the edit alone and their
 * updates inside a section still land. Returns a disposer.
 */
export function enableSectionLocks(editor: Editor, options: SectionLockOptions = {}): () => void {
  return editor.addDispatchTransform((tr, state) => {
    if (!tr.docChanged || tr.getMeta(SECTION_LOCK_META) || tr.getMeta(ADD_TO_HISTORY) === false) {
      return null
    }
    const before = lockedSections(state.doc)
    if (before.length === 0) return null
    const after = lockedSections(tr.doc).map((section) => section.node)
    for (const { node } of before) {
      const index = after.findIndex((candidate) => candidate.eq(node))
      if (index < 0) {
        options.onBlocked?.()
        return state.tr
      }
      after.splice(index, 1)
    }
    return null
  })
}
