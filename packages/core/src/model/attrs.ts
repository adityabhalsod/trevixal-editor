/** Attribute bag attached to nodes and marks. Values must be JSON-serializable. */
export type Attrs = Readonly<Record<string, unknown>>

export const emptyAttrs: Attrs = Object.freeze({})

/** Shallow structural equality for attribute bags. */
export function attrsEq(a: Attrs, b: Attrs): boolean {
  if (a === b) return true
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((key) => a[key] === b[key])
}

/** Fill missing attributes from the spec's declared defaults. Throws on missing required attrs. */
export function computeAttrs(
  specAttrs: Readonly<Record<string, { default?: unknown }>> | undefined,
  given: Attrs | undefined,
  owner: string,
): Attrs {
  if (!specAttrs) return emptyAttrs
  const result: Record<string, unknown> = {}
  for (const [name, spec] of Object.entries(specAttrs)) {
    if (given && name in given) {
      result[name] = given[name]
    } else if ('default' in spec) {
      result[name] = spec.default
    } else {
      throw new RangeError(`Missing required attribute "${name}" on ${owner}`)
    }
  }
  return Object.freeze(result)
}
