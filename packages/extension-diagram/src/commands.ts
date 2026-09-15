import {
  type Command,
  type EditorNode,
  type EditorState,
  Fragment,
  NodeSelection,
  ReplaceNodesStep,
  TextSelection,
  inlineLength,
  nodeAtPath,
  pos,
} from '@trevixal/core'

/** Code block languages that get a live preview unless the host says otherwise. */
export const DEFAULT_DIAGRAM_LANGUAGES: readonly string[] = ['mermaid']

/**
 * The starter diagram `insertDiagram` puts in a fresh block: small enough to
 * read at a glance, complete enough to render, so a new block never opens on
 * an error message.
 */
export const DEFAULT_DIAGRAM_TEMPLATE = 'graph TD\n  A[Start] --> B[Finish]'

/**
 * The normalized (trimmed, lower-case) diagram language of a code block, or
 * null when the block is not a diagram. Normalizing here keeps `Mermaid` and
 * `mermaid ` blocks, as users type them, on the same renderer and cache key.
 */
export function diagramLanguageOf(
  node: EditorNode,
  languages: readonly string[] = DEFAULT_DIAGRAM_LANGUAGES,
): string | null {
  const language = node.attrs.language
  if (typeof language !== 'string' || !node.isTextblock) return null
  const normalized = language.trim().toLowerCase()
  if (normalized.length === 0) return null
  return languages.some((candidate) => candidate.trim().toLowerCase() === normalized)
    ? normalized
    : null
}

/** Whether a node is a code block whose language is one of the diagram languages. */
export function isDiagramBlock(
  node: EditorNode,
  languages: readonly string[] = DEFAULT_DIAGRAM_LANGUAGES,
): boolean {
  return diagramLanguageOf(node, languages) !== null
}

/** Where a new block goes: it lands at child index `from`, displacing `[from, to)`. */
interface InsertionPoint {
  readonly parentPath: readonly number[]
  readonly from: number
  readonly to: number
}

/**
 * An empty paragraph at the caret is a placeholder the user is about to fill,
 * so the diagram takes its place; any other block, an empty code block
 * included, since it may be a language the user is still choosing, is
 * content, so the diagram goes after it. A selected node is treated like a
 * non-empty block.
 */
function insertionPoint(state: EditorState): InsertionPoint | null {
  const selection = state.selection
  if (selection instanceof NodeSelection) {
    const after = selection.index + 1
    return { parentPath: selection.parentPath, from: after, to: after }
  }
  const blockPath = selection.to.path
  if (blockPath.length === 0) return null
  const parentPath = blockPath.slice(0, -1)
  const index = blockPath[blockPath.length - 1]
  const block = nodeAtPath(state.doc, blockPath)
  if (!block) return null
  const replaceable =
    block.isTextblock && block.type.name === 'paragraph' && inlineLength(block.content) === 0
  return replaceable
    ? { parentPath, from: index, to: index + 1 }
    : { parentPath, from: index + 1, to: index + 1 }
}

/**
 * Insert a diagram code block: `codeBlock` with the given `language`, and
 * put the caret at the end of its code, ready to keep typing. Without `code`
 * the block starts from {@link DEFAULT_DIAGRAM_TEMPLATE}. Fails (null) when
 * the schema has no `codeBlock`.
 */
export function insertDiagram(
  code: string = DEFAULT_DIAGRAM_TEMPLATE,
  language = 'mermaid',
): Command {
  return (state) => {
    const type = state.schema.nodes.codeBlock
    if (!type) return null
    const point = insertionPoint(state)
    if (!point) return null
    const content = code.length > 0 ? Fragment.of(state.schema.text(code)) : Fragment.empty
    const block = type.create({ language }, content)
    const tr = state.tr
    tr.step(new ReplaceNodesStep(point.parentPath, point.from, point.to, Fragment.of(block)))
    tr.setSelection(
      new TextSelection(pos([...point.parentPath, point.from], inlineLength(block.content))),
    )
    return tr
  }
}

/**
 * The command bundle `@trevixal/ui` is handed so its Insert menu can offer
 * diagrams without depending on this package (see `tableUICommands`).
 */
export interface DiagramUICommands {
  /** Insert a diagram block; the template when no code is given. */
  readonly insertDiagram: (code?: string) => Command
}

/** Build the UI command bundle for one diagram language (`mermaid` by default). */
export function diagramUICommands(language = 'mermaid'): DiagramUICommands {
  return {
    insertDiagram: (code) => insertDiagram(code, language),
  }
}
