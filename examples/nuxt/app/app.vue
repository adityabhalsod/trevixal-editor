<template>
  <!--
    `<ClientOnly>` does two things, and both matter. It keeps the component out
    of the server render, so nothing reaches for `window` during `nuxt
    generate`; and it stops Nuxt expecting the server's HTML and the browser's
    to match, which they never could for an editor the server did not build.

    The fallback is what a reader sees in the HTML file itself, so it is worth
    writing. A blank page in the prerendered output is what "the editor did
    not load" looks like to anyone with a slow connection.
  -->
  <ClientOnly>
    <FullEditor />
    <template #fallback>
      <p class="loading">Loading the editor…</p>
    </template>
  </ClientOnly>

  <main class="trevixal">
    <section class="panel">
      <h2>Prerendered, client-mounted</h2>
      <p class="note">
        This paragraph was written into the HTML by <code>nuxt generate</code>. The editor above it
        was not: it is inside <code>&lt;ClientOnly&gt;</code>, so it is built once the browser has
        the page. Everything it offers (the menus, the panels, the side-by-side preview, autosave)
        is the same build every other example uses.
      </p>
    </section>
  </main>
</template>
