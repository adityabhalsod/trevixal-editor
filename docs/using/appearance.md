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
- **Import theme...** reads a theme file, and **Export theme...** downloads
  the theme in force as one. A theme file is plain JSON: a light or dark
  base, and the colours it changes. A colour that could break out of the
  stylesheet is dropped as the file is read. An imported or custom theme is
  kept for the next visit.
- **Save theme with document** keeps the theme in force inside the document.
  The document opens in it wherever it goes, and the reader's own theme comes
  back with the next document. A theme picked from the menu still wins while
  that document stays open.
- **Add a font...** loads a web font on demand.

*Format > Document fonts...* picks the body font and the heading font. They
are saved in the document's own styles (Normal and the six Heading styles),
so they travel in the file and show in every download.

## Language

*View > Language* shows the menus and the toolbar in English, Deutsch,
Français, Español, Português, हिन्दी, 日本語, 中文 or العربية. Each language is
named in itself, so you can find yours in any of them. Arabic mirrors the
chrome: the menus open from the right and the toolbar runs right to left,
while the document keeps its own direction. The choice is remembered. Dialogs
and the status line are still in English.

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
| Fullscreen | The page alone, centred, across the whole screen: no menus, sidebar or banners. The slash menu, the palette and dialogs still open over it. `Esc` leaves |
| Page view | The document's paper (*File > Page setup*), turned and with its margins, its header, footer and watermark on each sheet; or continuous. See [Page setup and printing](./files#page-setup-and-printing) |
| Width | Narrow, normal, wide or full |
| Read-only mode | Locks the surface without a password; see [Protecting a document](./protection) |

## Reading settings

- **Reduce motion** stops transitions and animations, and makes jumps to a
  heading or a reference instant instead of smooth. The operating system's
  own reduced-motion setting already does the scrolling part.
- **Dyslexia-friendly font** sets the text in OpenDyslexic, Lexend or Atkinson
  Hyperlegible, whichever is installed, with wider letter, word and line
  spacing. Nothing is downloaded for it; without one of those fonts it falls
  back to Verdana. Code keeps its monospace, and the document's own fonts come
  back when it is turned off.

Both are remembered between sessions.

## On a phone

On a touch screen narrower than 40rem, the toolbar becomes a bar along the
bottom of the screen, where a thumb reaches it. It is one row that scrolls
sideways, with buttons big enough for a finger, and it rides on top of the
on-screen keyboard rather than hiding under it. The page keeps the caret
clear of the bar.

Selected text still gets its formatting bubble above the selection. The
handles that resize a picture or a table are larger on a touch screen, and
dragging one resizes instead of scrolling the page.

## Toolbar layout

*View > Toolbar* switches between four presets: **Minimal** (text style,
lists, undo), **Writing**, **Developer** (code and tools) and **Full**.

Drag a toolbar group by its grip, or pick it up with `Space` and move it with
the arrow keys. *Help > Customize toolbar...* hides and shows groups, and
applies at once, without reloading the page. The order is remembered between
sessions.

## For developers

Every colour and size is a CSS custom property, so overriding the look of the
editor in your own app needs no build step:

```css
.trevixal { --tvx-color-accent: rebeccapurple; }
```

The tokens, the dark-mode attribute, the preset attribute and the two rules
the kit holds itself to for the sake of exports are on
[Styling and theming](../reference/styling).
