import { defineConfig } from 'tsup'

/** The UI catalogues, each its own entry so a page loads only the one it shows. */
const LOCALES = ['de', 'fr', 'es', 'pt', 'hi', 'ja', 'zh', 'ar']

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'locales/index': 'src/locales/index.ts',
    ...Object.fromEntries(LOCALES.map((code) => [`locales/${code}`, `src/locales/${code}.ts`])),
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  // Map to file names and lines, not to the code: the tarball ships this map,
  // and sourcesContent would put every .ts file in it.
  esbuildOptions(options) {
    options.sourcesContent = false
  },
  clean: true,
  // Minified by the two passes that keep comments. `minify: true` would add
  // the whitespace pass, which strips the `/* @vite-ignore */` a dynamic
  // import carries (extension-diagram), and Next.js then refuses the build.
  // One rule for all 23 packages beats remembering the exception.
  minifyIdentifiers: true,
  minifySyntax: true,
  external: ['@trevixal/core'],
})
