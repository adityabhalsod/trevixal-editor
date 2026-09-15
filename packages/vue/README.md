# @trevixal/vue

Vue 3 bindings for the [Trevixal editor](../../README.md).

```sh
npm install @trevixal/core @trevixal/vue
```

## Usage

```vue
<script setup>
import { Schema, defaultNodes, defaultMarks } from '@trevixal/core'
import { useEditor, useEditorSnapshot, EditorContent } from '@trevixal/vue'

const editor = useEditor({
  schema: new Schema({ nodes: defaultNodes(), marks: defaultMarks() }),
})
const snapshot = useEditorSnapshot(editor)
</script>

<template>
  <div class="trevixal">
    <button
      :aria-pressed="snapshot?.activeMarks.includes('bold')"
      @click="editor?.commands.toggleMark('bold')"
    >Bold</button>
    <EditorContent :editor="editor" placeholder="Write something…" />
  </div>
</template>
```

`useEditor` creates the editor on mount and destroys it on unmount.
`useEditorSnapshot` is a shallow ref that changes only when the toolbar state
does, typing does not touch it, because the editor's DOM lives outside Vue's
reactivity ([ADR-0007](../../docs/adr/0007-adapter-contract.md)).

## Vue components inside the document

```vue
<EditorContent :editor="editor" :node-views="{ counter: Counter }" />
```

A node view receives `{ node, editor, updateAttrs }` and is rendered into a
container the editor owns, with Vue's `render`, not a second `createApp`, so
it shares your application's context and is torn down with the node.

```vue
<script setup>
const props = defineProps(['node', 'editor', 'updateAttrs'])
</script>

<template>
  <button @click="updateAttrs({ count: Number(node.attrs.count) + 1 })">
    count: {{ node.attrs.count }}
  </button>
</template>
```

The node arrives by value and the component is redrawn on every change rather
than handed a reactive proxy: the document is immutable, so a new node *is*
the change, and a proxy would invite writing to a node that no longer exists.
Hold no state in a node view, read it from `node`, write it with
`updateAttrs`, and undo will rewind your component along with everything else.

## Server rendering

Importing this package touches no DOM, and `useEditor` creates nothing until
the component mounts, so it is safe in an SSR build. There is a test that
imports it with no DOM present and checks its public symbols are there.

## License

Apache-2.0
