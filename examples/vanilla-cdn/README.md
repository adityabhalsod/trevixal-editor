# No build step

[![Watch the Trevixal demo on YouTube](https://img.youtube.com/vi/PF8VchgEAeU/maxresdefault.jpg)](https://youtu.be/PF8VchgEAeU)

▶ [Watch the 1-minute demo on YouTube](https://youtu.be/PF8VchgEAeU)

The whole editor from a script tag.

```sh
pnpm install
pnpm build                                       # fills vendor/ from dist/
pnpm --filter @trevixal/example-vanilla-cdn dev
```

## Two tags and a div

```html
<link rel="stylesheet" href="https://unpkg.com/@trevixal/ui/styles.css" />
<link rel="stylesheet" href="https://unpkg.com/@trevixal/editor-kit/styles.css" />
<script src="https://unpkg.com/@trevixal/editor-kit"></script>

<div id="app"></div>
<script>
  TrevixalKit.mountFullEditor({ element: document.querySelector('#app') })
</script>
```

That is the same call every other example makes (menubar, toolbar, panels,
side-by-side preview, autosave, themes, encryption, all of it) with the
import replaced by a global. There is no npm, no bundler and no build step.

`index.html` is the whole example, and almost all of it is the two comments
explaining those tags.

## The chrome's languages

View ▸ Language needs the catalogues too, as it does in every other example.
They ship as ES modules, one per language, so the page names them and imports
each only when it is picked:

```js
TrevixalKit.mountFullEditor({
  element: document.querySelector('#app'),
  languages: Object.fromEntries(
    ['de', 'fr', 'es', 'pt', 'hi', 'ja', 'zh', 'ar'].map((code) => [
      code,
      () =>
        import(`https://unpkg.com/@trevixal/ui/dist/locales/${code}.js`).then(
          (module) => module.default,
        ),
    ]),
  ),
})
```

A browser imports no module into a page opened from disk, so there the menus
stay in English.

## What it costs

Measured by `pnpm size`, minified and gzipped:

| | | |
| --- | ---: | --- |
| `@trevixal/editor-kit` CDN build | **180 kB** | Everything, in one file |
| `<trevixal-editor>` CDN build | **29 kB** | The engine, with the chrome left to you |

The kit has to inline the core, the chrome and all fifteen extensions, because
a page with no build step cannot fetch them separately. If that is more than
the page needs, `<trevixal-editor>` is the other end of the same trade: a
custom element that parses its own HTML children, raises `trevixal-change`,
and hands you `element.editor` to drive. A sixth of the bytes, and a toolbar
you write. The docs playground runs it from the same kind of script tag; see
[the vanilla guide](../../docs/guide/vanilla.md).

An app that already has a bundler should use neither. `import { mountFullEditor }
from '@trevixal/editor-kit'` gets tree-shaken ES modules, and the import is the
only line that differs.

## License

Apache-2.0
