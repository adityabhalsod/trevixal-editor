/**
 * CDN entry: the whole editor from one `<script>` tag, with no bundler.
 *
 * Loading this file defines `window.TrevixalKit`. Everything the page needs is
 * inside it, the core, the chrome and all fifteen extensions, because a page
 * with no build step has no way to fetch them separately.
 *
 * That makes this the largest artefact in the workspace by a wide margin, and
 * deliberately so: it is the "paste two tags and have an editor" build, not
 * the one an application should ship. An app with a bundler imports
 * `@trevixal/editor-kit` and gets tree-shaken ES modules instead.
 *
 * ```html
 * <link rel="stylesheet" href=".../@trevixal/ui/styles.css">
 * <link rel="stylesheet" href=".../@trevixal/editor-kit/styles.css">
 * <script src=".../@trevixal/editor-kit/cdn"></script>
 * <div id="app"></div>
 * <script>TrevixalKit.mountFullEditor({ element: document.querySelector('#app') })</script>
 * ```
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
