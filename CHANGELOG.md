# Changelog

Every release is a [GitHub release](https://github.com/adityabhalsod/trevixal-editor/releases),
and its page carries the package table: what published, and what each one
costs. Per-package history lives alongside each package:

- [@trevixal/core](packages/core/CHANGELOG.md) — the engine
- [@trevixal/ui](packages/ui/CHANGELOG.md) — the chrome
- [@trevixal/editor-kit](packages/editor-kit/CHANGELOG.md) — the assembled editor
- [@trevixal/react](packages/react/CHANGELOG.md) · [vue](packages/vue/CHANGELOG.md) · [svelte](packages/svelte/CHANGELOG.md) · [angular](packages/angular/CHANGELOG.md) · [web-component](packages/web-component/CHANGELOG.md)
- The fifteen extensions, each under `packages/extension-*/CHANGELOG.md`

All packages are versioned and released together, so the version numbers below
apply to every one of them.

## 1.0.2

Ships minified ESM and CJS builds. Identifiers and syntax are minified;
whitespace is kept, because that pass strips the magic comments a dynamic
import relies on and the resulting bundle breaks Next.js builds. The engine
drops 27% on disk and 14% gzipped.

Adds `keywords` to every package, so npm search can find them by what they do
("rich text editor", "docx", "track changes", "mermaid") rather than only by
name.

## 1.0.1

Stops publishing source maps. The maps carried no `sourcesContent`, so they
named their sources as `../src/*.ts` and `src/` is not published: a consumer
downloaded 2.7 MB of maps that no debugger could resolve. They are still built
for local debugging.

## 1.0.0

First public release: the framework-agnostic core, the chrome and design
tokens in `@trevixal/ui`, the assembled `@trevixal/editor-kit`, bindings for
React, Vue, Svelte, Angular and a web component, and fifteen extensions.
