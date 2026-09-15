<script lang="ts">
  import '@trevixal/ui/styles.css'
  import '@trevixal/editor-kit/styles.css'
  import '../../../shared/page.css'

  const { children } = $props()
</script>

<svelte:head><title>Trevixal, SvelteKit</title></svelte:head>

{@render children()}
