<script setup lang="ts">
import { type FullEditor, mountFullEditor } from '@trevixal/editor-kit'
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'

/**
 * The whole editor, mounted from Nuxt's client lifecycle.
 *
 * `onMounted` never runs on the server, so the mount, which reaches for
 * `window` in its first statement, is safe here even though the rest of the
 * page is prerendered. `<ClientOnly>` around this component in `app.vue` is
 * what keeps the *import* off the server too.
 */
const host = useTemplateRef<HTMLDivElement>('host')
let editor: FullEditor | null = null

onMounted(() => {
  if (!host.value) return
  editor = mountFullEditor({
    element: host.value,
    namespace: 'trevixal:nuxt',
    aboutRows: [{ term: 'Framework', description: 'Nuxt 4, inside <ClientOnly>' }],
  })
})

onBeforeUnmount(() => {
  editor?.destroy()
  editor = null
})
</script>

<template>
  <div ref="host" data-testid="full-editor" />
</template>
