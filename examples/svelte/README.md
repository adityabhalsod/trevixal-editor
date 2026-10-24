# Svelte example

[![Watch the Trevixal demo on YouTube](https://img.youtube.com/vi/PF8VchgEAeU/maxresdefault.jpg)](https://youtu.be/PF8VchgEAeU)

▶ [Watch the 1-minute demo on YouTube](https://youtu.be/PF8VchgEAeU)

The whole editor, every package the workspace ships, mounted from a
`$effect`. The page is the editor and nothing else, as the
[full-editor example](../full-editor) is.

```sh
pnpm install
pnpm build                                 # the packages resolve through dist/
pnpm --filter @trevixal/example-svelte dev
```

## The whole editor, in an effect

```svelte
let host: HTMLDivElement

$effect(() => {
  const editor = mountFullEditor({ element: host, namespace: 'trevixal:svelte' })
  return () => editor.destroy()
})
```

See [`@trevixal/editor-kit`](../../packages/editor-kit) for what is being
mounted, and [SvelteKit](../sveltekit) for the same call on a prerendered
route: where the import has to move inside the effect as well.

The adapter on its own, `@trevixal/svelte` with a toolbar of your own and
Svelte components inside the document, is in the
[Svelte guide](../../docs/guide/svelte.md).

## License

Apache-2.0
