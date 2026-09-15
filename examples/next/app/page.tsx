import EditorIsland from './editor-island'

/**
 * A server component that renders one client-only island.
 *
 * Everything outside the island is rendered in Node and shipped as HTML;
 * `editor-island.tsx` explains why the editor cannot be.
 */
export default function Page() {
  return (
    <>
      <EditorIsland />
      <main className="trevixal">
        <section className="panel">
          <h2>Server-rendered, client-mounted</h2>
          <p className="note">
            This paragraph was rendered on the server and shipped as HTML. The editor above it was
            not: it is a <code>ssr: false</code> dynamic import, so its code is fetched and mounted
            only once the browser has the page. Everything it offers (the menus, the panels, the
            side-by-side preview, autosave) is the same build every other example uses.
          </p>
        </section>
      </main>
    </>
  )
}
