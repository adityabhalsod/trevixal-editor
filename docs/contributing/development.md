# Development

Everything here runs against a checkout of the repository. Workspace packages
link to each other through `workspace:` ranges, so nothing is fetched from
npm. Read [the conventions](#four-conventions-that-cost-time) before your
first commit; each one has cost somebody an afternoon.

## Requirements

| Requirement | Version | Notes |
| --- | --- | --- |
| Node.js | 20 or newer | Developed and measured on 22 |
| pnpm | 11.24.0 | Pinned by `packageManager`; `corepack enable` activates it |
| A browser | Chrome, or Playwright's Chromium, Firefox and WebKit | Only for the browser tests |

## First-time setup

```sh
git clone git@github.com:adityabhalsod/trevixal-editor.git
cd trevixal-editor
corepack enable        # activates pnpm 11.24.0, the pinned version
pnpm install
pnpm build             # tsup: ESM + CJS + d.ts per package; sass for the UI kit; the CDN bundles; the e2e pages
pnpm --filter @trevixal/example-full-editor dev
```

To build your own app against the workspace, add a package under `examples/`
that depends on `"@trevixal/core": "workspace:*"` and the extensions it uses,
exactly as `examples/full-editor/package.json` does.

## Running the unit tests

```sh
pnpm test                                  # every package, through turbo, cached
pnpm test:all                              # the same with no cache and no early exit
pnpm --filter @trevixal/core test          # one package
pnpm --filter @trevixal/core test:watch    # watch; core is the only package with this script
pnpm --filter @trevixal/ui exec vitest run test/toolbar.test.ts   # one file
pnpm coverage                              # v8 coverage, @trevixal/core
```

`pnpm test` is the one to run while the tree is green: it caches per package
and stops at the first failure. The moment anything is red, switch to
`pnpm test:all`: it reports every failing package rather than the first, and
bypasses turbo entirely, which is also what to reach for when you suspect the
cache rather than the code.

Turbo builds each package's dependencies first, so `pnpm test` needs no
`pnpm build` in front of it. A bare `pnpm --filter <pkg> test` does not: it
reads its dependencies' `dist/`, so build them first or you are testing the
last build.

## Formatting your changes

`pnpm lint` and `pnpm lint:fix` are defined, and both fail on a Windows-style
checkout: every file is CRLF on disk and Biome counts that as a format error.

To see what Biome thinks of a file, lint it by name:

```sh
pnpm exec biome lint packages/ui/src/toolbar.ts
```

To format one, pass it through Biome as **stdin** with its line endings
stripped, then put them back. Biome never sees a CR, so it has nothing to
rewrite:

```sh
f=packages/ui/src/toolbar.ts
tr -d '\r' < "$f" | pnpm exec biome check --write --stdin-file-path="$f" \
  | sed 's/$/\r/' > "$f.fmt" && mv "$f.fmt" "$f"
```

`--stdin-file-path` tells Biome which language and which config section
apply, so the file keeps the repo's single quotes, no semicolons and sorted
imports. Confirm with `grep -c $'\r' "$f"` that the line endings survived.

## Four conventions that cost time

1. **Examples and browser tests read `dist/`, not `src/`.** After editing a
   package, `pnpm --filter @trevixal/<pkg> build` (and
   `pnpm --filter @trevixal/e2e build` to re-bundle the test pages), or you
   will keep looking at stale code. `@trevixal/ui` typechecks against core's
   `dist` too.
2. **Line endings make `biome check .` useless on a CRLF checkout.** Lint only
   the files you changed, with `lint`; format through stdin as above. Never
   rewrite line endings: the diff would swamp every review that follows.
   Biome also rejects literal control characters in source, regexes included;
   write `\u00XX` escapes.
3. **`pnpm test` stops at the first failing package, and caches.** While
   anything is red, `pnpm test:all` and `pnpm typecheck:all` report every
   failure and bypass turbo.
4. **Browser tests run from `packages/e2e` against the Chrome on the machine**
   with `playwright.local.config.ts` (one project, `channel: 'chrome'`,
   `--no-sandbox`). `playwright.config.ts` beside it declares Chromium,
   Firefox and WebKit on Playwright's own browsers;
   `pnpm --filter @trevixal/e2e exec playwright install` fetches them.

## Verifying a change

```sh
pnpm --filter @trevixal/<pkg> build
pnpm --filter @trevixal/<pkg> test
pnpm typecheck
pnpm exec biome lint <the files you touched>
cd packages/e2e && pnpm exec playwright test -c playwright.local.config.ts
```

For a regression test, prove it fails against the broken code (revert or
neuter the fix, rebuild, watch it fail, restore) before trusting it. For
anything visual, measure: screenshot and read pixels, or render the real
`.docx`, `.rtf` or PDF.

## Commands

Run from the repository root unless noted.

| Command | What it does |
| --- | --- |
| `pnpm install` | Install and link every workspace package |
| `pnpm build` | Build every package in dependency order through turbo. Under a minute cold, milliseconds when nothing has changed |
| `pnpm --filter @trevixal/<pkg> build` | Build one package (required before the demo or the browser tests see a change) |
| `pnpm test` / `pnpm typecheck` | Every unit suite / `tsc --noEmit` across every package, cached per package |
| `pnpm test:all` / `pnpm typecheck:all` / `pnpm build:all` | The same straight through pnpm with `--no-bail`: every failure reported, no cache |
| `pnpm check:pkg` | The publish gate: publint, arethetypeswrong and a tarball inspection over every publishable package. See [Releasing](./releasing) |
| `pnpm e2e` | `playwright test` with the CI config (Chromium, Firefox, WebKit) |
| `cd packages/e2e && pnpm exec playwright test -c playwright.local.config.ts [spec] [--headed]` | The browser suite on the local Chrome |
| `pnpm --filter @trevixal/e2e build` | Re-bundle `page/*.js` from `dist/` |
| `pnpm --filter @trevixal/example-full-editor dev` | The demo on Vite's dev server; the other examples follow the same pattern |
| `pnpm docs:dev` / `pnpm docs:build` / `pnpm docs:preview` | This site |
| `pnpm bench` / `pnpm size` / `pnpm coverage` | The three measured gates, each failing loudly when it slips |
| `pnpm changeset` | Record a version bump for the next release |

## Quality gates

- **TypeScript** strict, `ES2022`, `verbatimModuleSyntax`, `isolatedModules`,
  `noUnusedLocals` and `noUnusedParameters`, `noImplicitOverride`.
- **Biome** for lint and format: two-space indent, 100 columns, single
  quotes, semicolons as needed, trailing commas.
- **Bundle size budgets** in `scripts/size-budget.mjs`, measured minified and
  gzipped, failing the build when crossed: the core at about 36 kB, the UI kit
  at about 63 kB, the assembled editor at about 180 kB.
- **Continuous integration** runs build, typecheck, tests and the publish
  gate on every pull request (`.github/workflows/ci.yml`).
