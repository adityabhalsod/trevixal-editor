/**
 * Copy the two CDN bundles and their stylesheets into the docs site's static
 * folder.
 *
 * The playground and the full-editor page load them the way any page with a
 * script tag would, so they exercise the code in this checkout rather than
 * whatever was last released, which is the only way a demo is worth having.
 */
import { copyFile, mkdir, readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'docs/public/trevixal')

await mkdir(out, { recursive: true })
await copyFile(
  join(root, 'packages/web-component/dist/trevixal-editor.iife.js'),
  join(out, 'trevixal-editor.js'),
)
await copyFile(join(root, 'packages/ui/dist/styles.css'), join(out, 'styles.css'))
await copyFile(
  join(root, 'packages/editor-kit/dist/trevixal-editor-kit.iife.js'),
  join(out, 'editor-kit.js'),
)
await copyFile(join(root, 'packages/editor-kit/dist/styles.css'), join(out, 'editor-kit.css'))
// TypeDoc's `packages` strategy takes an explicit list. It accepts neither a
// glob that skips a package nor a negation, and pointing it at `packages/*`
// walks into `e2e`, which is private and has no entry point. An explicit list
// goes stale the first time somebody adds a package, so it is checked here,
// right before every docs build, rather than discovered missing in the output.
const typedoc = JSON.parse(await readFile(join(root, 'typedoc.json'), 'utf8'))
const listed = new Set(typedoc.entryPoints)
const publishable = []
for (const entry of await readdir(join(root, 'packages'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const manifest = join(root, 'packages', entry.name, 'package.json')
  try {
    if (!JSON.parse(await readFile(manifest, 'utf8')).private) {
      publishable.push(`packages/${entry.name}`)
    }
  } catch {
    // No manifest: not a package.
  }
}

const missing = publishable.filter((name) => !listed.has(name))
if (missing.length > 0) {
  console.error(
    `typedoc.json is missing ${missing.join(', ')}. Add them to "entryPoints", or the API reference will quietly omit them.`,
  )
  process.exit(1)
}

console.log(`docs/public/trevixal ready, ${publishable.length} packages documented`)
