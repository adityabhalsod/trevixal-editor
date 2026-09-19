# @trevixal/svelte

<!-- generated: header -->

[![CI](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@trevixal/svelte.svg)](https://www.npmjs.com/package/@trevixal/svelte)
[![types](https://img.shields.io/npm/types/@trevixal/svelte.svg)](https://www.npmjs.com/package/@trevixal/svelte)
[![license](https://img.shields.io/npm/l/@trevixal/svelte.svg)](https://github.com/adityabhalsod/trevixal-editor/blob/main/LICENSE)

[Documentation](https://trevixal-editor.vercel.app) · [Live editor](https://trevixal-editor.vercel.app/full-editor) · [Changelog](https://github.com/adityabhalsod/trevixal-editor/blob/main/packages/svelte/CHANGELOG.md) · [Issues](https://github.com/adityabhalsod/trevixal-editor/issues)

[![The Trevixal editor](https://trevixal-editor.vercel.app/media/editor.png)](https://trevixal-editor.vercel.app/full-editor)

## Features

- A `use:trevixalEditor` action, idiomatic rather than a wrapper component
- Snapshots follow the store contract, so `$snapshot` just works
- **0.3 kB** minified and gzipped, with TypeScript types in the package

<!-- /generated: header -->

Svelte bindings for the [Trevixal editor](https://github.com/adityabhalsod/trevixal-editor/blob/main/README.md): an action and a
store.

```sh
npm install @trevixal/core @trevixal/svelte
```

## Usage

```svelte
<script>
  import { Schema, defaultNodes, defaultMarks, createEditor } from '@trevixal/core'
  import { trevixalEditor, editorStore } from '@trevixal/svelte'

  const editor = createEditor({
    schema: new Schema({ nodes: defaultNodes(), marks: defaultMarks() }),
  })
  const snapshot = editorStore(editor)
</script>

<div class="trevixal">
  <button
    aria-pressed={$snapshot?.activeMarks.includes('bold')}
    on:click={() => editor.commands.toggleMark('bold')}
  >Bold</button>
  <div use:trevixalEditor={{ editor, placeholder: 'Write something…' }} />
</div>
```

## Svelte components inside the document

The action takes node-view *factories* rather than components, because this
package imports nothing from Svelte, which is what lets one build serve both
versions. Mounting is therefore yours, and it is a handful of lines:

```ts
import { mount, unmount } from 'svelte'
import Counter from './Counter.svelte'

function counterView(editor) {
  return (node) => {
    const dom = document.createElement('div')
    dom.contentEditable = 'false' // the component owns what is inside it
    const props = $state({ node, updateAttrs: (attrs) => /* dispatch a transaction */ })
    const instance = mount(Counter, { target: dom, props })
    return { dom, update: (next) => ((props.node = next), true), destroy: () => unmount(instance) }
  }
}

<div use:trevixalEditor={{ editor, nodeViews: { counter: counterView(editor) } }} />
```

`$state` is a rune, so a factory that uses one has to live in a `.svelte.ts`
file. `packages/svelte/test/counter-view.svelte.ts` is a complete working
example, with the test that drives it beside it.

Hold no state in a node view, read it from `node`, write it with a
transaction, and undo will rewind your component along with the document.

## Svelte 4 and Svelte 5

This package imports nothing from Svelte itself. `editorStore` returns an
object with a `subscribe` method, the store contract, which Svelte 4's `$`
prefix and Svelte 5's runes both understand, so one build serves both.

`trevixalEditor` is a plain action: it attaches the view on mount and destroys
it on `destroy()`. The editor's DOM is outside Svelte's control by design
([ADR-0007](https://github.com/adityabhalsod/trevixal-editor/blob/main/docs/adr/0007-adapter-contract.md)).

## License

Apache-2.0
