'use client'

import dynamic from 'next/dynamic'

/**
 * The client boundary, and the reason it exists.
 *
 * `'use client'` does not mean "only in the browser". It means "send this
 * component to the browser", Next still renders it once in Node to produce
 * the first HTML. That is fatal here: the editor's module reaches for the DOM
 * as it loads, and there is no DOM on a build server.
 *
 * `ssr: false` is what actually keeps it out of the server render, and the App
 * Router only accepts it inside a client component, which is all this file
 * is. `page.tsx` stays a server component and renders this, so the prose
 * around the editor is still server-rendered HTML a crawler can read.
 */
const FullEditor = dynamic(() => import('./full-editor'), {
  ssr: false,
  loading: () => <p className="loading">Loading the editor…</p>,
})

export default function EditorIsland() {
  return <FullEditor />
}
