import { defineConfig } from 'tsup'

const shared = {
  sourcemap: true,
  // Map to file names and lines, not to the code: the tarball ships this map,
  // and sourcesContent would put every .ts file in it.
  esbuildOptions(options: { sourcesContent?: boolean }) {
    options.sourcesContent = false
  },
  minifyIdentifiers: true,
  minifySyntax: true,
} as const

// Two builds into one dist/, each cleaning only its own files.
export default defineConfig([
  // What a tool of its own imports, both ways, as every package here ships.
  { ...shared, entry: ['src/index.ts'], format: ['esm', 'cjs'], dts: true, clean: ['index.*'] },
  // The command `npm create trevixal-extension` runs, straight from the tarball.
  {
    ...shared,
    entry: ['src/cli.ts'],
    format: ['esm'],
    clean: ['cli.*'],
    banner: { js: '#!/usr/bin/env node' },
  },
])
