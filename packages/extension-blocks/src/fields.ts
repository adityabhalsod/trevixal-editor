import {
  ADD_TO_HISTORY,
  type Editor,
  type EditorNode,
  type Mark,
  type Path,
  SetNodeAttrsStep,
  type Step,
  type Transaction,
  headingNumbers,
  safeElementId,
} from '@trevixal/core'
import {
  type CaptionKind,
  type CaptionListEntry,
  type IndexEntry,
  type IndexLocation,
  MISSING_REFERENCE,
  captionKind,
  crossReferenceFormat,
  drawnText,
  endnoteLabel,
  indexWords,
} from './references'

/**
 * Bringing every field's result up to date: caption numbers, cross-reference
 * text, tables of figures and the index, the job Word's F9 does, done on
 * every edit instead.
 *
 * {@link updateFieldsTransform} appends the updates to the edit that made
 * them necessary, so one undo takes back an inserted figure and the numbers
 * it moved alike, and no transaction ever leaves a stale "Figure 3" behind.
 * {@link refreshFields} does the same for a document that arrived stale (an
 * import, a file saved by an older version), outside the undo history.
 */

/** Anything a cross-reference can point at. */
export type ReferenceKind = 'heading' | CaptionKind | 'footnote' | 'endnote'

export interface ReferenceTarget {
  readonly kind: ReferenceKind
  /** The id a reference names; null for a heading nothing has pointed at yet. */
  readonly id: string | null
  /** The heading's block, the caption number's atom, or the note's reference. */
  readonly path: Path
  /** What each format reads: "Figure 2", "2", "A cat", "Figure 2: A cat". */
  readonly label: string
  readonly number: string
  readonly text: string
  readonly full: string
}

/** One marked run of words, and the section it sits in. */
interface Occurrence {
  readonly id: string
  readonly entry: string
  readonly sub: string | null
  /** Its section's number, when the document numbers its headings. */
  readonly section: string | null
}

interface Found {
  readonly path: Path
  readonly node: EditorNode
}

interface Walk {
  readonly targets: ReferenceTarget[]
  /** Each caption number with its target, and the number it should show. */
  readonly captions: (Found & {
    readonly kind: CaptionKind
    readonly number: number
    readonly target: ReferenceTarget
  })[]
  readonly references: Found[]
  readonly lists: Found[]
  readonly indexes: Found[]
  readonly occurrences: Occurrence[]
  /** Every id in the document, so a new one can be told apart from them. */
  readonly ids: Set<string>
}

/** A number without the punctuation that closes it: "2.1." reads "2.1" in running text. */
function bare(label: string): string {
  return label.replace(/[.)]+$/, '')
}

/** The label a caption reads as when its own text before the number is empty. */
const CAPTION_WORDS: Readonly<Record<CaptionKind, string>> = {
  figure: 'Figure',
  table: 'Table',
  equation: 'Equation',
}

/** The separator a caption's text follows its number with: ": ", ". ", " – ". */
const CAPTION_SEPARATOR = /^\s*[:.\-–—]\s*/

function walkDocument(doc: EditorNode): Walk {
  const walk: Walk = {
    targets: [],
    captions: [],
    references: [],
    lists: [],
    indexes: [],
    occurrences: [],
    ids: new Set(),
  }
  const numbered = new Map(headingNumbers(doc).map((entry) => [entry.index, entry.label]))
  const counts: Record<CaptionKind, number> = { figure: 0, table: 0, equation: 0 }
  let section: string | null = null

  const captionAt = (block: EditorNode, index: number, path: Path): void => {
    const node = block.child(index)
    const kind = captionKind(node.attrs.kind)
    counts[kind] += 1
    const number = counts[kind]
    const children = block.content.children
    // A cross-reference in a caption is left out of the caption's own text,
    // as one in a heading is: its text is worked out from caption text, and
    // one pointing back at its own caption would grow by a copy of itself on
    // every edit.
    const words = (nodes: readonly EditorNode[]): string =>
      drawnText(nodes.filter((child) => child.type.name !== 'crossReference'))
    const before = words(children.slice(0, index)).trim()
    const after = words(children.slice(index + 1))
    const target: ReferenceTarget = {
      kind,
      id: safeElementId(node.attrs.id),
      path,
      label: `${before || CAPTION_WORDS[kind]} ${number}`,
      number: String(number),
      text: after.replace(CAPTION_SEPARATOR, '').trim(),
      full: `${before ? `${before} ` : ''}${number}${after}`.trim(),
    }
    walk.targets.push(target)
    walk.captions.push({ path, node, kind, number, target })
  }

  const noteAt = (node: EditorNode, path: Path): void => {
    const id = typeof node.attrs.id === 'string' ? node.attrs.id : null
    if (!id) return
    const footnote = node.type.name === 'footnoteRef'
    const number = footnote ? id : endnoteLabel(id)
    const elementId = `${footnote ? 'fn' : 'en'}-${id}`
    walk.ids.add(elementId)
    walk.targets.push({
      kind: footnote ? 'footnote' : 'endnote',
      id: elementId,
      path,
      label: number,
      number,
      text: number,
      full: number,
    })
  }

  const visitTextblock = (block: EditorNode, path: Path): void => {
    // Consecutive text under one index mark is one occurrence, however many
    // text nodes other marks (a bold word inside it) split it into.
    let run: { id: string; mark: Mark; words: string[] } | null = null
    const flush = (): void => {
      if (!run) return
      const words = run.words.join('')
      // One mark over two paragraphs is one place in the index, not two.
      if (walk.occurrences.some((occurrence) => occurrence.id === run?.id)) {
        run = null
        return
      }
      walk.occurrences.push({
        id: run.id,
        entry: indexWords(run.mark.attrs.entry) ?? indexWords(words) ?? '',
        sub: indexWords(run.mark.attrs.sub),
        section,
      })
      run = null
    }
    block.content.children.forEach((child, index) => {
      const childPath = [...path, index]
      const id = safeElementId(child.attrs.id)
      if (id) walk.ids.add(id)
      const name = child.type.name
      if (name === 'captionNumber') captionAt(block, index, childPath)
      else if (name === 'crossReference') walk.references.push({ path: childPath, node: child })
      else if (name === 'footnoteRef' || name === 'endnoteRef') noteAt(child, childPath)

      const mark = child.isText
        ? child.marks.find((each) => each.type.name === 'indexTerm')
        : undefined
      const markId = typeof mark?.attrs.id === 'string' ? mark.attrs.id : null
      if (mark && markId) {
        if (run?.id === markId) run.words.push(child.textContent)
        else {
          flush()
          run = { id: markId, mark, words: [child.textContent] }
        }
      } else {
        flush()
      }
    })
    flush()
  }

  const visit = (node: EditorNode, path: Path): void => {
    const id = safeElementId(node.attrs.id)
    if (id) walk.ids.add(id)
    if (node.type.name === 'captionList') walk.lists.push({ path, node })
    else if (node.type.name === 'documentIndex') walk.indexes.push({ path, node })
    if (!node.isTextblock) {
      node.content.children.forEach((child, index) => visit(child, [...path, index]))
      return
    }
    if (node.type.name === 'heading') {
      const label = path.length === 1 ? numbered.get(path[0] as number) : undefined
      const number = label === undefined ? null : bare(label)
      const text = node.textContent.trim()
      if (number !== null) section = number
      walk.targets.push({
        kind: 'heading',
        id,
        path,
        label: number ?? text,
        number: number ?? text,
        text,
        full: number === null ? text : `${number} ${text}`,
      })
    }
    visitTextblock(node, path)
  }
  doc.content.children.forEach((child, index) => visit(child, [index]))
  return walk
}

/** Every target a cross-reference can name, in document order. */
export function referenceTargets(doc: EditorNode): ReferenceTarget[] {
  return walkDocument(doc).targets
}

/** What a cross-reference in this format reads for this target. */
export function referenceText(target: ReferenceTarget | undefined, format: unknown): string {
  if (!target) return MISSING_REFERENCE
  switch (crossReferenceFormat(format)) {
    case 'number':
      return target.number
    case 'text':
      return target.text || target.label
    case 'full':
      return target.full
    default:
      return target.label
  }
}

/** Every id the document holds, for {@link freshId}. */
export function documentIds(doc: EditorNode): Set<string> {
  return walkDocument(doc).ids
}

/** The lowest `prefix-n` no element in the document already has. */
export function freshId(prefix: string, taken: ReadonlySet<string>): string {
  let n = 1
  while (taken.has(`${prefix}-${n}`)) n++
  return `${prefix}-${n}`
}

const CAPTION_PREFIX: Readonly<Record<CaptionKind, string>> = {
  figure: 'fig',
  table: 'tab',
  equation: 'eq',
}

/** The index, from every marked occurrence: terms sorted as a reader expects, locations in order. */
interface IndexGroup {
  readonly term: string
  readonly own: Occurrence[]
  readonly subs: Map<string, Occurrence[]>
}

function indexEntries(occurrences: readonly Occurrence[]): IndexEntry[] {
  const groups = new Map<string, IndexGroup>()
  for (const occurrence of occurrences) {
    if (!occurrence.entry) continue
    // "Apple" and "apple" are one entry, filed under the spelling met first.
    const key = occurrence.entry.toLocaleLowerCase()
    const group: IndexGroup = groups.get(key) ?? {
      term: occurrence.entry,
      own: [],
      subs: new Map(),
    }
    if (occurrence.sub) {
      group.subs.set(occurrence.sub, [...(group.subs.get(occurrence.sub) ?? []), occurrence])
    } else {
      group.own.push(occurrence)
    }
    groups.set(key, group)
  }
  // A location reads its section's number where the headings are numbered,
  // and otherwise its place among the term's occurrences: 1, 2, 3.
  const locations = (list: readonly Occurrence[]): IndexLocation[] =>
    list.map((occurrence, index) => ({
      id: occurrence.id,
      label: occurrence.section ?? String(index + 1),
    }))
  const compare = (a: string, b: string): number =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  return [...groups.values()]
    .sort((a, b) => compare(a.term, b.term))
    .map((group) => ({
      term: group.term,
      locations: locations(group.own),
      subentries: [...group.subs.entries()]
        .sort(([a], [b]) => compare(a, b))
        .map(([term, list]) => ({ term, locations: locations(list) })),
    }))
}

/**
 * The steps that bring every field in `doc` up to date; none when all are.
 * Each is a SetNodeAttrsStep, which moves no position, so appending them to
 * an edit changes nothing else about it.
 */
export function fieldSteps(doc: EditorNode): Step[] {
  const walk = walkDocument(doc)
  const fields =
    walk.captions.length + walk.references.length + walk.lists.length + walk.indexes.length
  if (fields === 0) return []
  const steps: Step[] = []
  const byId = new Map<string, ReferenceTarget>()

  // A caption without an id, or with one an earlier caption already has (a
  // pasted copy), gets a fresh one: every caption can be pointed at, and no
  // two answer to one name.
  const claimed = new Set<string>()
  for (const caption of walk.captions) {
    const own = safeElementId(caption.node.attrs.id)
    const id = own && !claimed.has(own) ? own : freshId(CAPTION_PREFIX[caption.kind], walk.ids)
    walk.ids.add(id)
    claimed.add(id)
    byId.set(id, { ...caption.target, id })
    if (caption.node.attrs.number !== caption.number || caption.node.attrs.id !== id) {
      const attrs = { ...caption.node.attrs, number: caption.number, id }
      steps.push(new SetNodeAttrsStep(caption.path, attrs))
    }
  }
  for (const target of walk.targets) {
    if (target.id && !byId.has(target.id)) byId.set(target.id, target)
  }

  for (const reference of walk.references) {
    const text = referenceText(
      byId.get(String(reference.node.attrs.target)),
      reference.node.attrs.format,
    )
    if (reference.node.attrs.text !== text) {
      steps.push(new SetNodeAttrsStep(reference.path, { ...reference.node.attrs, text }))
    }
  }

  for (const list of walk.lists) {
    const kind = captionKind(list.node.attrs.kind)
    const entries: CaptionListEntry[] = []
    for (const [id, target] of byId) {
      if (target.kind === kind) entries.push({ id, text: target.full })
    }
    const json = JSON.stringify(entries)
    if (list.node.attrs.entries !== json) {
      steps.push(new SetNodeAttrsStep(list.path, { ...list.node.attrs, entries: json }))
    }
  }

  if (walk.indexes.length > 0) {
    const json = JSON.stringify(indexEntries(walk.occurrences))
    for (const index of walk.indexes) {
      if (index.node.attrs.entries !== json) {
        steps.push(new SetNodeAttrsStep(index.path, { ...index.node.attrs, entries: json }))
      }
    }
  }
  return steps
}

/**
 * A dispatch transform bringing the fields up to date inside the edit that
 * changed them. Install it last, so it sees the transaction every other
 * transform (track changes, say) has already rewritten.
 */
export function updateFieldsTransform(tr: Transaction): Transaction | null {
  if (!tr.docChanged) return null
  const steps = fieldSteps(tr.doc)
  if (steps.length === 0) return null
  for (const step of steps) tr.step(step)
  return tr
}

/**
 * Bring a document's fields up to date now, outside the undo history: a
 * document that arrived with stale results was not edited by anyone.
 */
export function refreshFields(editor: Editor): boolean {
  const steps = fieldSteps(editor.state.doc)
  if (steps.length === 0) return false
  const tr = editor.state.tr
  for (const step of steps) tr.step(step)
  editor.dispatch(tr.setMeta(ADD_TO_HISTORY, false))
  return true
}

/** Keep `editor`'s fields current from now on. Returns the uninstaller. */
export function installFieldUpdater(editor: Editor): () => void {
  const remove = editor.addDispatchTransform(updateFieldsTransform)
  refreshFields(editor)
  return remove
}
