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
import '@trevixal/ui/styles.css'
import '@trevixal/editor-kit/styles.css'

const host = document.querySelector<HTMLElement>('#app')
if (host) {
  mountFullEditor({
    element: host,
    aboutRows: [
      { term: 'Example', description: 'full-editor, every package the workspace ships' },
      { term: 'Framework', description: 'None: plain DOM, built by Vite' },
    ],
  })
}
