# Shared example styles

The page around the editor, factored out of the seven examples that were each
carrying a copy of it.

| File | Loaded by | What it holds |
| --- | --- | --- |
| [`page.css`](page.css) | react · vue · svelte · solid · sveltekit · next · nuxt | The host page: body margin and colours, the measure `main` sits in, the panel rule and the muted prose beneath |
| [`panel.css`](panel.css) | react · vue · svelte | The adapter panel those three mount below the assembled editor, its toolbar, its render counter and its editing surface |
| [`loading.css`](loading.css) | next · nuxt | The placeholder shown while a client-only island fetches the editor's chunk |

An example loads only what its own page uses, which is why solid and sveltekit
take `page.css` and not `panel.css`, they show the editor and a paragraph, not
an adapter, and why angular keeps a `body` rule of its own rather than import
five rules to use one.

None of this styles the editor. `@trevixal/ui` dresses everything inside the
editor root and `@trevixal/editor-kit` dresses the shell around it; both ship
their own stylesheet and every example imports them.

## License

Apache-2.0
