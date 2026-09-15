# @trevixal/e2e

Cross-browser end-to-end tests for the Trevixal editor, driven by Playwright.

The specs in `tests/` drive real pages in `page/`. Those pages load **built**
bundles, not source, so a change to a package is only visible to these tests
once it has been built and the pages rebuilt:

```sh
pnpm --filter @trevixal/<pkg> build   # the package you changed
pnpm --filter @trevixal/e2e build     # re-bundles page/*.js from dist/
```

## Running the browser tests

Locally, run them against the Chrome already on the machine:

```sh
cd packages/e2e && pnpm exec playwright test -c playwright.local.config.ts
```

`playwright.local.config.ts` is a single Chrome project launched with
`--no-sandbox`, because the sandbox cannot open under WSL or inside a
container. Add the usual Playwright flags as needed, a file name to narrow the
run, `--headed` to watch it, `--debug` to step through it:

```sh
pnpm exec playwright test -c playwright.local.config.ts tables.spec.ts --headed
```

Firefox works here too, and is worth running before anything that touches
input or layout. It caught four differences the Chrome run could not:

```sh
pnpm exec playwright install firefox
pnpm exec playwright test --project=firefox
```

WebKit needs two system libraries that are not installed on this machine:

```sh
sudo apt-get install libgstreamer-plugins-bad1.0-0 libavif16
```

A handful of tests skip outside Chromium, each saying why in the skip itself,
`clipboard-read` is a Chromium-only permission, Firefox ignores
`clipboardData` on a constructed `ClipboardEvent`, and `Input.imeSetComposition`
is a Chrome DevTools Protocol command.

The default `playwright.config.ts` is the CI config: chromium, firefox and
webkit, on the browsers Playwright downloads itself. It is what gates a merge,
and it is what `pnpm --filter @trevixal/e2e test:e2e` runs.
