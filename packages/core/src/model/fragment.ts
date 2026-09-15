import type { EditorNode } from './node'

/** Immutable ordered list of child nodes. */
export class Fragment {
  private constructor(readonly children: readonly EditorNode[]) {}

  static readonly empty: Fragment = new Fragment(Object.freeze([]))

  static from(nodes: readonly EditorNode[]): Fragment {
    return nodes.length === 0 ? Fragment.empty : new Fragment(Object.freeze([...nodes]))
  }

  static of(...nodes: EditorNode[]): Fragment {
    return Fragment.from(nodes)
  }

  get childCount(): number {
    return this.children.length
  }

  child(index: number): EditorNode {
    const node = this.children[index]
    if (!node) throw new RangeError(`Fragment child index ${index} out of range`)
    return node
  }

  maybeChild(index: number): EditorNode | null {
    return this.children[index] ?? null
  }

  replaceChild(index: number, node: EditorNode): Fragment {
    const next = [...this.children]
    next[index] = node
    return Fragment.from(next)
  }

  /** Replace children in [from, to) with the given fragment's children. */
  replaceRange(from: number, to: number, insert: Fragment): Fragment {
    return Fragment.from([
      ...this.children.slice(0, from),
      ...insert.children,
      ...this.children.slice(to),
    ])
  }

  slice(from: number, to: number = this.childCount): Fragment {
    return Fragment.from(this.children.slice(from, to))
  }

  append(other: Fragment): Fragment {
    if (other.childCount === 0) return this
    if (this.childCount === 0) return other
    return Fragment.from([...this.children, ...other.children])
  }

  eq(other: Fragment): boolean {
    if (this === other) return true
    if (this.childCount !== other.childCount) return false
    return this.children.every((child, i) => child.eq(other.children[i]))
  }

  toJSON(): unknown[] {
    return this.children.map((child) => child.toJSON())
  }
}
