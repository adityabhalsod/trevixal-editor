# Contributing to Trevixal

Thanks for wanting to help. Bug reports, small fixes, docs improvements and new
extensions are all welcome, and none of them need permission first.

If you only have a minute, [starring the repo](https://github.com/adityabhalsod/trevixal-editor)
helps more than you might think: it is how other developers find the project.

## Ways to help

- **Report a bug.** Use the [bug report form](https://github.com/adityabhalsod/trevixal-editor/issues/new?template=bug_report.yml).
  A reproduction in the [live editor](https://trevixal-editor.vercel.app/full-editor)
  or a few lines of code makes it much faster to fix.
- **Ask for a feature.** Use the [feature request form](https://github.com/adityabhalsod/trevixal-editor/issues/new?template=feature_request.yml)
  and describe the problem first, then the solution you have in mind.
- **Ask a question.** [Discussions](https://github.com/adityabhalsod/trevixal-editor/discussions)
  is the place for anything that is not a bug or a specific request.
- **Fix something.** Pick an open issue, or send a pull request for anything
  you ran into. For a large change, open an issue first so we can agree on
  the shape before you spend the time.
- **Write an extension.** `npm create @trevixal/extension <package-name>`
  scaffolds one; see [Adding an extension](https://trevixal-editor.vercel.app/extending/adding)
  in the docs.

## Getting set up

You need Node.js 20 or newer. pnpm is pinned by `packageManager`, so
`corepack enable` gives you the right version.

```sh
git clone https://github.com/adityabhalsod/trevixal-editor.git
cd trevixal-editor
corepack enable
pnpm install
pnpm build
pnpm --filter @trevixal/example-full-editor dev
```

The examples and browser tests read each package's `dist/`, not `src/`, so
rebuild the package you changed (`pnpm --filter @trevixal/<pkg> build`) before
you look at it in the demo.

## Before you open a pull request

```sh
pnpm --filter @trevixal/<pkg> build
pnpm --filter @trevixal/<pkg> test
pnpm typecheck
pnpm exec biome lint <the files you touched>
```

- Add or update a test for the behaviour you changed. For a regression test,
  check that it fails without your fix.
- Keep the zero-runtime-dependency rule: published packages must not gain a
  `dependencies` entry outside the `@trevixal` scope.
- If your change is user-facing, add a line under an Unreleased heading in
  [CHANGELOG.md](CHANGELOG.md).
- Keep pull requests focused on one change. Several small ones are easier to
  review than one large one.

The full guide, including the browser test suite and the conventions that
trip people up, is in [docs/contributing/development.md](docs/contributing/development.md),
with testing details in [docs/contributing/testing.md](docs/contributing/testing.md).

## Code of conduct

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions are licensed under the
[Apache-2.0 License](LICENSE).
