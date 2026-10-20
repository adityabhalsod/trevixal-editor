import type { DiagramRenderer } from './controller'

/**
 * The slice of Viz.js (Graphviz compiled to WebAssembly) this package
 * touches. Structural, so a lazily loaded copy or a test double fits.
 */
export interface GraphvizLike {
  renderString(source: string, options?: { format?: string; engine?: string }): string
}

/** Where {@link loadGraphviz} fetches Viz.js from unless told otherwise. */
export const GRAPHVIZ_CDN_URL = 'https://cdn.jsdelivr.net/npm/@viz-js/viz@3/lib/viz-standalone.mjs'

/** Draw DOT source (Graphviz's language) as SVG. */
export function createGraphvizRenderer(graphviz: GraphvizLike): DiagramRenderer {
  return (code) => graphviz.renderString(code, { format: 'svg' })
}

/**
 * Load Viz.js on demand. Like Mermaid it is large and most documents never
 * need it, so it is fetched the first time a DOT block renders.
 */
export async function loadGraphviz(url: string = GRAPHVIZ_CDN_URL): Promise<GraphvizLike> {
  // The same two directives as `loadMermaid`: the URL is a runtime value for
  // the browser to fetch, and every bundler must leave it alone.
  const loaded = (await import(/* @vite-ignore */ /* webpackIgnore: true */ url)) as {
    instance?: () => Promise<unknown>
  }
  const viz = loaded.instance ? await loaded.instance() : null
  if (!viz || typeof (viz as { renderString?: unknown }).renderString !== 'function') {
    throw new Error(`loadGraphviz: ${url} does not export a Viz.js instance`)
  }
  return viz as GraphvizLike
}
