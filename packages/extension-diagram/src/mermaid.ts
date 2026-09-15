import type { DiagramRenderer } from './controller'

/**
 * The slice of the Mermaid API this package touches. Structural, so the real
 * `mermaid` module, a lazily loaded copy, or a test double all fit, and the
 * package itself never has to depend on Mermaid.
 */
export interface MermaidLike {
  initialize?(config: Record<string, unknown>): void
  render(id: string, code: string): Promise<{ svg: string }>
}

/** Where {@link loadMermaid} fetches Mermaid from unless told otherwise. */
export const MERMAID_CDN_URL = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs'

/**
 * Mermaid looks its scratch element up by id selector, so the id it gets must
 * start with a letter and contain only selector-safe characters.
 */
function selectorSafeId(id: string): string {
  const safe = id.replace(/[^A-Za-z0-9_-]/g, '-')
  return /^[A-Za-z]/.test(safe) ? safe : `tvx-${safe}`
}

/**
 * Adapt a Mermaid instance to a {@link DiagramRenderer}. Mermaid is
 * initialized once, on the first render, with `startOnLoad: false` (the
 * editor decides when to draw) and `securityLevel: 'strict'` (diagram text
 * is user input); `config` can override either. Every render call gets a
 * fresh id, because Mermaid renders concurrently into id-addressed elements
 * and two renders sharing an id would clobber each other.
 */
export function createMermaidRenderer(
  mermaid: MermaidLike,
  config: Record<string, unknown> = {},
): DiagramRenderer {
  let initialized = false
  let calls = 0
  return async (code, context) => {
    if (!initialized) {
      initialized = true
      mermaid.initialize?.({ startOnLoad: false, securityLevel: 'strict', ...config })
    }
    calls += 1
    const { svg } = await mermaid.render(`${selectorSafeId(context.id)}-${calls}`, code)
    return svg
  }
}

function isMermaidLike(value: unknown): value is MermaidLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { render?: unknown }).render === 'function'
  )
}

/**
 * Load Mermaid on demand from a CDN (or any ESM URL). Mermaid is a large
 * dependency most documents never need, so it is fetched only when a host
 * asks, typically the first time a diagram block appears.
 */
export async function loadMermaid(url: string = MERMAID_CDN_URL): Promise<MermaidLike> {
  // Both comments are load-bearing, and every bundler needs its own.
  //
  // The URL is a runtime value, so there is nothing here for a bundler to
  // resolve, but each one tries anyway, and each one fails differently.
  // Vite prints a warning and emits the import untouched; webpack and
  // Turbopack (so Next.js, so every Next app that installs this package)
  // treat it as an unresolved module and fail the build outright. The
  // directives tell them to leave it alone and let the browser fetch it,
  // which is the whole point: Mermaid comes from a CDN, on demand.
  const loaded: unknown = await import(/* @vite-ignore */ /* webpackIgnore: true */ url)
  const candidate = (loaded as { default?: unknown }).default ?? loaded
  if (!isMermaidLike(candidate)) {
    throw new Error(`loadMermaid: ${url} does not export a Mermaid API`)
  }
  return candidate
}
