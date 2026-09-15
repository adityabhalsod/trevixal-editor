# Solid example

The whole editor in a Solid app, with no adapter package at all.

```sh
pnpm install
pnpm build                                # the packages resolve through dist/
pnpm --filter @trevixal/example-solid dev
```

## The point

There is no `@trevixal/solid`, and this example exists to show that none is
needed. The editor owns a plain DOM element and nothing else, so any framework
that can hand over an element and say when it is going away can host it:

```tsx
function FullEditor() {
  let host!: HTMLDivElement
  onMount(() => {
    const editor = mountFullEditor({ element: host, namespace: 'trevixal:solid' })
    onCleanup(() => editor.destroy())
  })
  return <div ref={host} />
}
```

That is the same shape as the React effect, the Vue `onMounted`, the Svelte
`$effect` and the Angular `afterNextRender`, four adapters' worth of examples
reduced to the two lines that actually differ.

Trevixal does ship adapters for React, Vue, Svelte and Angular. They are worth
having for *node views*, your own components rendered inside the document,
where the framework has to own a subtree of the editor's DOM, and for
snapshot subscriptions that do not re-render on every keystroke. For mounting,
they are a convenience, not a requirement.

## License

Apache-2.0
