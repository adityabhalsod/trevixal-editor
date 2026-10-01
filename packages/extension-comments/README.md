# @trevixal/extension-comments

Comments for the Trevixal editor: threads on a selection, replies, resolving,
`@mentions` from a host-supplied list and a notifications hook, all saved with
the document.

```sh
npm install @trevixal/extension-comments
```

```ts
import { commentMarks, createCommentsPanel } from '@trevixal/extension-comments'

const schema = new Schema({ nodes, marks: { ...defaultMarks(), ...commentMarks() } })
const panel = createCommentsPanel(editor, {
  container: sidebar,
  author: () => 'Ada',
  users: () => [{ id: 'u1', name: 'Sam' }],
  onMention: ({ user, comment }) => notify(user, comment.text),
})
panel.addComment('Is this approved?')
```

The documentation is at <https://trevixal-editor.vercel.app/extensions/comments>.
