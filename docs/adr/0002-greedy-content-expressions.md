# ADR-0002: Greedy sequential content expressions

**Status:** Accepted, 2026-08-30

## Context

Schemas declare allowed content via expressions like `"block+"`, `"inline*"`,
`"listItem+"`. A full regular-expression engine over node sequences (NFA with
backtracking, as in ProseMirror) is significant complexity that the core
feature set does not need yet (YAGNI).

## Decision

Support whitespace-separated terms, each a node or group name with an optional
`?`/`*`/`+` quantifier. Matching is greedy and sequential: each term consumes
as many consecutive children as allowed before moving on.

## Consequences

- Covers every schema shipped in `@trevixal/core` and typical extensions.
- Pathological expressions like `"a* a"` cannot match; this is documented and
  rejected as a supported pattern. If a real extension needs alternation or
  non-greedy matching, the parser is isolated in `model/content.ts` and can be
  upgraded to an NFA without touching any caller.
