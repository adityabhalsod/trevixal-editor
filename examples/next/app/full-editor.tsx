'use client'

import { mountFullEditor } from '@trevixal/editor-kit'
import { useEffect, useRef } from 'react'

/**
 * The whole editor, mounted from a client effect.
 *
 * `'use client'` is not enough on its own. It says "send this component's code
 * to the browser", not "do not render it on the server", Next still renders
 * a client component once on the server to produce the initial HTML. The
 * module-level import of `@trevixal/editor-kit` would then be evaluated in
 * Node, and the page would ask for the CSS it never sent. The `ssr: false`
 * dynamic import in `page.tsx` is what keeps that from happening; this file
 * assumes it and reaches straight for the DOM.
 */
export default function FullEditor() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = host.current
    if (!element) return
    const editor = mountFullEditor({
      element,
      namespace: 'trevixal:next',
      aboutRows: [{ term: 'Framework', description: 'Next.js App Router, client-only' }],
    })
    return () => editor.destroy()
  }, [])

  return <div ref={host} data-testid="full-editor" />
}
