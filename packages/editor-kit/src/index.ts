/**
 * @trevixal/editor-kit. Every package the workspace ships, assembled.
 *
 * One call builds the page: menubar, toolbar, dialogs, status bar, sidebar
 * panels, a side-by-side preview and a second editing surface, with tables,
 * images, media, equations, diagrams, track changes, writing checks, autosave,
 * themes, encryption and a document workspace already wired to each other.
 *
 * ```ts
 * import { mountFullEditor } from '@trevixal/editor-kit'
 * import '@trevixal/ui/styles.css'
 * import '@trevixal/editor-kit/styles.css'
 *
 * const editor = mountFullEditor({ element: document.querySelector('#app') })
 * // …and on unmount:
 * editor.destroy()
 * ```
 *
 * It touches `window` and `document` the moment it is called, so call it from
 * wherever your framework runs browser-only code, a `useEffect`, an
 * `onMounted`, an `afterNextRender`, and never during a server render.
 */
export { initialContent } from './content'
export {
  type FullEditorIntro,
  type FullEditorLayout,
  type LayoutOptions,
  DEFAULT_INTRO,
  createLayout,
} from './layout'
export { mountFullEditor } from './mount'
export { createFullSchema } from './schema'
export {
  type AboutRow,
  type FullEditor,
  type FullEditorOptions,
  DEFAULT_ABOUT_ROWS,
} from './options'
export {
  type PreferenceStore,
  type Preferences,
  loadPreferences,
  savePreferences,
} from './features'
