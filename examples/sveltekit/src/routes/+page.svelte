<script lang="ts">
  import FullEditor from '$lib/FullEditor.svelte'
</script>

<FullEditor />

<main class="trevixal">
  <section class="panel">
    <h2>Prerendered, client-mounted</h2>
    <p class="note">
      This paragraph was written into the HTML at build time. The editor above it was not: it is
      imported and built inside an effect, so it is fetched once the browser has the page.
      Everything it offers (the menus, the panels, the side-by-side preview, autosave) is the
      same build every other example uses.
    </p>
  </section>
</main>
