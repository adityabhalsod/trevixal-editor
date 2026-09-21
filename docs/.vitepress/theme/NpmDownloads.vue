<script setup lang="ts">
import { onMounted, ref } from 'vue'

/**
 * How often the packages were installed last month, all of them added up.
 *
 * Read from this site's own `/api/downloads`, which sums the scope and caches
 * the answer at the edge for an hour. Same origin, so no third party renders
 * the nav and there is no per-reader rate limit, and the number is current
 * rather than frozen at the last deploy.
 *
 * That route is a serverless function, so it does not exist under `vitepress
 * dev`. Nothing renders until the number arrives and nothing renders at all
 * if it never does, which is the right outcome for a decoration.
 */
const total = ref<string | null>(null)

onMounted(async () => {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}api/downloads`)
    if (!response.ok) return
    const body = (await response.json()) as { message?: unknown }
    if (typeof body.message === 'string') total.value = body.message
  } catch {
    // Offline, or running under `vitepress dev`. The nav is fine without it.
  }
})
</script>

<template>
  <a
    v-if="total"
    class="npm-downloads"
    href="https://www.npmjs.com/search?q=%40trevixal"
    target="_blank"
    rel="noreferrer"
    :aria-label="`${total} downloads from npm`"
  >
    <span class="npm-downloads__count">{{ total }}</span>
  </a>
</template>
