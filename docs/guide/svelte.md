# Svelte

```sh
npm install @trevixal/core @trevixal/svelte @trevixal/ui
```

```svelte
<script>
  import { Schema, defaultNodes, defaultMarks, createEditor } from '@trevixal/core'
  import { trevixalEditor, editorStore } from '@trevixal/svelte'
  import '@trevixal/ui/styles.css'

  const editor = createEditor({
    schema: new Schema({ nodes: defaultNodes(), marks: defaultMarks() }),
  })
  const snapshot = editorStore(editor)
</script>

<div class="trevixal">
  <button
    aria-pressed={$snapshot?.activeMarks.includes('bold')}
    onmousedown={(event) => event.preventDefault()}
    onclick={() => editor.commands.toggleMark('bold')}
  >Bold</button>
  <div use:trevixalEditor={{ editor, placeholder: 'Write something…' }} />
</div>
```

## One build for Svelte 4 and 5

This package **imports nothing from Svelte**. `editorStore` returns an object
with a `subscribe` method, the store contract, which Svelte 4's `$` prefix
and Svelte 5's runes both understand.

## Svelte components inside the document

Because the package imports nothing from Svelte, it takes node-view
*factories* rather than components. Mounting is yours, and it is a dozen
lines:

```ts
// counter-view.svelte.ts, `.svelte.ts`, because `$state` is a rune
import { mount, unmount } from 'svelte'
import Counter from './Counter.svelte'

export function counterView(editor) {
  return (node) => {
    const dom = document.createElement('div')
    dom.contentEditable = 'false'
    const props = $state({ node, updateAttrs: (attrs) => /* dispatch */ })
    const instance = mount(Counter, { target: dom, props })
    return {
      dom,
      update: (next) => ((props.node = next), true),
      destroy: () => unmount(instance),
    }
  }
}
```

A complete, runnable version is in `examples/svelte`.
