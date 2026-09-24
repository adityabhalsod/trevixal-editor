# Examples

Eleven apps, all running the same editor. Each one holds configuration and its
framework's own wiring, nothing else. The editor itself is
[`@trevixal/editor-kit`](../packages/editor-kit), so what differs between
these directories is the four or five lines where a framework says "here is an
element, and here is when it goes away", or, in two of them, no framework at
all.

Every one of them is driven by the browser suite in
[`packages/e2e/tests/examples.spec.ts`](../packages/e2e/tests/examples.spec.ts):
mounted, typed into, and checked for the one thing it exists to show. A README
that says an example works is a claim; that file is the check.

```sh
pnpm install
pnpm build                                    # the packages resolve through dist/
pnpm --filter @trevixal/example-<name> dev
```

## The whole editor, once per framework

| Example | The hook | What it also shows |
| --- | --- | --- |
| [`full-editor`](full-editor) | none, plain DOM | The whole thing with no framework at all, in five lines |
| [`react`](react) | `useEffect` | Strict mode mounting twice, and a teardown that survives it. Plus the adapter alone: a toolbar that does not re-render while you type |
| [`next`](next) | `useEffect` behind `ssr: false` | The App Router client boundary, and a Vercel deployment |
| [`vue`](vue) | `onMounted` | A Vue component rendered *inside* the document |
| [`nuxt`](nuxt) | `onMounted` inside `<ClientOnly>` | A prerendered page with a client-only island |
| [`svelte`](svelte) | `$effect` | A Svelte component rendered inside the document |
| [`sveltekit`](sveltekit) | `$effect` + a dynamic import | Why the *import*, not the call, is what has to move |
| [`angular`](angular) | `afterNextRender` | Zoneless, outside change detection |
| [`solid`](solid) | `onMount` | That no adapter package is needed to mount it |

## And twice with no framework at all

| Example | The hook | What it also shows |
| --- | --- | --- |
| [`vanilla-cdn`](vanilla-cdn) | none, a `<script>` tag | The kit from a global, with no npm and no bundler |
| [`ssr`](ssr) | `DOMContentLoaded` | Node renders the words to HTML; the browser builds the editor over them |

## The document they open

All eleven open the same tour, the kit's
[`initialContent`](../packages/editor-kit/src/content.ts), so a feature added
to it shows in every app at once. Each finished feature a document can hold
is in its text, from captions, an index and right-to-left text to named
styles, drop caps, task assignees and a table inside a table. The ones that
belong to the whole document, or that work as you type, it names with their
menus. The [full editor's README](full-editor/README.md#the-document) lists
them.

## Shared between them

[`shared/`](shared) holds the page styles the examples had a copy of each.
Nothing framework-specific lives there, and no example loads a rule it does
not use. See [its README](shared/README.md).

## License

Apache-2.0
