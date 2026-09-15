# Vue example

Two pages in one. At the top, the whole editor, every package the workspace
ships, mounted from `onMounted`. Underneath, the adapter on its own: an
editor, a toolbar bound to a snapshot, and a **Vue component rendered inside
the document**.

```sh
pnpm install
pnpm build                              # the packages resolve through dist/
pnpm --filter @trevixal/example-vue dev
```

## The whole editor, in onMounted

```vue
const host = useTemplateRef<HTMLDivElement>('host')
let editor: FullEditor | null = null

onMounted(() => { editor = mountFullEditor({ element: host.value, namespace: 'trevixal:vue' }) })
onBeforeUnmount(() => editor?.destroy())
```

`onMounted` rather than `setup`, because `setup` also runs on the server and
the mount reaches for `window` immediately. See
[`@trevixal/editor-kit`](../../packages/editor-kit) for what is being
mounted, and [Nuxt](../nuxt) for the same call on a prerendered page.

## The adapter on its own

The counter block is `src/Counter.vue`. Click it and the number goes up;
press **Undo** and it goes back down, which is the thing worth noticing. The
component holds no state of its own: it reads the count from the node it was
drawn for and writes changes as ordinary editor transactions, so the document
is the single source of truth and history works on it like anything else.

A node view that kept its own count would look identical until the first undo.

## License

Apache-2.0
