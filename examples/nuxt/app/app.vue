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
</template>
