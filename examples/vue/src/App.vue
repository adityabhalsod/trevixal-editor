<script setup lang="ts">
import { Schema, defaultMarks, defaultNodes } from '@trevixal/core'
import { EditorContent, useEditor, useEditorSnapshot } from '@trevixal/vue'
import Counter from './Counter.vue'
import FullEditor from './FullEditor.vue'

// A node type of our own, rendered by a Vue component. This is the one thing
// the assembled editor cannot show you: what your own components look like
// inside the document.
const schema = new Schema({
  nodes: {
    ...defaultNodes(),
    counter: {
      group: 'block',
      atom: true,
      attrs: { count: { default: 0 } },
      toHTML: (node) => ({ tag: 'div', attrs: { 'data-counter': String(node.attrs.count) } }),
    },
  },
  marks: defaultMarks(),
})

const editor = useEditor({
  schema,
  ariaLabel: 'Vue adapter example',
  content: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'The block below is a Vue component.' }] },
      { type: 'counter', attrs: { count: 0 } },
      { type: 'paragraph', content: [{ type: 'text', text: 'Click it, then press undo.' }] },
    ],
  },
})
const snapshot = useEditorSnapshot(editor)

const marks = [
  { name: 'bold', label: 'B' },
  { name: 'italic', label: 'I' },
  { name: 'underline', label: 'U' },
]
</script>

<template>
  <FullEditor />
  <main class="trevixal">
    <section class="panel">
      <h2>The adapter on its own</h2>
      <p class="note">
        The same engine with none of the chrome, bound by <code>@trevixal/vue</code>. The counter is
        a Vue component rendered inside the document. It keeps no state. The number lives in the
        document, so undo takes it back.
      </p>
      <div class="bar">
        <button
          v-for="mark in marks"
          :key="mark.name"
          type="button"
          :aria-pressed="snapshot?.activeMarks.includes(mark.name) ?? false"
          @mousedown.prevent
          @click="editor?.commands.toggleMark(mark.name)"
        >{{ mark.label }}</button>
        <button type="button" @mousedown.prevent @click="editor?.undo()">Undo</button>
      </div>
      <EditorContent :editor="editor" :node-views="{ counter: Counter }" placeholder="Write something…" />
    </section>
  </main>
</template>
