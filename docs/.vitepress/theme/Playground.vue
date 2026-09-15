<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { loadScript, loadStylesheet } from './assets'

/**
 * The editor, loaded the way a page with no build step would load it: the
 * CDN bundle and the stylesheet, both copied into `public/` by the docs
 * build so this page exercises the code in the repository rather than
 * whatever was last released.
 */
const host = ref<HTMLElement | null>(null)
const json = ref('')
const ready = ref(false)

onMounted(async () => {
  const base = import.meta.env.BASE_URL
  await Promise.all([
    loadStylesheet(`${base}trevixal/styles.css`),
    loadScript(`${base}trevixal/trevixal-editor.js`),
  ])

  const element = document.createElement('trevixal-editor')
  element.setAttribute('placeholder', 'Type here: try `# ` or `- ` at the start of a line…')
  element.innerHTML =
    '<h2>Hello</h2><p>This content was parsed <em>and sanitized</em> on the way in.</p>'
  host.value?.replaceChildren(element)

  const show = () => {
    const value = (element as unknown as { getJSON(): unknown }).getJSON()
    json.value = JSON.stringify(value, null, 2)
  }
  element.addEventListener('trevixal-change', show)
  // The element parses its children on connect, so read after it is in the DOM.
  requestAnimationFrame(() => {
    show()
    ready.value = true
  })
})
</script>

<template>
  <div class="playground trevixal">
    <div ref="host" class="playground__editor" />
    <details class="playground__json" :open="ready">
      <summary>The document, as you would store it</summary>
      <pre>{{ json }}</pre>
    </details>
  </div>
</template>
