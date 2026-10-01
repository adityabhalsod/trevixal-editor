import { attrsEq } from '../model/attrs'
import { blocksInRange } from '../model/blocks'
import { Fragment } from '../model/fragment'
import { inlineLength, marksAtInlineOffset, rangesWithMark } from '../model/inline'
import type { EditorNode } from '../model/node'
import { type Path, nodeAtPath } from '../model/tree'
import {
  BUILT_IN_STYLES,
  type NamedStyle,
  type StyleKind,
  type StyleProps,
  documentStyle,
  documentStyles,
  headingLevelOfStyle,
  parseStoredStyles,
  safeStyleId,
  sanitizeStyleProps,
  storedStylesAttr,
} from '../schema/named-styles'
import type { EditorState } from '../state/editor-state'
import { TextSelection } from '../state/selection'
import { SetNodeAttrsStep } from '../state/steps/attrs-step'
import { RemoveMarkStep } from '../state/steps/mark-steps'
import { replaceNodeAt } from '../state/steps/replace-nodes'
import { type Command, setMark, unsetMark } from './commands'
import { setDocumentAttrs } from './document'

/** A textblock's paragraph style: its level's Heading for a heading, else its own, else Normal. */
export function paragraphStyleOf(node: EditorNode): string {
  if (node.type.name === 'heading') return `heading${node.attrs.level}`
  return safeStyleId(node.attrs.paragraphStyle) ?? 'normal'
}

/** The character style of the text at the caret (or the selection's start), or null. */
export function characterStyleAt(state: EditorState): string | null {
  const selection = state.selection
  if (!(selection instanceof TextSelection)) return null
  const block = nodeAtPath(state.doc, selection.from.path)
  if (!block?.isTextblock) return null
  const offset = selection.empty ? selection.from.offset : selection.from.offset + 1
  const marks =
    (selection.empty ? state.storedMarks : null) ?? marksAtInlineOffset(block.content, offset)
  const mark = marks.find((each) => each.type.name === 'charStyle')
  return mark ? safeStyleId(mark.attrs.id) : null
}

/** Whether `parent` still holds valid content with its child at `index` swapped for `node`. */
function fits(parent: EditorNode | null, index: number, node: EditorNode): boolean {
  if (!parent) return false
  const children = [...parent.content.children]
  children[index] = node
  return parent.type.validContent(Fragment.from(children))
}

/**
 * Give the selected paragraphs a paragraph style. A Heading style makes each
 * that level's heading; Normal, or any other style, a paragraph taking it.
 * Their layout (alignment, spacing, borders) comes with them, and a block
 * that is neither a paragraph nor a heading, or cannot be made one where it
 * sits, keeps what it is.
 */
export function setParagraphStyle(id: string): Command {
  return (state) => {
    const style = documentStyle(state.doc, id)
    const { paragraph, heading } = state.schema.nodes
    if (!style || style.kind !== 'paragraph' || !paragraph) return null
    const level = headingLevelOfStyle(style.id)
    const type = level ? heading : paragraph
    if (!type) return null
    const declared = type.spec.attrs ?? {}
    const tr = state.tr
    for (const block of blocksInRange(state.doc, state.selection.from, state.selection.to)) {
      const node = block.node
      if (node.type !== paragraph && node.type !== heading) continue
      const kept = Object.fromEntries(
        Object.entries(node.attrs).filter(
          ([name]) => name in declared && name !== 'level' && name !== 'paragraphStyle',
        ),
      )
      const attrs = level
        ? { ...kept, level }
        : { ...kept, paragraphStyle: style.id === 'normal' ? null : style.id }
      const replacement = type.create(attrs, node.content)
      if (node.type === type && attrsEq(node.attrs, replacement.attrs)) continue
      const parentPath = block.path.slice(0, -1)
      const index = block.path[block.path.length - 1] as number
      if (!fits(nodeAtPath(tr.doc, parentPath), index, replacement)) continue
      tr.step(replaceNodeAt(block.path, Fragment.of(replacement)))
    }
    if (!tr.docChanged) return null
    // Swapping a block for one of the same shape keeps every position, so the
    // selection stands as it was.
    return tr.setSelection(state.selection)
  }
}

/** Put the selected text in a character style, or take it out when it is already in it. */
export function toggleCharacterStyle(id: string): Command {
  return (state) => {
    const style = documentStyle(state.doc, id)
    if (!style || style.kind !== 'character' || !state.schema.marks.charStyle) return null
    if (characterStyleAt(state) === style.id) return unsetMark('charStyle')(state)
    return setMark('charStyle', { id: style.id })(state)
  }
}

export interface StyleDefinition {
  readonly id: string
  /** For a style of the writer's own; a built-in style keeps its name. */
  readonly name?: string
  /** For a new style; an existing one keeps its kind. */
  readonly kind?: StyleKind
  readonly props: StyleProps
}

/**
 * Define a style: change a built-in one, or add or change one of the writer's
 * own. Every paragraph and every run in it follows at once, in one undoable
 * step. A built-in style set back to no props is simply the built-in again.
 */
export function setStyle(definition: StyleDefinition): Command {
  return (state) => {
    const id = safeStyleId(definition.id)
    if (!id) return null
    const stored = parseStoredStyles(state.doc.attrs.styles)
    const builtIn = BUILT_IN_STYLES.find((style) => style.id === id)
    const existing = stored.find((style) => style.id === id) ?? builtIn
    const kind = existing?.kind ?? definition.kind ?? 'paragraph'
    const name = builtIn?.name ?? (definition.name?.trim().slice(0, 60) || existing?.name)
    if (!name) return null
    const next: NamedStyle = {
      id,
      name,
      kind,
      builtIn: Boolean(builtIn),
      props: sanitizeStyleProps(definition.props, kind),
    }
    const at = stored.findIndex((style) => style.id === id)
    const styles =
      at < 0 ? [...stored, next] : stored.map((style, index) => (index === at ? next : style))
    return setDocumentAttrs({ styles: storedStylesAttr(styles) })(state)
  }
}

/** An id for a new style named `name`: its words, made unique in the document. */
export function newStyleId(doc: EditorNode, name: string): string {
  const taken = new Set(documentStyles(doc).map((style) => style.id))
  const base =
    name
      .toLocaleLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'style'
  const stem = /^[a-z]/.test(base) ? base : `style-${base}`
  let id = stem
  for (let n = 2; taken.has(id); n++) id = `${stem}-${n}`
  return id
}

/**
 * Delete one of the writer's own styles. Paragraphs in it go back to Normal
 * and text in it back to plain, in the same step, as Word does.
 */
export function deleteStyle(id: string): Command {
  return (state) => {
    const stored = parseStoredStyles(state.doc.attrs.styles)
    if (!stored.some((style) => style.id === id && !style.builtIn)) return null
    const tr = state.tr
    const markType = state.schema.marks.charStyle
    const visit = (node: EditorNode, path: Path): void => {
      if (node.isTextblock) {
        if (node.attrs.paragraphStyle === id) {
          tr.step(new SetNodeAttrsStep(path, { ...node.attrs, paragraphStyle: null }))
        }
        if (markType) {
          for (const range of rangesWithMark(
            node.content,
            0,
            inlineLength(node.content),
            markType,
          )) {
            if (range.mark.attrs.id === id) {
              tr.step(new RemoveMarkStep(path, range.from, range.to, range.mark))
            }
          }
        }
        return
      }
      node.content.children.forEach((child, index) => visit(child, [...path, index]))
    }
    state.doc.content.children.forEach((child, index) => visit(child, [index]))
    const styles = storedStylesAttr(stored.filter((style) => style.id !== id))
    tr.step(new SetNodeAttrsStep([], { ...tr.doc.attrs, styles }))
    return tr
  }
}
