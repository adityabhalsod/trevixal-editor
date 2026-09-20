<script lang="ts">
import { Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { editorStore, trevixalEditor } from '@trevixal/svelte'
import FullEditor from './FullEditor.svelte'
import { counterView } from './counter-view.svelte'

// A node type of our own, rendered by a Svelte component. This is the one
// thing the assembled editor cannot show you: what your own components look
// like inside the document.
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

const editor = createEditor({
  schema,
  ariaLabel: 'Svelte adapter example',
  content: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'The block below is a Svelte component.' }],
      },
      { type: 'counter', attrs: { count: 0 } },
      { type: 'paragraph', content: [{ type: 'text', text: 'Click it, then press undo.' }] },
    ],
  },
})

const snapshot = editorStore(editor)
const marks = [
  { name: 'bold', label: 'B' },
  { name: 'italic', label: 'I' },
  { name: 'underline', label: 'U' },
]
</script>

<FullEditor />
<main class="trevixal">
  <section class="panel">
    <h2>The adapter on its own</h2>
    <p class="note">
      The same engine with none of the chrome, bound by <code>@trevixal/svelte</code>. The counter
      is a Svelte component rendered inside the document. It keeps no state. The number lives in
      the document, so undo takes it back.
    </p>
    <div class="bar">
      {#each marks as mark (mark.name)}
        <button
          type="button"
          aria-pressed={$snapshot?.activeMarks.includes(mark.name) ?? false}
          onmousedown={(event) => event.preventDefault()}
          onclick={() => editor.commands.toggleMark(mark.name)}
        >{mark.label}</button>
      {/each}
      <button type="button" onmousedown={(e) => e.preventDefault()} onclick={() => editor.undo()}>Undo</button>
    </div>
    <div
      use:trevixalEditor={{
        editor,
        placeholder: 'Write something…',
        nodeViews: { counter: counterView(editor) },
      }}
    ></div>
  </section>
</main>
