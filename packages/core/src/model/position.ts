import { inlineLength } from './inline'
import type { EditorNode } from './node'
import { type Path, nodeAtPath } from './tree'

/**
 * A position in the document: `path` addresses the containing node, `offset`
 * is a character offset within a textblock's inline content, or a child index
 * within an element node.
 */
export interface Position {
  readonly path: Path
  readonly offset: number
}

export function pos(path: Path, offset: number): Position {
  return { path, offset }
}

/**
 * Document-order comparison. Positions compare by their full trail
 * (`[...path, offset]`) lexicographically; a shorter prefix sorts first.
 */
export function comparePositions(a: Position, b: Position): -1 | 0 | 1 {
  const aTrail = [...a.path, a.offset]
  const bTrail = [...b.path, b.offset]
  const length = Math.min(aTrail.length, bTrail.length)
  for (let i = 0; i < length; i++) {
    const av = aTrail[i] as number
    const bv = bTrail[i] as number
    if (av !== bv) return av < bv ? -1 : 1
  }
  if (aTrail.length === bTrail.length) return 0
  return aTrail.length < bTrail.length ? -1 : 1
}

export function positionsEqual(a: Position, b: Position): boolean {
  return a.offset === b.offset && a.path.length === b.path.length && comparePositions(a, b) === 0
}

export function minPosition(a: Position, b: Position): Position {
  return comparePositions(a, b) <= 0 ? a : b
}

export function maxPosition(a: Position, b: Position): Position {
  return comparePositions(a, b) >= 0 ? a : b
}

export interface ResolvedPosition {
  /** The node the position lives in. */
  readonly node: EditorNode
  readonly parent: EditorNode | null
  /** This node's index in its parent. */
  readonly index: number | null
}

/** Resolve a position's containing node. Returns null when the path is invalid. */
export function resolvePosition(doc: EditorNode, position: Position): ResolvedPosition | null {
  const node = nodeAtPath(doc, position.path)
  if (!node) return null
  if (position.path.length === 0) return { node, parent: null, index: null }
  const parent = nodeAtPath(doc, position.path.slice(0, -1))
  const index = position.path[position.path.length - 1] as number
  return parent ? { node, parent, index } : null
}

/** Clamp a position into the valid range for the given document. */
export function clampPosition(doc: EditorNode, position: Position): Position {
  const path: number[] = []
  let node: EditorNode = doc
  for (const rawIndex of position.path) {
    if (node.childCount === 0) break
    const index = Math.max(0, Math.min(rawIndex, node.childCount - 1))
    path.push(index)
    node = node.child(index)
  }
  const maxOffset = node.isTextblock ? inlineLength(node.content) : node.childCount
  const offset = Math.max(0, Math.min(position.offset, maxOffset))
  return { path, offset }
}
