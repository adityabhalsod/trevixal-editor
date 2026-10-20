import {
  ADD_TO_HISTORY,
  type Editor,
  type EditorNode,
  type Fragment,
  type Path,
  ReplaceInlineStep,
  ReplaceNodesStep,
  inlineLength,
  nodeAtPath,
} from '@trevixal/core'

/**
 * An audit log: who changed the document, when, and by how much. Edits
 * close together by the same person are one entry, as a reader of the log
 * would group them, and the log goes out as CSV.
 */

export interface AuditEntry {
  readonly author: string
  /** When the first and the last edit of the entry were made. */
  readonly start: number
  readonly end: number
  /** Characters typed or pasted in. */
  readonly inserted: number
  /** Characters taken out. */
  readonly deleted: number
  /** Formatting, or blocks rearranged, without text coming or going. */
  readonly formatted: boolean
  /** The start of the text last edited, to say where. */
  readonly where: string
}

export interface AuditLogOptions {
  /** Who is editing: asked at each edit, so a change of name takes effect. */
  readonly author: () => string
  /** The entries so far, when the log is carried over from before. */
  readonly entries?: readonly AuditEntry[]
  /** Told whenever the entries change, to keep them. */
  readonly onChange?: (entries: readonly AuditEntry[]) => void
  /** The clock; `Date.now` by default. */
  readonly now?: () => number
}

export interface AuditLog {
  entries(): readonly AuditEntry[]
  /** The log as CSV, a row an entry, times in ISO 8601. */
  toCSV(): string
  clear(): void
  destroy(): void
}

/** Edits this close together by the same person are one entry. */
const COALESCE_MS = 60_000
/** How many entries are kept; the oldest go first. */
const MAX_ENTRIES = 1000
/** How much of the edited text says where. */
const WHERE_LENGTH = 60

/** The characters of text in a run of nodes. */
function textLength(fragment: Fragment | readonly EditorNode[]): number {
  const nodes = 'children' in fragment ? fragment.children : fragment
  return nodes.reduce((total, node) => total + node.textContent.length, 0)
}

/** How much a transaction's steps put in and took out, from the document before them. */
function measure(steps: readonly unknown[], before: EditorNode) {
  let inserted = 0
  let deleted = 0
  let formatted = false
  let path: Path | null = null
  for (const step of steps) {
    if (step instanceof ReplaceInlineStep) {
      deleted += step.to - step.from
      inserted += inlineLength(step.insert)
      path = step.blockPath
    } else if (step instanceof ReplaceNodesStep) {
      const parent = nodeAtPath(before, step.parentPath)
      deleted += parent ? textLength(parent.content.children.slice(step.from, step.to)) : 0
      inserted += textLength(step.insert)
      path = [...step.parentPath, step.from]
    } else {
      // Marks, attributes, splits, joins, wraps and moves: formatting, and
      // blocks rearranged, with no text coming or going.
      formatted = true
    }
  }
  return { inserted, deleted, formatted, path }
}

/** A CSV field, quoted when it has to be. */
const field = (value: string): string =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value

/** Keep an audit log of the edits made in `editor`. Returns its handle. */
export function createAuditLog(editor: Editor, options: AuditLogOptions): AuditLog {
  const now = options.now ?? Date.now
  let entries: AuditEntry[] = [...(options.entries ?? [])]
  const changed = (): void => options.onChange?.(entries)

  const stop = editor.onTransaction(({ transaction, before, state }) => {
    // Loading another document, or anything else kept out of the history, is
    // not an edit anyone made.
    if (!transaction.docChanged || transaction.getMeta(ADD_TO_HISTORY) === false) return
    const change = measure(transaction.steps, before.doc)
    if (change.inserted === 0 && change.deleted === 0 && !change.formatted) return
    const author = options.author()
    const time = now()
    const block = change.path ? nodeAtPath(state.doc, change.path) : null
    const where = (block?.textContent ?? '').slice(0, WHERE_LENGTH)
    const last = entries.at(-1)
    if (last && last.author === author && time - last.end <= COALESCE_MS) {
      entries[entries.length - 1] = {
        ...last,
        end: time,
        inserted: last.inserted + change.inserted,
        deleted: last.deleted + change.deleted,
        formatted: last.formatted || change.formatted,
        where: where || last.where,
      }
    } else {
      entries.push({ author, start: time, end: time, ...change, where })
      if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES)
    }
    changed()
  })

  return {
    entries: () => entries,
    toCSV() {
      const rows = entries.map((entry) =>
        [
          new Date(entry.start).toISOString(),
          new Date(entry.end).toISOString(),
          entry.author,
          String(entry.inserted),
          String(entry.deleted),
          entry.formatted ? 'yes' : 'no',
          entry.where,
        ]
          .map(field)
          .join(','),
      )
      return ['Started,Ended,Author,Inserted,Deleted,Formatting,Where', ...rows].join('\r\n')
    },
    clear() {
      entries = []
      changed()
    },
    destroy: stop,
  }
}
