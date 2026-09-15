import type { EditorNode } from '../model/node'
import type { EditorState } from '../state/editor-state'
import type { Selection } from '../state/selection'
import type { Step } from '../state/step'
import { SetNodeAttrsStep } from '../state/steps/attrs-step'
import { AddMarkStep, RemoveMarkStep } from '../state/steps/mark-steps'
import { ReplaceInlineStep } from '../state/steps/replace-inline'
import { ReplaceNodesStep } from '../state/steps/replace-nodes'
import { JoinNodesStep, SplitNodeStep } from '../state/steps/split-join'
import { LiftNodesStep, WrapNodesStep } from '../state/steps/wrap-lift'
import type { Transaction } from '../state/transaction'

interface HistoryGroup {
  /** Steps that undo the group, in application order. */
  steps: Step[]
  selectionBefore: Selection
  /** Time of the last transaction folded in; drives typing-group merges. */
  timestamp: number
  /** When the group happened, for display, kept across undo/redo moves. */
  at: number
  /** What the group did, for a history panel. */
  label: string
  /** How many transactions were folded into the group. */
  size: number
}

/** One undo or redo group, as a history panel lists it. */
export interface HistoryEntry {
  /** "Typing", "Text formatting", … or a label set through {@link HISTORY_LABEL}. */
  readonly label: string
  /** When the group happened (ms since the epoch, from the transaction). */
  readonly timestamp: number
  /** How many transactions were folded into the group. */
  readonly size: number
}

export interface HistoryOptions {
  /** Transactions closer together than this (ms) merge into one undo group. */
  readonly groupDelay?: number
  /** Maximum number of undo groups kept. */
  readonly depth?: number
}

/** Transaction meta key: set to `false` to keep a transaction out of history. */
export const ADD_TO_HISTORY = 'addToHistory'
/** Transaction meta key: set to `true` to force a new undo group. */
export const NEW_HISTORY_GROUP = 'newHistoryGroup'
/**
 * Transaction meta key: a human-readable label for the undo group ("Insert
 * table"). Without it the label is inferred from the kinds of step applied.
 */
export const HISTORY_LABEL = 'historyLabel'

/**
 * Undo manager built on step inversion. Groups adjacent-in-time transactions
 * and restores the selection from before each group.
 */
export class History {
  private undoStack: HistoryGroup[] = []
  private redoStack: HistoryGroup[] = []
  private readonly groupDelay: number
  private readonly depth: number

  constructor(options: HistoryOptions = {}) {
    this.groupDelay = options.groupDelay ?? 500
    this.depth = options.depth ?? 100
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  /** Undo groups, oldest first: the last entry is what {@link undo} reverts next. */
  get undoEntries(): readonly HistoryEntry[] {
    return this.undoStack.map(entryOf)
  }

  /** Redo groups; the last entry is what {@link redo} reapplies next. */
  get redoEntries(): readonly HistoryEntry[] {
    return this.redoStack.map(entryOf)
  }

  /** Record a dispatched document-changing transaction. */
  record(tr: Transaction, selectionBefore: Selection): void {
    if (!tr.docChanged || tr.getMeta(ADD_TO_HISTORY) === false) return
    const inverted = invertSteps(tr.steps, tr.docs)
    const label = labelFor(tr)
    const last = this.undoStack[this.undoStack.length - 1]
    if (
      last &&
      tr.time - last.timestamp < this.groupDelay &&
      tr.getMeta(NEW_HISTORY_GROUP) !== true
    ) {
      last.steps = [...inverted, ...last.steps]
      last.timestamp = tr.time
      last.at = tr.time
      last.size += 1
      // A burst mixing kinds of change is best described as plain editing.
      if (last.label !== label) last.label = 'Editing'
    } else {
      this.undoStack.push({
        steps: inverted,
        selectionBefore,
        timestamp: tr.time,
        at: tr.time,
        label,
        size: 1,
      })
      if (this.undoStack.length > this.depth) this.undoStack.shift()
    }
    this.redoStack = []
  }

  undo(state: EditorState): Transaction | null {
    return this.move(state, this.undoStack, this.redoStack)
  }

  redo(state: EditorState): Transaction | null {
    return this.move(state, this.redoStack, this.undoStack)
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }

  private move(state: EditorState, from: HistoryGroup[], to: HistoryGroup[]): Transaction | null {
    const group = from.pop()
    if (!group) return null
    // Moving off a group closes the one now on top: the next edit must start
    // its own group, or a single undo would revert both that edit and work
    // the user had already stepped back over.
    const exposed = from[from.length - 1]
    if (exposed) exposed.timestamp = 0
    const tr = state.tr
    for (const step of group.steps) tr.step(step)
    tr.setSelection(group.selectionBefore)
    tr.setMeta(ADD_TO_HISTORY, false)
    to.push({
      steps: invertSteps(tr.steps, tr.docs),
      selectionBefore: state.selection,
      timestamp: 0, // never merged with typing groups
      at: group.at,
      label: group.label,
      size: group.size,
    })
    return tr
  }
}

function entryOf(group: HistoryGroup): HistoryEntry {
  return { label: group.label, timestamp: group.at, size: group.size }
}

function invertSteps(steps: readonly Step[], docs: readonly EditorNode[]): Step[] {
  return steps.map((step, i) => step.invert(docs[i] as EditorNode)).reverse()
}

/** Describe a transaction for the history panel, from its meta or its steps. */
function labelFor(tr: Transaction): string {
  const custom = tr.getMeta(HISTORY_LABEL)
  if (typeof custom === 'string' && custom.length > 0) return custom
  const kinds = new Set(tr.steps.map(kindOf))
  if (kinds.has('structure')) return 'Structure change'
  if (kinds.has('split')) return 'Paragraph change'
  if (kinds.has('wrap')) return 'Block change'
  if (kinds.has('attrs')) return 'Block formatting'
  if (kinds.has('mark')) return 'Text formatting'
  if (kinds.has('text')) return 'Typing'
  return 'Edit'
}

function kindOf(step: Step): string {
  if (step instanceof ReplaceInlineStep) return 'text'
  if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) return 'mark'
  if (step instanceof SetNodeAttrsStep) return 'attrs'
  if (step instanceof SplitNodeStep || step instanceof JoinNodesStep) return 'split'
  if (step instanceof WrapNodesStep || step instanceof LiftNodesStep) return 'wrap'
  if (step instanceof ReplaceNodesStep) return 'structure'
  return 'other'
}
