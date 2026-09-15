# Svelte example

Two pages in one. At the top, the whole editor, every package the workspace
ships, mounted from a `$effect`. Underneath, the adapter on its own: an
editor, a toolbar bound to the snapshot store, and a **Svelte component
rendered inside the document**.

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

## The adapter on its own

The counter block is `src/Counter.svelte`, mounted by
`src/counter-view.svelte.ts`. Click it and the number goes up; press **Undo**
and it goes back down, which is the thing worth noticing. The component holds
no state of its own: it reads the count from the node it was drawn for and
writes changes as ordinary editor transactions.

`@trevixal/svelte` takes node-view *factories* rather than components, because
the package imports nothing from Svelte. That is what lets one build serve
Svelte 4 stores and Svelte 5 runes alike. Mounting is a dozen lines and they
are all in `counter-view.svelte.ts`, ready to copy.

## License

Apache-2.0
