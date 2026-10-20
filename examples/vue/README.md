# Vue example

The whole editor, every package the workspace ships, mounted from
`onMounted`. The page is the editor and nothing else, as the
[full-editor example](../full-editor) is.

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

The adapter on its own, `@trevixal/vue` with a toolbar of your own and Vue
components inside the document, is in the [Vue guide](../../docs/guide/vue.md).

## License

Apache-2.0
