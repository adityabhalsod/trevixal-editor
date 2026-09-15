import { mountFullEditor } from '@trevixal/editor-kit'
import '@trevixal/ui/styles.css'
import '@trevixal/editor-kit/styles.css'
import '../../shared/page.css'
import { onCleanup, onMount } from 'solid-js'
import { render } from 'solid-js/web'

/**
 * The whole editor, mounted from Solid's lifecycle.
 *
 * There is no `@trevixal/solid` package, and this example is here to show that
 * none is needed. The editor owns a plain DOM element and nothing else: any
 * framework that can hand over an element and tell you when it is going away
 * can host it. In Solid that is `onMount` and `onCleanup`, and this is all of
 * it. The same eight lines the React, Vue, Svelte and Angular examples spend
 * on their own hooks.
 */
function FullEditor() {
  let host!: HTMLDivElement

  onMount(() => {
    const editor = mountFullEditor({
      element: host,
      namespace: 'trevixal:solid',
      aboutRows: [{ term: 'Framework', description: 'Solid, with no adapter package' }],
    })
    onCleanup(() => editor.destroy())
  })

  return <div ref={host} data-testid="full-editor" />
}

function App() {
  return (
    <>
      <FullEditor />
      <main class="trevixal">
        <section class="panel">
          <h2>No adapter, no bindings</h2>
          <p class="note">
            Trevixal ships adapters for React, Vue, Svelte and Angular because those make node views
            (your own components rendered <em>inside</em> the document) pleasant to write. The
            editor itself needs none of them. This page is the proof: plain
            <code>@trevixal/editor-kit</code>, a ref, and two lifecycle calls.
          </p>
        </section>
      </main>
    </>
  )
}

const root = document.querySelector('#root')
if (root) render(() => <App />, root)
