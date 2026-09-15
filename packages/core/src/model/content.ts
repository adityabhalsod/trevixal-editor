/**
 * Content expressions describe what children a node allows, e.g. `"block+"`,
 * `"inline*"`, `"listItem+"`, or sequences like `"heading block*"`.
 *
 * Supported grammar (see ADR-0002): whitespace-separated terms, each a node
 * name or group name with an optional `?`, `*` or `+` quantifier. Matching is
 * greedy and sequential.
 */
export interface ContentTerm {
  readonly names: ReadonlySet<string>
  readonly min: number
  readonly max: number
}

const TERM_PATTERN = /^([a-zA-Z_][\w]*)([+*?])?$/

export function parseContentExpr(
  expr: string,
  resolveName: (name: string) => readonly string[],
): readonly ContentTerm[] {
  const trimmed = expr.trim()
  if (trimmed === '') return []
  return trimmed.split(/\s+/).map((token) => {
    const match = TERM_PATTERN.exec(token)
    if (!match) throw new SyntaxError(`Invalid content expression term "${token}" in "${expr}"`)
    const [, name, quantifier] = match
    const names = resolveName(name as string)
    if (names.length === 0) {
      throw new RangeError(`Unknown node or group "${name}" in content expression "${expr}"`)
    }
    switch (quantifier) {
      case '+':
        return { names: new Set(names), min: 1, max: Number.POSITIVE_INFINITY }
      case '*':
        return { names: new Set(names), min: 0, max: Number.POSITIVE_INFINITY }
      case '?':
        return { names: new Set(names), min: 0, max: 1 }
      default:
        return { names: new Set(names), min: 1, max: 1 }
    }
  })
}

/** Greedy sequential match of child type names against the parsed terms. */
export function matchesContent(
  terms: readonly ContentTerm[],
  childNames: readonly string[],
): boolean {
  let i = 0
  for (const term of terms) {
    let count = 0
    while (i < childNames.length && count < term.max && term.names.has(childNames[i])) {
      i++
      count++
    }
    if (count < term.min) return false
  }
  return i === childNames.length
}
