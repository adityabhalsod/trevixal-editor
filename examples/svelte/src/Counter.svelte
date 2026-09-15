<script lang="ts">
  // A Svelte component inside the document. It holds no state: the count
  // comes from the node, and a click is an ordinary editor transaction.
  let { node, updateAttrs } = $props()
</script>

<button
  type="button"
  class="counter"
  onmousedown={(event) => event.preventDefault()}
  onclick={() => updateAttrs({ count: Number(node.attrs.count) + 1 })}
>
  counted {node.attrs.count} times
</button>
