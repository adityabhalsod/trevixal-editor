# The whole editor

Every other page here builds an editor out of parts. This one hands you the
finished thing.

`@trevixal/editor-kit` is the assembled editor: menubar, toolbar, status bar,
dialogs, sidebar panels, a side-by-side preview and a second editing surface,
with tables, images, media, equations, diagrams, track changes, writing
checks, autosave, themes, encryption and a document workspace already wired to
each other.

```sh
npm install @trevixal/editor-kit @trevixal/core @trevixal/ui
```

```ts
import { mountFullEditor } from '@trevixal/editor-kit'
import '@trevixal/ui/styles.css'
import '@trevixal/editor-kit/styles.css'

const editor = mountFullEditor({ element: document.querySelector('#app') })
```

That is the whole integration. It is [running on this site](../full-editor),
mounted from the CDN build, if you want to see what it hands you before
installing anything.

## Where to call it

It reaches for `window` and `document` in its first statement, so it belongs
wherever your framework runs browser-only code, never during a server render.

::: code-group

```tsx [React]
const host = useRef<HTMLDivElement>(null)

useEffect(() => {
  const editor = mountFullEditor({ element: host.current, namespace: 'my-app' })
  return () => editor.destroy()
}, [])

return <div ref={host} />
```

```vue [Vue]
const host = useTemplateRef<HTMLDivElement>('host')
let editor: FullEditor | null = null

onMounted(() => { editor = mountFullEditor({ element: host.value, namespace: 'my-app' }) })
onBeforeUnmount(() => editor?.destroy())
```

```svelte [Svelte]
let host: HTMLDivElement

$effect(() => {
  const editor = mountFullEditor({ element: host, namespace: 'my-app' })
  return () => editor.destroy()
})
```

```ts [Angular]
afterNextRender(() => {
  this.editor = mountFullEditor({ element: this.host().nativeElement, namespace: 'my-app' })
})
inject(DestroyRef).onDestroy(() => this.editor?.destroy())
```

:::

`destroy()` is not decoration. React's strict mode mounts, unmounts and mounts
again before the page is interactive, so an incomplete teardown gives you two
editors fighting over one autosave draft, in development only, which is the
worst way to meet a bug.

## Meta-frameworks

On Next.js, Nuxt and SvelteKit the component is also rendered on the server,
and that is where the import itself becomes the problem rather than the call.

| | What keeps it off the server |
| --- | --- |
| **Next.js** | `dynamic(() => import('./editor'), { ssr: false })`, inside a `'use client'` component. The App Router refuses `ssr: false` in a server component |
| **Nuxt** | `<ClientOnly>`, which keeps the component out of the render rather than just the call |
| **SvelteKit** | A dynamic `import()` inside the effect; a top-level one is evaluated while the route is prerendered |

Each has a runnable example in the repository: `examples/next`, which also
carries its Vercel configuration, `examples/nuxt`, and `examples/sveltekit`.

## From a script tag

A page with no bundler gets a second build: one file that defines
`window.TrevixalKit`, everything inlined.

```html
<link rel="stylesheet" href="https://unpkg.com/@trevixal/ui/styles.css" />
<link rel="stylesheet" href="https://unpkg.com/@trevixal/editor-kit/styles.css" />
<script src="https://unpkg.com/@trevixal/editor-kit"></script>

<div id="app"></div>
<script>
  TrevixalKit.mountFullEditor({ element: document.querySelector('#app') })
</script>
```

That page is [running on this site](../drop-in), unchanged, from the released
packages.

It is 180 kB gzipped, because it has to carry the core, the chrome and all
fifteen extensions in one request. With a bundler, import the package and let
it tree-shake instead. The import line is the only difference.

## Configuration

Only what a host actually decides. Which extensions, which menus, which panels
are not options, because a build with half of them is not what this package is
for.

```ts
mountFullEditor({
  element,                         // required; it is emptied first
  content: myDocument,             // default: a tour of every block type
  placeholder: 'Write something…',
  author: 'Ada',                   // whose name goes on a tracked change
  namespace: 'my-app',             // the localStorage prefix for everything it saves
  uploadEndpoint: '/api/uploads',  // or null to skip the request and use a data URL
  maxImageBytes: 5 * 1024 * 1024,
  fetchLinkTitle: (href) => myServer.titleOf(href), // a pasted address takes its page's title
  checkLinkURL: null,              // Check links asks web addresses by default; null keeps it offline
  plantumlServer: 'https://uml.example.com/plantuml', // or null; PlantUML's source goes to this server
  autoLockMinutes: 10,             // a protected document locks when left alone; 0 for never
  writingProvider: myProvider,     // Tools > Writing assistant; rules in the page by default, null for none
  users: [{ id: 'u1', name: 'Sam' }], // who a comment can @mention
  onMention: ({ user, comment }) => notify(user, comment.text),
  thesaurus: (word) => myThesaurus(word), // right-click synonyms; a small built-in list by default
  languages: {                     // View > Language; each catalogue loads when it is picked
    de: () => import('@trevixal/ui/locales/de').then((module) => module.default),
    ar: () => import('@trevixal/ui/locales/ar').then((module) => module.default),
  },
  heading: 'My editor',            // or null for none
  paragraphs: ['<b>Some</b> copy.'],
  showSerializedHTML: false,
  onChange: (editor) => save(editor.getJSON()),
})
```

The returned handle carries the `editor`, the `layout` it built, the `ui` it
mounted, and a `destroy()` that takes all three back.

Call it once per page: the autosave draft, the workspace store and the command
palette are singletons by nature, and a second mount sharing a namespace would
have two editors writing over one another's saves.

## Working offline

The editor saves to local storage as you type, so it keeps working when the
network goes. To open with no network at all, the page itself has to be
cached too, and that is the host's job: a service worker is the page's, not
the editor's. The [full-editor example](https://github.com/adityabhalsod/trevixal-editor/tree/main/examples/full-editor)
shows one way. Its build writes a service worker that caches every file it
made, and a manifest makes the page installable as an app.

## Most of it, but not all

Nothing in the package is privileged. It imports the same public API you
have. If you want this editor minus three features, read `src/mount.ts`, copy
it, and delete what you do not want. That is a few hundred lines of ordinary
code, and it is a supported way to use this project rather than a fork of
anything.

Or start from [Getting started](./getting-started) and add extensions one at a
time, which is what every other page here describes.
