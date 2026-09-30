/**
 * The complete editor, as configuration.
 *
 * Everything this page does lives in `@trevixal/editor-kit`. The schema, the
 * extensions, the menus, the panels, the panes, the autosave. What is left
 * here is what a host actually decides: where to build, and what to call
 * itself. Every other example in this workspace makes the same call from its
 * own framework's lifecycle.
 */
import { mountFullEditor } from '@trevixal/editor-kit'
import { uiLanguageLoaders } from '@trevixal/ui/locales'
import '@trevixal/ui/styles.css'
import '@trevixal/editor-kit/styles.css'

// Installable and offline: the service worker the build writes caches the app
// shell, so the editor opens without a network once it has opened with one.
// Not from the dev server, whose modules are no shell to cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  void navigator.serviceWorker.register('./sw.js')
}

const host = document.querySelector<HTMLElement>('#app')
if (host) {
  mountFullEditor({
    element: host,
    // Each catalogue is its own chunk, fetched only when View ▸ Language picks it.
    languages: uiLanguageLoaders,
    aboutRows: [
      { term: 'Example', description: 'full-editor, every package the workspace ships' },
      { term: 'Framework', description: 'None: plain DOM, built by Vite' },
    ],
  })
}
