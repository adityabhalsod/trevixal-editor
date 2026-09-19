---
title: Trevixal vs Tiptap
description: An honest comparison of two rich-text editors, with the numbers measured rather than claimed.
---

# Trevixal vs Tiptap

[Tiptap](https://tiptap.dev) is the editor most people compare this one to, and
the comparison is fair: both are headless, both are extension-driven, both have
adapters for every major framework. If you are choosing between them, this page
is meant to help you choose Tiptap when Tiptap is the right answer.

Tiptap is excellent software with a large user base, a company behind it and
years of production use. Trevixal is new. Weigh that.

## The one real difference

Tiptap is a layer over [ProseMirror](https://prosemirror.net). Trevixal is not
a layer over anything: the document model, the transaction system, the view
and the history are written in this repository.

Everything below follows from that single fact.

## Measured, not claimed

Every number here was measured on 19 September 2026, with the same method on
both sides: bundled with esbuild, minified, gzipped.

| | Trevixal | Tiptap |
| --- | --- | --- |
| Engine + default schema | **27.3 kB** gz | 117.2 kB gz |
| npm packages installed | **1** | 42 |
| ProseMirror packages | **0** | 13 |
| `node_modules` on disk | **592 kB** | 12 MB |
| Runtime dependencies | **none** | ProseMirror |
| License | Apache-2.0 | MIT |

The two sides are `@trevixal/core` against `@tiptap/core` +
`@tiptap/starter-kit` + `@tiptap/pm`: the smallest install on each side that
gives you an editor with a default schema. Reproduce it:

```sh
npm install @tiptap/core @tiptap/starter-kit @tiptap/pm   # added 42 packages, 12 MB
npm install @trevixal/core                                 # added 1 package, 592 kB
```

Adding `@trevixal/ui` for the prebuilt chrome takes the Trevixal side to
1.5 MB and still one package: every `@trevixal/*` dependency is a sibling in
the same release, never a third party.

The size gap is real but it is not the point, and it narrows once you add
extensions to either. The package count is the more honest signal: it is the
number of separately-versioned things that can break you.

## Where Tiptap is the better choice

Genuinely, and often.

**You need it to work today, on a deadline.** Tiptap has been in production for
years across thousands of applications. Trevixal published 1.0.0 in September
2026. Maturity is a feature and Tiptap has more of it.

**You need collaborative editing now.** Tiptap has first-class Yjs integration
and a hosted service behind it. Trevixal has no CRDT layer at all. If two
people must type in one document, stop reading and use Tiptap.

**You want an ecosystem.** Tiptap has years of community extensions, Stack
Overflow answers and blog posts. Trevixal has this documentation and nothing
else yet.

**You are already using ProseMirror.** Your plugins, your schema and your
knowledge all transfer to Tiptap and none of it transfers here.

**You want commercial support.** Tiptap sells it. Trevixal is one person's
Apache-2.0 project with a GitHub issues page.

## Where Trevixal is the better choice

**You want to read the whole stack.** A bug in Tiptap may be a bug in Tiptap, or
in ProseMirror, or in the seam between them. Here there is one repository, one
issue tracker, and a stack trace that lands in code you can read.

**Dependency count is a constraint you actually have.** Regulated environments,
audited supply chains, and vendoring all get simpler at zero runtime
dependencies.

**You want the batteries included.** `@trevixal/editor-kit` mounts a finished
editor with a menubar, toolbar, panels and fifteen extensions in one call, and
that assembly is ordinary code you can copy and cut down. Tiptap deliberately
ships no UI, which is the right call for their audience and more work for
yours.

**You need Word export that matches what you saw.** DOCX and RTF writers and a
dependency-free DOCX reader are in the box, tested by rendering the real files
rather than by reading the markup. In Tiptap this is a paid extension or your
own integration.

**You are on a platform without a bundler.** One `<script>` tag gives you the
whole editor.

## Feature by feature

Both, unless noted.

| | Trevixal | Tiptap |
| --- | --- | --- |
| Headless core | Yes | Yes |
| React, Vue, Svelte, Angular | Yes | Yes |
| Web component | Yes | Community |
| Tables, images, links, lists | Yes | Yes |
| Math, diagrams | Yes | Community |
| Track changes | Yes, in the box | Paid extension |
| DOCX / RTF export | Yes, in the box | Paid extension or your own |
| Document encryption | Yes | No |
| Collaborative editing | **No** | Yes, first-class |
| Prebuilt UI | Yes | No, by design |
| Runtime dependencies | None | ProseMirror |
| Production maturity | **New** | Years |

## The honest summary

If you are shipping to users this quarter and need collaboration, use Tiptap.

If you want an editor whose every line you can read, with no runtime
dependencies and Word export in the box, and you can live with a project that
is new, Trevixal is worth a look.

Try the [live editor](/full-editor) before deciding either way; it runs the
real thing on this page, and no comparison table beats typing in it.
