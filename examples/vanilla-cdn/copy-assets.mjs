/**
 * Copy the files the page needs out of the workspace.
 *
 * A published page would load these from a CDN. Here they come from `dist`,
 * so the example shows the *same* markup while testing the code in this
 * checkout rather than whatever was last released.
 */
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')
const out = join(here, 'vendor')

const ASSETS = [
  ['packages/ui/dist/styles.css', 'ui-styles.css'],
  ['packages/editor-kit/dist/styles.css', 'kit-styles.css'],
  ['packages/editor-kit/dist/trevixal-editor-kit.iife.js', 'trevixal-editor-kit.js'],
]

await mkdir(out, { recursive: true })
for (const [from, to] of ASSETS) await copyFile(join(root, from), join(out, to))

// The chrome's other languages, one ES module each, which the page imports
// only when View ▸ Language picks one. Their index is left behind: the page
// names the languages itself, so it can mount without importing anything.
const locales = join(root, 'packages/ui/dist/locales')
await mkdir(join(out, 'locales'), { recursive: true })
for (const file of await readdir(locales)) {
  if (file.endsWith('.js') && file !== 'index.js') {
    await copyFile(join(locales, file), join(out, 'locales', file))
  }
}

// Printed rather than assumed: a page with no build step pays for the whole
// editor in one file, and a number nobody measured is not a trade-off.
const kit = Math.round((await stat(join(out, 'trevixal-editor-kit.js'))).size / 1024)
console.log(`vendor/ ready, kit ${kit} kB, minified, before gzip.`)
console.log('Open index.html, or run `pnpm dev`')
