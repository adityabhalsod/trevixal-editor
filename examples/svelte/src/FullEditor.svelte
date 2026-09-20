<script lang="ts">
import { type FullEditor, mountFullEditor } from '@trevixal/editor-kit'

/**
 * The whole editor, mounted from a Svelte effect.
 *
 * `$effect` rather than the module body: the mount reaches for `window` and
 * `document` immediately, and only an effect is guaranteed to run in the
 * browser after the element exists. The function it returns is the teardown
 * Svelte calls when the component goes away.
 */
let host: HTMLDivElement

$effect(() => {
  const editor: FullEditor = mountFullEditor({
    element: host,
    namespace: 'trevixal:svelte',
    aboutRows: [{ term: 'Framework', description: 'Svelte 5, mounted from an effect' }],
  })
  return () => editor.destroy()
})
</script>

<div bind:this={host} data-testid="full-editor"></div>
