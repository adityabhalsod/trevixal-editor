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
    // Minified by the two passes that keep comments. `minify: true` would add
    // the whitespace pass, which strips the `/* @vite-ignore */` a dynamic
    // import carries (extension-diagram), and Next.js then refuses the build.
    // One rule for all 23 packages beats remembering the exception.
    minifyIdentifiers: true,
    minifySyntax: true,
    // Every Trevixal package stays external: this one assembles them, and a
    // second copy of the core bundled in here would give the host two Editor
    // classes and no way to tell them apart.
    external: [/^@trevixal\//],
  },
  {
    // Bundler-free CDN build. The opposite trade from the entry above: a page
    // with no build step cannot resolve a bare import, so everything goes in.
    // `clean` is deliberately off. It would delete the ESM build just made.
    entry: { 'trevixal-editor-kit': 'src/cdn.ts' },
    format: ['iife'],
    globalName: 'TrevixalKit',
    minify: true,
    sourcemap: true,
    // Map to file names and lines, not to the code: the tarball ships this map,
    // and sourcesContent would put every .ts file in it.
    esbuildOptions(options) {
      options.sourcesContent = false
    },
    noExternal: [/^@trevixal\//],
    outExtension: () => ({ js: '.iife.js' }),
  },
])
