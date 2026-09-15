<script setup lang="ts">
import type { NodeViewProps } from '@trevixal/vue'

// A Vue component living inside the document. It holds no state of its own:
// the count comes from the node, and a click is an ordinary editor
// transaction, which is why undo rewinds it like anything else.
const props = defineProps<NodeViewProps>()
</script>

<template>
  <button
    type="button"
    class="counter"
    @mousedown.prevent
    @click="props.updateAttrs({ count: Number(props.node.attrs.count) + 1 })"
  >
    counted {{ props.node.attrs.count }} times
  </button>
</template>
