# Next.js example

The whole editor inside a Next.js App Router page, and the one thing you have
to get right to put it there.

```sh
pnpm install
pnpm build                               # the packages resolve through dist/
pnpm --filter @trevixal/example-next dev
```

## The one thing

`'use client'` does not mean "only in the browser". It means "send this
component's code to the browser", Next still renders a client component once
in Node to produce the first HTML. `mountFullEditor` reaches for `window` in
its first statement, so that render would throw, and `next build` would fail.

What actually keeps it off the server is `ssr: false` on a dynamic import, and
the App Router only accepts that inside a client component. So there are three
files rather than one:

| | |
| --- | --- |
| [`app/page.tsx`](app/page.tsx) | A server component. Renders the prose, and the island. |
| [`app/editor-island.tsx`](app/editor-island.tsx) | `'use client'`, and the `ssr: false` dynamic import. |
| [`app/full-editor.tsx`](app/full-editor.tsx) | The mount itself, in a `useEffect`. |

Everything outside the island is still server-rendered: fetch the page as text
and the prose is in it, which a browser test checks rather than claims.

## Deploying to Vercel

This app lives in a pnpm workspace and depends on packages built from source,
so the build has to run from the repository root. [`vercel.json`](vercel.json)
says so:

```json
{
  "framework": "nextjs",
  "installCommand": "cd ../.. && pnpm install --frozen-lockfile",
  "buildCommand": "cd ../.. && pnpm turbo run build --filter=@trevixal/example-next"
}
```

Turbo's `dependsOn: ["^build"]` builds `@trevixal/core`, `@trevixal/ui` and
`@trevixal/editor-kit` first, so the workspace links resolve.

Then, from a checkout:

```sh
npm i -g vercel
cd examples/next
vercel                  # first run: link the project, accept the settings
vercel --prod
```

Two settings matter in the Vercel dashboard if you import the repository
through Git instead:

- **Root Directory**: `examples/next`, with "Include files outside the root
  directory" enabled, or the workspace packages will not be there to build.
- **Node.js Version**, 20 or newer, which this repository requires anyway.

Nothing here needs a runtime environment variable. The editor saves to the
reader's own browser, and the image upload falls back to a data URL when
`POST /api/uploads` is not answered, so the deployment works with no backend
at all. Give it one and pass `uploadEndpoint`, and uploads go there instead.

## License

Apache-2.0
