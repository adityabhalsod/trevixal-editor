import EditorIsland from './editor-island'

/**
 * A server component that renders one client-only island.
 *
 * The page is rendered in Node and shipped as HTML with the island's
 * placeholder in it; `editor-island.tsx` explains why the editor cannot be.
 */
export default function Page() {
  return <EditorIsland />
}
