<script lang="ts">
import { browser } from '$app/environment'
// Type only, so the import is erased: nothing of this package reaches the
// server bundle. The value comes from the dynamic import below.
import type { FullEditor } from '@trevixal/editor-kit'

/**
 * The whole editor, mounted from a Svelte effect.
 *
 * Two guards, and only one of them matters. `$effect` never runs during a
 * server render, so the `browser` check below it is belt and braces, kept
 * because this component is meant to be copied, and a reader who moves the
 * call out of the effect still gets an answer rather than a crash.
 *
 * The dynamic import is the one that counts. A top-level `import` is
 * evaluated as the module loads, and on a prerendered route that happens in
 * Node during `vite build`, before any effect exists to guard it.
 */
let host: HTMLDivElement

$effect(() => {
  if (!browser) return
  let editor: FullEditor | null = null
  let gone = false

  void import('@trevixal/editor-kit').then(({ mountFullEditor: mount }) => {
    if (gone) return
    editor = mount({
      element: host,
      namespace: 'trevixal:sveltekit',
      aboutRows: [
        { term: 'Framework', description: 'SvelteKit, prerendered, mounted in an effect' },
      ],
    })
  })

  return () => {
    gone = true
    editor?.destroy()
  }
})
</script>

<div bind:this={host} data-testid="full-editor"></div>
