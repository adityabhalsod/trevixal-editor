import { defineConfig } from 'tsup'

export default defineConfig([
  {
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
    external: ['@trevixal/core'],
  },
  {
    // Bundler-free CDN build: one <script>, auto-defines <trevixal-editor>.
    entry: { 'trevixal-editor': 'src/cdn.ts' },
    format: ['iife'],
    globalName: 'Trevixal',
    minify: true,
    sourcemap: true,
    // Map to file names and lines, not to the code: the tarball ships this map,
    // and sourcesContent would put every .ts file in it.
    esbuildOptions(options) {
      options.sourcesContent = false
    },
    noExternal: ['@trevixal/core'],
    outExtension: () => ({ js: '.iife.js' }),
  },
])
