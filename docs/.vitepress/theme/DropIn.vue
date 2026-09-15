<script setup lang="ts">
import page from './drop-in.html?raw'

/**
 * The drop-in page, running. The frame's document is `drop-in.html` itself,
 * the file the code block on the page is read from, so what a reader copies
 * and what they watch run cannot be two things.
 *
 * Not sandboxed, on purpose. Without `allow-same-origin` the frame has no
 * storage, and the kit reaches `localStorage` for autosave before it builds
 * the menubar and toolbar, so a sandboxed copy stops half-mounted. What the
 * frame runs is this project's own released bundle, which the full-editor
 * page already runs at page level.
 */
</script>

<template>
  <iframe class="drop-in" :srcdoc="page" title="The drop-in page, running" loading="lazy" />
</template>
