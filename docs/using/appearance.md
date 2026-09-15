# Appearance

Everything under the *View* menu that changes how the editor looks, and how
the page around it follows.

## Themes

*View > Theme* offers Light, Dark, Match the system, and five presets:
**Sepia, Nord, Solarized, High contrast, Midnight**.

- **Custom theme...** builds a preset from five colours: page background,
  chrome background, text, borders and accent.
- **Custom CSS...** adds your own rules, scoped so they cannot leak out of the
  editor.
- **Add a font...** loads a web font on demand.

In the assembled editor the page around the editor follows the editor's
theme, so a dark theme is not a dark box on a white page. The browser's own
furniture follows too: scrollbars, form controls and the canvas behind them
read `color-scheme` from the palette, so a dark editor does not sit beside a
bright white scrollbar.

## Modes

| Mode | What it does |
| --- | --- |
| Focus mode | Dims everything but the paragraph you are in |
| Typewriter scrolling | Keeps the caret line in place while you type |
| Fullscreen | The editor takes the whole screen |
| Page view | Paginated A4, US Letter, US Legal or A5 with margins, or continuous |
| Width | Narrow, normal, wide or full |
| Read-only mode | Locks the surface without a password; see [Protecting a document](./protection) |

## Toolbar layout

Drag a toolbar group by its grip, or pick it up with `Space` and move it with
the arrow keys. *Help > Customize toolbar...* hides and shows groups. The order
is remembered between sessions.

## For developers

Every colour and size is a CSS custom property, so overriding the look of the
editor in your own app needs no build step:

```css
.trevixal { --tvx-color-accent: rebeccapurple; }
```

The tokens, the dark-mode attribute, the preset attribute and the two rules
the kit holds itself to for the sake of exports are on
[Styling and theming](../reference/styling).
