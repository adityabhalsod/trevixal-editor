# React example

Two pages in one. At the top, the whole editor, every package the workspace
ships, mounted from a `useEffect`. Underneath, the adapter on its own: an
editor, a toolbar bound to a snapshot, and a counter proving that typing does
not re-render the React tree.

```sh
pnpm install
pnpm build                                # the packages resolve through dist/
pnpm --filter @trevixal/example-react dev
```

## The whole editor, in an effect

```tsx
const host = useRef<HTMLDivElement>(null)

useEffect(() => {
  const editor = mountFullEditor({ element: host.current, namespace: 'trevixal:react' })
  return () => editor.destroy()
}, [])
```

That is the entire integration. The cleanup is not decoration: React's strict
mode mounts, unmounts and mounts again before the page is interactive, so a
`destroy` that left anything behind would give you two editors fighting over
one autosave draft, in development only, which is the worst way to meet a
bug. See [`@trevixal/editor-kit`](../../packages/editor-kit) for what is
being mounted, and [Next.js](../next) for the same call in an App Router app.

## The adapter on its own

Type into the editor and watch the two counters. **Bystander renders** stays
at 1 no matter how much you type. The editor's DOM lives outside React's
reconciliation, so a keystroke is not a render.

**Toolbar renders** ticks when the state it draws changes, and not otherwise.
The first keystroke counts, because it flips `canUndo` from false to true and
the toolbar shows that; the next nine do not. Move the caret in and out of
bold text and it counts again.

That second part is newer than it looks. The snapshot used to be a fresh
object per transaction, so this counter climbed once per keystroke, eleven
renders for ten characters, measured. `getSnapshot` now returns the same
object while nothing a toolbar would draw differently has changed, which is
why it reads 2.

That is the whole adapter contract, in one page. See
[ADR-0007](../../docs/adr/0007-adapter-contract.md) for why it is built this
way, and [`@trevixal/react`](../../packages/react) for node views, which let
React components render *inside* the document.

## License

Apache-2.0
