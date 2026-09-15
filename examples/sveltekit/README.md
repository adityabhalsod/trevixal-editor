# SvelteKit example

The whole editor on a prerendered SvelteKit route.

```sh
pnpm install
pnpm build                                    # the packages resolve through dist/
pnpm --filter @trevixal/example-sveltekit dev
```

## Two guards, and only one of them matters

[`src/lib/FullEditor.svelte`](src/lib/FullEditor.svelte) has an `$effect`, a
`browser` check, and a dynamic import. The important one is the import.

An effect never runs during a server render, so the *call* is already safe. But
a top-level `import '@trevixal/editor-kit'` is evaluated as the module loads,
which, on a prerendered route, is in Node, during `vite build`. Importing it
inside the effect is what keeps the package off the server altogether; the
static `import type` beside it is erased, so it costs nothing.

```svelte
$effect(() => {
  if (!browser) return
  let editor = null
  void import('@trevixal/editor-kit').then(({ mountFullEditor }) => {
    editor = mountFullEditor({ element: host, namespace: 'trevixal:sveltekit' })
  })
  return () => editor?.destroy()
})
```

The route sets `prerender = true` and the app uses `adapter-static`, so
`pnpm build` writes a folder of HTML to `build/`. A browser test fetches that
HTML and checks the prose is in it and the editor is not, then loads the page
and checks the editor arrives.

## License

Apache-2.0
