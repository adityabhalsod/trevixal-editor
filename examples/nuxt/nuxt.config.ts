export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  // `nuxt generate` prerenders every route to HTML at build time. The editor
  // is not in that HTML, see `app.vue`, but everything around it is, which
  // is the point of using Nuxt for a page that ends up client-only anyway.
  ssr: true,
  css: ['@trevixal/ui/styles.css', '@trevixal/editor-kit/styles.css', '../../shared/loading.css'],
  app: {
    head: {
      title: 'Trevixal: Nuxt',
      // `trevixal` on the page as well as on the editor: the theme tokens are
      // inherited, so the margin around the editor follows the theme rather
      // than staying white behind a dark document. `margin: 0` is the page's
      // only rule of its own, as in the full-editor example: the editor's
      // ship with its stylesheets.
      bodyAttrs: { class: 'trevixal', style: 'margin: 0' },
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },
  // Both ship built ES2022 in `dist`, but Nuxt's dev server pre-bundles
  // dependencies and a workspace link is a symlink: without this it resolves
  // `vue` through the package's own directory rather than the app's.
  vite: { optimizeDeps: { exclude: ['@trevixal/editor-kit', '@trevixal/ui'] } },
})
