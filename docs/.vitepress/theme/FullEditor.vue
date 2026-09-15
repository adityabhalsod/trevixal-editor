<script setup lang="ts">
import { useData } from 'vitepress'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { loadScript, loadStylesheet } from './assets'

/**
 * The assembled editor, mounted from the one-file build a page with no
 * bundler would load. `examples/full-editor` makes the same call from Vite;
 * this page makes it from VitePress, and that is the only difference.
 */
interface MenuItem {
  readonly name: string
  readonly run?: (editor: unknown) => void
  readonly items?: readonly MenuItem[]
}

interface FullEditor {
  readonly editor: unknown
  readonly ui: { readonly menus: readonly { readonly items: readonly MenuItem[] }[] }
  destroy(): void
}

interface Kit {
  mountFullEditor(options: {
    element: HTMLElement
    namespace: string
    heading: string | null
    paragraphs: readonly string[]
    showSerializedHTML: boolean
    aboutRows: readonly { term: string; description: string }[]
  }): FullEditor
}

const { isDark } = useData()
const host = ref<HTMLElement | null>(null)
let mounted: FullEditor | null = null
let disposed = false

function findMenuItem(items: readonly MenuItem[], name: string): MenuItem | undefined {
  for (const item of items) {
    if (item.name === name) return item
    const nested = item.items && findMenuItem(item.items, name)
    if (nested) return nested
  }
  return undefined
}

/**
 * The site's switch drives the editor through its own View ▸ Theme entries,
 * as wired, so this page needs nothing the kit does not already expose.
 * Only when the two disagree: a preset such as Nord already resolves to
 * dark, and the Dark entry is a radio button that would clear it.
 */
function followSite(): void {
  if (!mounted) return
  const wanted = isDark.value ? 'dark' : 'light'
  if (document.documentElement.dataset.trevixalTheme === wanted) return
  const name = isDark.value ? 'themeDark' : 'themeLight'
  for (const menu of mounted.ui.menus) {
    const item = findMenuItem(menu.items, name)
    if (item?.run) {
      item.run(mounted.editor)
      return
    }
  }
}

// And back: the kit writes the mode it resolved onto <html>, so a theme
// picked inside the editor reaches the site the same way the switch does.
// "Match the system" clears the attribute, and the site is left alone.
const themeAttribute = new MutationObserver(() => {
  const theme = document.documentElement.dataset.trevixalTheme
  if (theme === 'light' || theme === 'dark') isDark.value = theme === 'dark'
})

watch(isDark, followSite)

/**
 * Ctrl+K is the command palette here. The site's search takes the same key
 * from a listener on `window`; the palette's own listener is on `document`,
 * so stopping the event there lets the palette run and the search never hear.
 */
function keepPaletteShortcut(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') event.stopPropagation()
}

onMounted(async () => {
  const base = import.meta.env.BASE_URL
  await Promise.all([
    loadStylesheet(`${base}trevixal/styles.css`),
    loadStylesheet(`${base}trevixal/editor-kit.css`),
    loadScript(`${base}trevixal/editor-kit.js`),
  ])
  // The reader may have navigated away while the bundle was still arriving.
  if (disposed || !host.value) return
  // The palette, the dialogs and the writing card mount on <body>, and the
  // kit's tokens live on `.trevixal`, so the body carries it while the editor
  // is here, the way the example's page does. `styles.css` keeps the site's
  // own paint on it.
  document.body.classList.add('trevixal')
  document.addEventListener('keydown', keepPaletteShortcut)
  const kit = (window as unknown as { TrevixalKit: Kit }).TrevixalKit
  mounted = kit.mountFullEditor({
    element: host.value,
    namespace: 'trevixal-docs',
    // The page above already says what this is; the kit's own intro would
    // say it again and push the editor below the fold.
    heading: null,
    paragraphs: [],
    // The readout serializes the whole document, stylesheets included, which
    // on a docs page means the site's own; the copy below the editor says what
    // the page is instead.
    showSerializedHTML: false,
    aboutRows: [
      { term: 'Example', description: 'the documentation site, every package the workspace ships' },
      { term: 'Framework', description: 'None: the CDN build, mounted from a VitePress page' },
    ],
  })
  followSite()
  themeAttribute.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-trevixal-theme'],
  })
})

onBeforeUnmount(() => {
  disposed = true
  themeAttribute.disconnect()
  document.removeEventListener('keydown', keepPaletteShortcut)
  document.body.classList.remove('trevixal')
  mounted?.destroy()
  mounted = null
})
</script>

<template>
  <div ref="host" class="full-editor trevixal" />
</template>
