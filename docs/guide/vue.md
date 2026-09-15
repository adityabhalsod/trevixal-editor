# Vue

```sh
npm install @trevixal/core @trevixal/vue @trevixal/ui
```

```vue
<script setup>
import { Schema, defaultNodes, defaultMarks } from '@trevixal/core'
import { useEditor, useEditorSnapshot, EditorContent } from '@trevixal/vue'
import '@trevixal/ui/styles.css'

const editor = useEditor({
  schema: new Schema({ nodes: defaultNodes(), marks: defaultMarks() }),
})
const snapshot = useEditorSnapshot(editor)
</script>

<template>
  <div class="trevixal">
    <button
      :aria-pressed="snapshot?.activeMarks.includes('bold')"
      @mousedown.prevent
      @click="editor?.commands.toggleMark('bold')"
    >Bold</button>
    <EditorContent :editor="editor" placeholder="Write something…" />
  </div>
</template>
```

`useEditor` creates the editor on mount and destroys it on unmount.
`useEditorSnapshot` is a shallow ref that changes only when the state a
toolbar draws changes, typing does not touch it.

## Vue components inside the document

```vue
<EditorContent :editor="editor" :node-views="{ counter: Counter }" />
```

A node view receives `{ node, editor, updateAttrs }` and is rendered with
Vue's `render` into a container the editor owns, so it shares your
application's context and is torn down with the node.

```vue
<script setup>
const props = defineProps(['node', 'editor', 'updateAttrs'])
</script>

<template>
  <button @click="updateAttrs({ count: Number(node.attrs.count) + 1 })">
    {{ node.attrs.count }}
  </button>
</template>
```

The node arrives by value and the component redraws on every change rather
than receiving a reactive proxy: the document is immutable, so a new node *is*
the change.

A runnable version is in `examples/vue`.

## Server rendering

Importing the package touches no DOM, and `useEditor` creates nothing until
the component mounts, so it is safe in an SSR build. See
[Server rendering](./ssr).
