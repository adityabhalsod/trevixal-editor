<script setup lang="ts">
/**
 * The repository's star count, beside the GitHub icon in the nav bar.
 *
 * Shields renders the number into the image, so there is no API call from the
 * reader's browser to rate-limit and nothing to go stale in a cached build.
 * The count moves on its own between deploys.
 */
const REPOSITORY = 'adityabhalsod/trevixal-editor'
</script>

<template>
  <a
    class="github-stars"
    :href="`https://github.com/${REPOSITORY}`"
    target="_blank"
    rel="noreferrer"
    aria-label="Star Trevixal on GitHub"
  >
    <img
      :src="`https://img.shields.io/github/stars/${REPOSITORY}?style=social&label=Star`"
      alt=""
      height="20"
      loading="lazy"
    />
  </a>
</template>
