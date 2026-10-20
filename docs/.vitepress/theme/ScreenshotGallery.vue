<script setup lang="ts">
import { ref } from 'vue'

/**
 * Screenshots as a grid of thumbnails, each opening full size in a viewer: a
 * modal `<dialog>`, so the browser keeps the focus inside it and `Escape`
 * closes it, with the arrow keys going to the next and previous one.
 *
 * The images are served as they are from `public/screenshots`. The
 * thumbnails are the same files, loaded lazily, rather than a small copy of
 * each: one file per screenshot is one thing to keep in step.
 */
interface Screenshot {
  /** The file in `public/screenshots`. */
  readonly file: string
  readonly caption: string
}

const props = defineProps<{ shots: readonly Screenshot[] }>()

const viewer = ref<HTMLDialogElement | null>(null)
const current = ref(0)
let opener: HTMLElement | null = null

function url(shot: Screenshot): string {
  return `${import.meta.env.BASE_URL}screenshots/${shot.file}`
}

/** The number the file starts with: the order the walkthrough took them in. */
function number(shot: Screenshot): string {
  return /^\d+/.exec(shot.file)?.[0] ?? ''
}

function open(index: number, event: MouseEvent): void {
  opener = event.currentTarget as HTMLElement
  current.value = index
  viewer.value?.showModal()
}

function step(by: number): void {
  const count = props.shots.length
  current.value = (current.value + by + count) % count
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowRight') step(1)
  else if (event.key === 'ArrowLeft') step(-1)
  else return
  event.preventDefault()
}

/** A click on the dimmed page around the viewer closes it: only there is the dialog itself the target. */
function onClick(event: MouseEvent): void {
  if (event.target === viewer.value) viewer.value?.close()
}

function onClose(): void {
  opener?.focus()
  opener = null
}
</script>

<template>
  <div class="screenshot-gallery">
    <ul class="screenshot-gallery__grid">
      <li v-for="(shot, index) in shots" :key="shot.file">
        <button type="button" class="screenshot-gallery__thumb" @click="open(index, $event)">
          <img :src="url(shot)" alt="" width="1440" height="1000" loading="lazy" decoding="async" />
          <span class="screenshot-gallery__caption">
            <span class="screenshot-gallery__number">{{ number(shot) }}</span>
            {{ shot.caption }}
          </span>
        </button>
      </li>
    </ul>

    <dialog
      ref="viewer"
      class="screenshot-viewer"
      :aria-label="shots[current]?.caption"
      @keydown="onKeydown"
      @click="onClick"
      @close="onClose"
    >
      <div v-if="shots[current]" class="screenshot-viewer__body">
        <img class="screenshot-viewer__image" :src="url(shots[current])" :alt="shots[current].caption" />
        <div class="screenshot-viewer__bar">
          <p class="screenshot-viewer__caption" aria-live="polite">
            <span class="screenshot-gallery__number">{{ number(shots[current]) }}</span>
            {{ shots[current].caption }}
            <span class="screenshot-viewer__count">{{ current + 1 }} of {{ shots.length }}</span>
          </p>
          <div class="screenshot-viewer__actions">
            <button type="button" aria-label="Previous screenshot" @click="step(-1)">‹</button>
            <button type="button" aria-label="Next screenshot" @click="step(1)">›</button>
            <a :href="url(shots[current])" target="_blank" rel="noreferrer">Full size</a>
            <button type="button" autofocus @click="viewer?.close()">Close</button>
          </div>
        </div>
      </div>
    </dialog>
  </div>
</template>
