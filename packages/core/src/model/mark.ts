import { type Attrs, attrsEq } from './attrs'
import type { MarkType } from './schema'

/** JSON shape of a serialized mark. */
export interface MarkJSON {
  readonly type: string
  readonly attrs?: Record<string, unknown>
}

/**
 * A piece of inline formatting (bold, link, …). Immutable; identified by its
 * type plus attributes.
 */
export class Mark {
  constructor(
    readonly type: MarkType,
    readonly attrs: Attrs,
  ) {}

  eq(other: Mark): boolean {
    return this === other || (this.type === other.type && attrsEq(this.attrs, other.attrs))
  }

  isInSet(set: readonly Mark[]): boolean {
    return set.some((mark) => mark.eq(this))
  }

  /**
   * Add this mark to a set, honoring mark-exclusion rules and keeping the set
   * ordered by schema rank. Returns the same array when nothing changes.
   */
  addToSet(set: readonly Mark[]): readonly Mark[] {
    if (this.isInSet(set)) return set
    const kept = set.filter(
      (mark) => !mark.type.excludes(this.type) && !this.type.excludes(mark.type),
    )
    const result = [...kept, this].sort((a, b) => a.type.rank - b.type.rank)
    return result
  }

  removeFromSet(set: readonly Mark[]): readonly Mark[] {
    const result = set.filter((mark) => !mark.eq(this))
    return result.length === set.length ? set : result
  }

  toJSON(): MarkJSON {
    return Object.keys(this.attrs).length > 0
      ? { type: this.type.name, attrs: { ...this.attrs } }
      : { type: this.type.name }
  }
}

export const noMarks: readonly Mark[] = Object.freeze([])

export function marksEq(a: readonly Mark[], b: readonly Mark[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  return a.every((mark, i) => mark.eq(b[i]))
}
