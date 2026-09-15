# @trevixal/vue

## 1.0.1

### Patch Changes

- dfa4dc8: Stop publishing source maps.

  The maps have no `sourcesContent`, so they name their sources as `../src/*.ts`
  and `src/` is not published: a consumer downloads them and no debugger can
  resolve them. They were 2.7 MB across the 23 packages. `files` now excludes
  `dist/**/*.map`; the maps are still built for local debugging.

## 1.0.0

### Major Changes

- 12bc7d2: First public release of the Trevixal editor: the framework-agnostic core, the
  chrome and design tokens in `@trevixal/ui`, the assembled `@trevixal/editor-kit`,
  bindings for React, Vue, Svelte, Angular and a web component, and fifteen
  extensions. Published from a clean, dry-run-verified tree; `dist/` only.

### Patch Changes

- Updated dependencies [12bc7d2]
  - @trevixal/core@1.0.0
