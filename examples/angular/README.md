# Angular example

The whole editor: every package the workspace ships, mounted from
`afterNextRender`, and nothing else on the page.

```sh
pnpm install
pnpm build                                  # the packages resolve through dist/
pnpm --filter @trevixal/example-angular dev
```

## The whole editor, after render

```ts
afterNextRender(() => {
  this.editor = mountFullEditor({ element: this.host().nativeElement, namespace: 'trevixal:angular' })
})
inject(DestroyRef).onDestroy(() => this.editor?.destroy())
```

`afterNextRender` rather than a constructor or `ngOnInit`, because it is the
one hook Angular guarantees never runs on the server, and it runs outside
change detection, which is the point: nothing the editor does afterwards
passes through Angular at all. See
[`@trevixal/editor-kit`](../../packages/editor-kit) for what is being
mounted.

## Where the adapter went

This example used to carry a second panel below the editor: a bare surface
bound by [`@trevixal/angular`](../../packages/angular), with counters showing
that neither typing nor the editor's own DOM ever reached Angular's change
detector. It was removed on 2026-09-14. The page is the editor now.

The adapter itself is unchanged and still tested, and the same argument is
made by the [React](../react), [Vue](../vue) and [Svelte](../svelte) examples,
which keep their adapter panels. If you want the Angular version of it, the
component is in this file's git history:
`git show c6cba56:examples/angular/src/app.component.ts`.

## No compiler in the adapter, a compiler in the app

[`@trevixal/angular`](../../packages/angular) exports ordinary functions and
builds with the same `tsup` pipeline as every other package here. The glue it
needs from Angular is `signal`, which is just a function. A *component*,
though, has a template, and a template needs Angular's compiler. That is what
this example adds, and it is why it carries a toolchain none of the other
examples do. The mount itself needs none of it:

- `@analogjs/vite-plugin-angular` runs the Angular compiler inside Vite.
- It loads `@angular/build` at runtime, which brings `lmdb` and
  `msgpackr-extract`. Their install scripts are approved in
  `pnpm-workspace.yaml` alongside the three that were already there; without
  that, pnpm treats the unapproved build as an error, and because the check
  runs ahead of `pnpm exec`, *every* command in the workspace fails rather
  than just this example's.
- Angular 22's compiler requires TypeScript 6, where the rest of the
  repository is on 5.9. Each package gets its own in a pnpm workspace, so this
  one pins `~6.0.0` and nothing else moves. Two consequences show up in
  `tsconfig.app.json`: emit has to be turned back on, because here the Angular
  compiler *is* the build rather than tsup, and a side-effect import of a
  stylesheet needs a declaration that 5.x did not ask for.

This example was deferred for a long time on the grounds that the toolchain
could not be installed here at all. That was true when it was written and is
not any more; what remained was the three points above.

## License

Apache-2.0
