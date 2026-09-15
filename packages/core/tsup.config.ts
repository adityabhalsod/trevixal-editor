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
  treeshake: true,
})
