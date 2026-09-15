import type { EditorNode } from './node'

/** A path addresses a node as child indices from the document root. */
export type Path = readonly number[]

export function pathsEqual(a: Path, b: Path): boolean {
  return a.length === b.length && a.every((index, i) => index === b[i])
}

export function pathStartsWith(path: Path, prefix: Path): boolean {
  return prefix.length <= path.length && prefix.every((index, i) => index === path[i])
}

export function parentPathOf(path: Path): Path {
  if (path.length === 0) throw new RangeError('The root node has no parent')
  return path.slice(0, -1)
}

export function lastIndexOfPath(path: Path): number {
  const index = path[path.length - 1]
  if (index === undefined) throw new RangeError('The root node has no index')
  return index
}

export function nodeAtPath(doc: EditorNode, path: Path): EditorNode | null {
  let node: EditorNode = doc
  for (const index of path) {
    const child = node.content.maybeChild(index)
    if (!child) return null
    node = child
  }
  return node
}

/**
 * Return a new document with the node at `path` replaced by `fn(node)`,
 * rebuilding the ancestor spine (structural sharing everywhere else).
 */
export function updateAtPath(
  doc: EditorNode,
  path: Path,
  fn: (node: EditorNode) => EditorNode,
): EditorNode {
  if (path.length === 0) return fn(doc)
  const [index, ...rest] = path as [number, ...number[]]
  const child = doc.content.maybeChild(index)
  if (!child) throw new RangeError(`No node at path index ${index}`)
  return doc.withContent(doc.content.replaceChild(index, updateAtPath(child, rest, fn)))
}
