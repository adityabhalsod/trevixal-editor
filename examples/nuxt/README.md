# Nuxt example

The whole editor on a Nuxt page that is still prerendered to HTML.

```sh
pnpm install
pnpm build                               # the packages resolve through dist/
pnpm --filter @trevixal/example-nuxt dev
```

## `<ClientOnly>`, and why it is not optional

`onMounted` alone is not enough. It never runs on the server, so the *mount*
is safe, but the component's `import` is evaluated wherever the component is
rendered, and `nuxt generate` renders every route in Node.

`<ClientOnly>` keeps the component out of that render entirely. It also stops
Nuxt expecting the server's HTML and the browser's to agree, which they never
could for an editor the server did not build.

The `#fallback` slot is what ends up in the generated HTML, so it is worth
writing: a blank page there is what "the editor did not load" looks like to
anyone on a slow connection.

```vue
<ClientOnly>
  <FullEditor />
  <template #fallback><p class="loading">Loading the editor…</p></template>
</ClientOnly>
```

`pnpm build` runs `nuxt generate`, which writes `.output/public`. A folder of
static files, deployable anywhere. A browser test fetches the generated HTML
and checks that the prose is in it and the editor is not, then loads the page
and checks the editor arrives.

## License

Apache-2.0
