import { copyFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))

await build({
  entryPoints: [join(here, 'page/entry.ts')],
  bundle: true,
  format: 'iife',
  outfile: join(here, 'page/bundle.js'),
  sourcemap: 'inline',
})

await build({
  entryPoints: [join(here, 'page/track-changes-entry.ts')],
  bundle: true,
  format: 'iife',
  outfile: join(here, 'page/track-changes.js'),
  sourcemap: 'inline',
})

await build({
  entryPoints: [join(here, 'page/ui-entry.ts')],
  bundle: true,
  format: 'iife',
  outfile: join(here, 'page/ui.js'),
  sourcemap: 'inline',
})

// The UI page loads the kit's compiled stylesheet, so the chrome renders
// exactly as consumers see it.
await copyFile(join(here, '../ui/dist/styles.css'), join(here, 'page/ui-styles.css'))
