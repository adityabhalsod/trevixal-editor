<script lang="ts">
  // The interactive counter block, as a Svelte component living inside the
  // document. It holds no state of its own: the count comes from the node,
  // and a click is an ordinary editor transaction that redraws it.
  let { node, updateAttrs } = $props()
</script>

<button
  type="button"
  data-testid="counter"
  onclick={() => updateAttrs({ count: Number(node.attrs.count) + 1 })}
>
  count: {node.attrs.count}
</button>
