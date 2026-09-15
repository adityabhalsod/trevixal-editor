<script setup lang="ts">
import { type FullEditor, mountFullEditor } from '@trevixal/editor-kit'
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'

/**
 * The whole editor, mounted from Vue's lifecycle.
 *
 * `onMounted` rather than `setup`: the mount reaches for `window` and
 * `document` immediately, and `setup` also runs on the server. Vue gives the
 * element only once the component is in the DOM, which is exactly when the
 * editor can build itself into it.
 */
const host = useTemplateRef<HTMLDivElement>('host')
let editor: FullEditor | null = null

onMounted(() => {
  if (!host.value) return
  editor = mountFullEditor({
    element: host.value,
    namespace: 'trevixal:vue',
    aboutRows: [{ term: 'Framework', description: 'Vue 3, mounted from onMounted' }],
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
