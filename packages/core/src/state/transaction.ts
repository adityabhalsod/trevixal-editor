import type { Mark } from '../model/mark'
import type { EditorNode } from '../model/node'
import type { Position } from '../model/position'
import type { EditorState } from './editor-state'
import type { Selection } from './selection'
import type { Bias, PositionMapper, Step } from './step'

/**
 * An ordered list of steps applied to a document, plus selection, stored
 * marks and metadata. Build one via `state.tr`, then dispatch it.
 */
export class Transaction implements PositionMapper {
  readonly steps: Step[] = []
  /** The document before each step, parallel to {@link steps}. */
  readonly docs: EditorNode[] = []
  /** Creation time, used by the undo history for grouping. */
  readonly time: number = Date.now()

  private currentDoc: EditorNode
  private readonly baseSelection: Selection
  private explicitSelection: { selection: Selection; atStep: number } | null = null
  private stored: readonly Mark[] | null
  private metadata: Map<string, unknown> | null = null

  constructor(state: EditorState) {
    this.currentDoc = state.doc
    this.baseSelection = state.selection
    this.stored = state.storedMarks
  }

  get doc(): EditorNode {
    return this.currentDoc
  }

  get docChanged(): boolean {
    return this.steps.length > 0
  }

  /** Apply a step; returns false (leaving the transaction untouched) on failure. */
  maybeStep(step: Step): boolean {
    return this.tryStep(step) === null
  }

  /** Apply a step; throws on failure. */
  step(step: Step): this {
    const failed = this.tryStep(step)
    if (failed !== null) throw new RangeError(`Step failed: ${failed}`)
    return this
  }

  private tryStep(step: Step): string | null {
    const result = step.apply(this.currentDoc)
    if (result.failed !== null || result.doc === null) {
      return result.failed ?? 'unknown step failure'
    }
    this.docs.push(this.currentDoc)
    this.steps.push(step)
    this.currentDoc = result.doc
    return null
  }

  /** Map a position from before this transaction to after it. */
  mapPosition(position: Position, bias?: Bias): Position {
    return this.mapThrough(position, 0, bias)
  }

  private mapThrough(position: Position, fromStep: number, bias?: Bias): Position {
    let mapped = position
    for (let i = fromStep; i < this.steps.length; i++) {
      mapped = (this.steps[i] as Step).mapPosition(mapped, bias)
    }
    return mapped
  }

  /**
   * The selection after this transaction: the explicitly set one (remapped
   * through any later steps), or the input selection mapped through all steps.
   */
  get selection(): Selection {
    if (this.explicitSelection) {
      const { selection, atStep } = this.explicitSelection
      return selection.map(this.currentDoc, {
        mapPosition: (position, bias) => this.mapThrough(position, atStep, bias),
      })
    }
    return this.baseSelection.map(this.currentDoc, this)
  }

  setSelection(selection: Selection): this {
    this.explicitSelection = { selection, atStep: this.steps.length }
    this.stored = null
    return this
  }

  get storedMarks(): readonly Mark[] | null {
    return this.stored
  }

  setStoredMarks(marks: readonly Mark[] | null): this {
    this.stored = marks
    return this
  }

  setMeta(key: string, value: unknown): this {
    this.metadata ??= new Map()
    this.metadata.set(key, value)
    return this
  }

  getMeta(key: string): unknown {
    return this.metadata?.get(key)
  }

  /**
   * Every metadata key set on this transaction, in the order it was set.
   *
   * For the one caller that has to hand a transaction's whole provenance on:
   * a dispatch transform that replaces a transaction with a different one
   * (suggestion mode rewriting an edit, say) drops every key the original
   * carried unless it copies them, and the keys it does not know about are
   * exactly the ones it cannot afford to guess at. A replay guard silently
   * lost is an editing loop.
   */
  metaKeys(): readonly string[] {
    return this.metadata ? [...this.metadata.keys()] : []
  }
}
