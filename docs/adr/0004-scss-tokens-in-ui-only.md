# ADR-0004: SCSS design tokens live in @trevixal/ui only

**Status:** Accepted, 2026-08-30

## Context

The brief requires a pure, SSR-safe, dependency-free core and a themable UI
kit (light/dark via CSS custom properties, no CSS framework).

## Decision

- `@trevixal/core` ships zero styles and zero DOM imports.
- All styling lives in `@trevixal/ui` as SCSS, compiled to a single
  `dist/styles.css`. SCSS is a build-time tool only. Every themable value is
  emitted as a `--tvx-*` CSS custom property, so consumers theme at runtime
  without SCSS.
- Theme resolution: light by default, dark via `prefers-color-scheme`, with an
  explicit `data-trevixal-theme="light|dark"` attribute always winning.
- Raw SCSS partials are published under `@trevixal/ui/scss/*` for consumers
  who want to compose tokens into their own build.

## Consequences

- Core's bundle budget (≤45 kB min+gzip) is unaffected by UI work.
- The UI kit is skinnable via CSS variables alone; SCSS never leaks into the
  runtime contract.
