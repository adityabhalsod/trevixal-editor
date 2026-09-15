---
'@trevixal/angular': patch
'@trevixal/core': patch
'@trevixal/editor-kit': patch
'@trevixal/extension-blocks': patch
'@trevixal/extension-code-highlight': patch
'@trevixal/extension-diagram': patch
'@trevixal/extension-embed': patch
'@trevixal/extension-emoji': patch
'@trevixal/extension-export': patch
'@trevixal/extension-format-code': patch
'@trevixal/extension-image': patch
'@trevixal/extension-math': patch
'@trevixal/extension-security': patch
'@trevixal/extension-slash-command': patch
'@trevixal/extension-table': patch
'@trevixal/extension-track-changes': patch
'@trevixal/extension-workspace': patch
'@trevixal/extension-writing': patch
'@trevixal/react': patch
'@trevixal/svelte': patch
'@trevixal/ui': patch
'@trevixal/vue': patch
'@trevixal/web-component': patch
---

Stop publishing source maps.

The maps have no `sourcesContent`, so they name their sources as `../src/*.ts`
and `src/` is not published: a consumer downloads them and no debugger can
resolve them. They were 2.7 MB across the 23 packages. `files` now excludes
`dist/**/*.map`; the maps are still built for local debugging.
