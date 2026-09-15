# ADR-0007: Adapter contract, the editor DOM lives outside framework reconciliation

**Status:** Accepted, 2026-08-30

## Context

Every framework binding must guarantee that typing never re-renders the host
framework's component tree, while toolbars still update reactively, and
framework components can render *inside* the document.

## Decision

One shared contract, implemented per framework:

1. **Headless creation, mount-time view.** `createEditor` without an element
   is DOM-free, so hooks/composables create the editor eagerly (SSR-safe);
   the `EditorView` attaches in a mount effect and is destroyed on unmount.
2. **Reference-stable snapshots.** `Editor.getSnapshot()` caches per
   transaction, and `Editor.subscribe()` exposes the store contract. The
   same primitive backs React's `useSyncExternalStore`, Vue's shallow refs,
   and Svelte's readable-store contract.
3. **Node views through the core registry.** The core renderer owns widget
   elements (`NodeViewInstance { dom, contentDOM?, update, destroy }`);
   frameworks project components into them, React via portals, Vue/Svelte
   via their own mount APIs. Widgets survive unrelated edits because the
   diff patches by reference.

Angular was deferred on the same reasoning, and has since shipped on a
narrower reading of it. A package exporting `@Component`, `@Directive` or
`@Injectable` does need ng-packagr and Angular's compiler, and a hand-rolled
imitation of partial-Ivy output would indeed be worse than nothing. But the
glue an adapter actually needs from Angular is `signal`, which is an ordinary
function, so `@trevixal/angular` exports ordinary functions
(`createAngularEditor`, `editorSnapshotSignal`), the host owns the decorators,
and the package builds with the same tsup pipeline as every other one. The
signal maps 1:1 onto `subscribe`/`getSnapshot`, exactly as predicted.

This is the same shape as the Svelte binding: no framework import beyond the
one primitive, and the mounting left to the host.

The Svelte binding is a plain action + store (no Svelte import at all), which
makes it compatible with Svelte 4 stores and Svelte 5 runes alike.

## Consequences

- The React test suite asserts the core promise directly: a non-subscribing
  sibling component renders zero additional times while typing.
- All bindings are tiny (< 200 lines each) because the invariants live in
  core, not in each adapter.
