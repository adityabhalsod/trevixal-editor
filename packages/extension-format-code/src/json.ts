import { type FormatResult, normalizeIndent } from './types'

/**
 * Nesting depth beyond which we decline rather than recurse. `JSON.parse` and
 * `JSON.stringify` are both recursive in every engine, so a pathologically
 * nested document ("[[[[[…]]]]]") overflows the stack. An uncatchable crash
 * in some engines, and a `RangeError` at best. Checking the depth first with
 * a flat scan turns that into an ordinary error message.
 */
const MAX_DEPTH = 500

/**
 * Pretty-print JSON by parsing it for real, never `eval`, never a regex
 * rewrite. `JSON.parse` accepts only JSON, so nothing in the source can
 * execute, and a malformed document is reported rather than half-formatted.
 */
export function formatJSON(source: string, indent?: number): FormatResult {
  return withParsedJSON(source, (value) => JSON.stringify(value, null, normalizeIndent(indent)))
}

/** The inverse: the same document with every optional space removed. */
export function minifyJSON(source: string): FormatResult {
  return withParsedJSON(source, (value) => JSON.stringify(value))
}

function withParsedJSON(
  source: string,
  render: (value: unknown) => string | undefined,
): FormatResult {
  if (source.trim().length === 0) return { ok: false, error: 'Empty document' }
  const tooDeep = exceedsDepth(source, MAX_DEPTH)
  if (tooDeep) return { ok: false, error: `JSON nested deeper than ${MAX_DEPTH} levels` }

  let value: unknown
  try {
    value = JSON.parse(source)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid JSON' }
  }

  const text = render(value)
  // `JSON.stringify` returns undefined for a bare `undefined`, which JSON.parse
  // can never produce, but guard rather than emit the string "undefined".
  if (typeof text !== 'string') return { ok: false, error: 'Document has no JSON representation' }
  return { ok: true, text }
}

/**
 * Count bracket nesting without parsing, skipping anything inside a string so
 * a `"["` in a value is not mistaken for structure. Runs before `JSON.parse`,
 * so the depth guard itself never recurses.
 */
function exceedsDepth(source: string, limit: number): boolean {
  let depth = 0
  let inString = false
  let escaped = false

  for (const char of source) {
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '[' || char === '{') {
      depth += 1
      if (depth > limit) return true
    } else if (char === ']' || char === '}') depth -= 1
  }
  return false
}
