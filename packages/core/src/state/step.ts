import type { EditorNode } from '../model/node'
import type { Position } from '../model/position'

/** Mapping bias: where a position at a change boundary should land. */
export type Bias = -1 | 1

/** Maps positions from before a change to after it. */
export interface PositionMapper {
  mapPosition(position: Position, bias?: Bias): Position
}

export interface StepResult {
  readonly doc: EditorNode | null
  readonly failed: string | null
}

export function stepOk(doc: EditorNode): StepResult {
  return { doc, failed: null }
}

export function stepFail(reason: string): StepResult {
  return { doc: null, failed: reason }
}

/**
 * An atomic, invertible document change. Steps are the only way documents
 * change; every step knows how to undo itself and how to remap positions
 * through itself.
 */
export abstract class Step implements PositionMapper {
  /** Apply to a document. Never throws, returns a failure result instead. */
  abstract apply(doc: EditorNode): StepResult

  /** Produce the step that undoes this one, given the document it applied to. */
  abstract invert(docBefore: EditorNode): Step

  /** Remap a pre-step position to its post-step equivalent. */
  abstract mapPosition(position: Position, bias?: Bias): Position

  abstract toJSON(): Record<string, unknown>
}
