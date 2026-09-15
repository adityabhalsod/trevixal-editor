# Releasing

The full account, with the audit tables and the first-publish checklist,
is kept with the maintainers. This page is the summary.

## What ships

Every publishable package's tarball contains `dist/**`, `package.json`,
`README.md` and `LICENSE`, and nothing else. `files` is `["dist"]`
everywhere; there is no `.npmignore`. Source maps ship without
`sourcesContent`, so they name files and map lines but carry no code. The
gate below checks all of that on every pull request.

## The gate

```sh
pnpm build
pnpm check:pkg
```

`scripts/check-packages.mjs` runs three checks over every non-private
package: `publint --strict`, `arethetypeswrong` on a packed tarball (typed
entrypoints only), and an inspection of `npm pack --dry-run` for anything
under `src/` or a `.map` with embedded source. Any problem fails the command,
and CI runs it before anything can merge or publish.

## Versioning

Changesets, configured for public access with `privatePackages` excluded and
`onlyUpdatePeerDependentsWhenOutOfRange` on. Every package peer-depends on
`@trevixal/core` with a caret range, so the workspace releases at **1.0.0**
and stays at `1.x`: at `0.x` a caret range is pinned to the patch and every
core minor would force a major on all 22 dependents.

```sh
pnpm changeset            # pick packages, pick a bump, write a summary
```

## The workflow

On push to `main`, `.github/workflows/release.yml` installs, builds,
typechecks, tests and runs the gate, then hands over to `changesets/action`:
when unreleased changesets exist it opens a `chore: release` pull request;
when that is merged it publishes every package whose version is not yet on
the registry, with npm provenance, and pushes the tags.

`pnpm changeset publish` is the publish command, never `npm publish`: pnpm
rewrites the `workspace:` ranges to real versions in the tarball, and npm
would upload them literally.
