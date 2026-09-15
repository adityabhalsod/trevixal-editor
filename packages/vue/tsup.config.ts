import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
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
  external: ['@trevixal/core', 'vue'],
})
