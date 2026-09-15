# @trevixal/editor-kit

## 1.0.2

### Patch Changes

- 8457f05: Add `keywords` to every package so npm search can find them by what they do ("rich text editor", "docx", "track changes", "mermaid"), not only by name.

  Ship minified ESM and CJS builds. Identifiers and syntax are minified; whitespace is kept so the comments a dynamic import relies on survive.

- Updated dependencies [8457f05]
  - @trevixal/extension-blocks@1.0.2
  - @trevixal/extension-code-highlight@1.0.2
  - @trevixal/extension-diagram@1.0.2
  - @trevixal/extension-embed@1.0.2
  - @trevixal/extension-emoji@1.0.2
  - @trevixal/extension-export@1.0.2
  - @trevixal/extension-format-code@1.0.2
  - @trevixal/extension-image@1.0.2
  - @trevixal/extension-math@1.0.2
  - @trevixal/extension-security@1.0.2
  - @trevixal/extension-slash-command@1.0.2
  - @trevixal/extension-table@1.0.2
  - @trevixal/extension-track-changes@1.0.2
  - @trevixal/extension-workspace@1.0.2
  - @trevixal/extension-writing@1.0.2

## 1.0.1

### Patch Changes

- dfa4dc8: Stop publishing source maps.

  The maps have no `sourcesContent`, so they name their sources as `../src/*.ts`
  and `src/` is not published: a consumer downloads them and no debugger can
  resolve them. They were 2.7 MB across the 23 packages. `files` now excludes
  `dist/**/*.map`; the maps are still built for local debugging.

- Updated dependencies [dfa4dc8]
  - @trevixal/extension-blocks@1.0.1
  - @trevixal/extension-code-highlight@1.0.1
  - @trevixal/extension-diagram@1.0.1
  - @trevixal/extension-embed@1.0.1
  - @trevixal/extension-emoji@1.0.1
  - @trevixal/extension-export@1.0.1
  - @trevixal/extension-format-code@1.0.1
  - @trevixal/extension-image@1.0.1
  - @trevixal/extension-math@1.0.1
  - @trevixal/extension-security@1.0.1
  - @trevixal/extension-slash-command@1.0.1
  - @trevixal/extension-table@1.0.1
  - @trevixal/extension-track-changes@1.0.1
  - @trevixal/extension-workspace@1.0.1
  - @trevixal/extension-writing@1.0.1

## 1.0.0

### Major Changes

- 12bc7d2: First public release of the Trevixal editor: the framework-agnostic core, the
  chrome and design tokens in `@trevixal/ui`, the assembled `@trevixal/editor-kit`,
  bindings for React, Vue, Svelte, Angular and a web component, and fifteen
  extensions. Published from a clean, dry-run-verified tree; `dist/` only.

### Patch Changes

- Updated dependencies [12bc7d2]
  - @trevixal/core@1.0.0
  - @trevixal/extension-blocks@1.0.0
  - @trevixal/extension-code-highlight@1.0.0
  - @trevixal/extension-diagram@1.0.0
  - @trevixal/extension-embed@1.0.0
  - @trevixal/extension-emoji@1.0.0
  - @trevixal/extension-export@1.0.0
  - @trevixal/extension-format-code@1.0.0
  - @trevixal/extension-image@1.0.0
  - @trevixal/extension-math@1.0.0
  - @trevixal/extension-security@1.0.0
  - @trevixal/extension-slash-command@1.0.0
  - @trevixal/extension-table@1.0.0
  - @trevixal/extension-track-changes@1.0.0
  - @trevixal/extension-workspace@1.0.0
  - @trevixal/extension-writing@1.0.0
  - @trevixal/ui@1.0.0
