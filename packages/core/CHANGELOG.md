# @trevixal/core

## 1.0.3

### Patch Changes

- a1747fd: Documentation only: badges, a screenshot, a features list and a measured size in every package README, and absolute links, because a relative link is a 404 on npm.

## 1.0.2

### Patch Changes

- 8457f05: Add `keywords` to every package so npm search can find them by what they do ("rich text editor", "docx", "track changes", "mermaid"), not only by name.

  Ship minified ESM and CJS builds. Identifiers and syntax are minified; whitespace is kept so the comments a dynamic import relies on survive.

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
