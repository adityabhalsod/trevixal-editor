import {
  type Editor,
  PAPER_SIZES,
  type PageSetup,
  fillPageTemplate,
  pageDimensions,
  pageSetupOf,
} from '@trevixal/core'

/**
 * Presentation the document does not own: colour themes, the fonts the
 * toolbar offers, host CSS, and the page-versus-continuous view.
 *
 * Everything here writes CSS custom properties or classes onto a root
 * element, never into the document, so switching a theme, loading a font
 * or turning on page mode is not an edit and never enters the history.
 */

/** The three states the theme control offers; `system` follows the OS. */
export type ThemeMode = 'light' | 'dark' | 'system'

/** A named palette: token names without the `--tvx-` prefix, to values. */
export interface ThemePreset {
  readonly name: string
  readonly label: string
  /** Which built-in palette the preset builds on. */
  readonly base: 'light' | 'dark'
  readonly tokens: Readonly<Record<string, string>>
}

/**
 * Presets beyond light and dark. Each names only the tokens it changes; the
 * base palette supplies the rest, so a preset stays correct when the kit
 * adds a token.
 */
export function defaultThemePresets(): readonly ThemePreset[] {
  return [
    {
      name: 'sepia',
      label: 'Sepia',
      base: 'light',
      tokens: {
        'color-bg': '#fbf3e4',
        'color-surface': '#f4e8d0',
        'color-border': '#ddc9a3',
        'color-text': '#3b2f1e',
        'color-text-muted': '#7a6a51',
        'color-accent': '#9a5b2b',
        'color-accent-contrast': '#fdf8ef',
        'color-selection': 'rgba(154, 91, 43, 0.2)',
        'color-code-bg': '#efe2c8',
      },
    },
    {
      name: 'nord',
      label: 'Nord',
      base: 'dark',
      tokens: {
        'color-bg': '#2e3440',
        'color-surface': '#3b4252',
        'color-border': '#4c566a',
        'color-text': '#eceff4',
        'color-text-muted': '#a9b1c1',
        'color-accent': '#88c0d0',
        'color-accent-contrast': '#2e3440',
        'color-selection': 'rgba(136, 192, 208, 0.28)',
        'color-code-bg': '#434c5e',
      },
    },
    {
      name: 'solarized',
      label: 'Solarized',
      base: 'light',
      tokens: {
        'color-bg': '#fdf6e3',
        'color-surface': '#eee8d5',
        'color-border': '#d9d2bd',
        'color-text': '#073642',
        'color-text-muted': '#657b83',
        'color-accent': '#268bd2',
        'color-accent-contrast': '#fdf6e3',
        'color-selection': 'rgba(38, 139, 210, 0.2)',
        'color-code-bg': '#e6dfc8',
      },
    },
    {
      name: 'contrast',
      label: 'High contrast',
      base: 'light',
      tokens: {
        'color-bg': '#ffffff',
        'color-surface': '#ffffff',
        'color-border': '#000000',
        'color-text': '#000000',
        'color-text-muted': '#1a1a1a',
        'color-accent': '#0000cc',
        'color-accent-contrast': '#ffffff',
        'color-selection': 'rgba(0, 0, 204, 0.28)',
        'color-code-bg': '#f0f0f0',
        'color-mark-bg': '#ffff00',
      },
    },
    {
      name: 'midnight',
      label: 'Midnight',
      base: 'dark',
      tokens: {
        'color-bg': '#0b1020',
        'color-surface': '#141c33',
        'color-border': '#26314f',
        'color-text': '#e6ecff',
        'color-text-muted': '#93a0c4',
        'color-accent': '#7aa2f7',
        'color-accent-contrast': '#0b1020',
        'color-selection': 'rgba(122, 162, 247, 0.3)',
        'color-code-bg': '#1a2340',
      },
    },
  ]
}

export interface ThemeControllerOptions {
  /** Elements the theme attributes are written to; the `<html>` root by default. */
  readonly targets?: readonly HTMLElement[]
  readonly presets?: readonly ThemePreset[]
  /** Starting mode; `system` by default. */
  readonly mode?: ThemeMode
  /** Starting preset name, or null for the plain light/dark palette. */
  readonly preset?: string | null
  /** Called after every change, for a host that persists the choice. */
  readonly onChange?: (state: { mode: ThemeMode; preset: string | null }) => void
}

export interface ThemeController {
  readonly mode: ThemeMode
  readonly preset: string | null
  readonly presets: readonly ThemePreset[]
  setMode(mode: ThemeMode): void
  /** Apply a preset by name; `null` returns to the plain palette. */
  setPreset(name: string | null): void
  /** Add (or replace) a preset at runtime, a custom theme from a dialog. */
  register(preset: ThemePreset): void
  /** Whether the rendered theme is currently dark, media query included. */
  isDark(): boolean
  destroy(): void
}

const PRESET_STYLE_ID = 'trevixal-theme-presets'

/** Every token the kit defines carries this prefix. */
const TOKEN_PREFIX = '--tvx-'

/**
 * Presets can be authored by a user through the custom-theme dialog, so the
 * name and every token are treated as untrusted text on the way into CSS.
 * A name that could close the attribute selector, or a value that could close
 * the declaration block, would let a "theme" write rules for the whole page.
 */
const UNSAFE_IN_SELECTOR = /["'\\{}<>\n\r]/
/** Token names are the tail of a custom property: letters, digits, dashes. */
const SAFE_TOKEN_NAME = /^[a-zA-Z0-9-]+$/
/** A value that could end the declaration, the block, or open a comment. */
const UNSAFE_IN_VALUE = /[{}<>;@\\]|\/\*/

/** `--tvx-color-bg: #fff; …` for one preset's tokens; unusable ones are dropped. */
function declarations(preset: ThemePreset): string {
  return Object.entries(preset.tokens)
    .filter(([token, value]) => SAFE_TOKEN_NAME.test(token) && !UNSAFE_IN_VALUE.test(value))
    .map(([token, value]) => `--tvx-${token}: ${value};`)
    .join(' ')
}

/**
 * Own the theme: light/dark/system, plus named presets that layer extra
 * token values on one of the two. Presets are written once into a single
 * `<style>` element keyed by `data-trevixal-preset`, so switching is one
 * attribute change rather than a walk over every custom property.
 */
export function createThemeController(
  document: Document,
  options: ThemeControllerOptions = {},
): ThemeController {
  const presets = new Map<string, ThemePreset>(
    (options.presets ?? defaultThemePresets()).map((preset) => [preset.name, preset]),
  )
  const targets: HTMLElement[] = [...(options.targets ?? [document.documentElement])]
  let mode: ThemeMode = options.mode ?? 'system'
  let current: string | null = options.preset ?? null

  let style = document.getElementById(PRESET_STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = PRESET_STYLE_ID
    document.head.appendChild(style)
  }

  const writeStyles = (): void => {
    const rules: string[] = []
    for (const preset of presets.values()) {
      // The preset is still registered and still selectable; it simply gets
      // no rule, rather than one that escapes its own selector.
      if (UNSAFE_IN_SELECTOR.test(preset.name)) continue
      // Three selectors, not one. The attribute goes on whatever the host
      // nominated, usually <html>, but the kit's stylesheet redefines every
      // token on `.trevixal` itself, and a value set on the element beats one
      // inherited from an ancestor. So a preset that only dresses <html> never
      // reaches the editor: its palette is overwritten by the plain light or
      // dark tokens underneath. Naming `.trevixal` puts the preset on the same
      // element, at two classes to the stylesheet's one.
      const selector = [
        `[data-trevixal-preset="${preset.name}"]`,
        `[data-trevixal-preset="${preset.name}"] .trevixal`,
        `.trevixal[data-trevixal-preset="${preset.name}"]`,
      ].join(', ')
      rules.push(`${selector} { ${declarations(preset)} }`)
    }
    if (style) style.textContent = rules.join('\n')
  }

  const apply = (): void => {
    const preset = current ? presets.get(current) : undefined
    // A preset built on the dark palette forces dark, so its colours are not
    // fighting the light tokens underneath them.
    const effective: ThemeMode = preset ? preset.base : mode
    for (const target of targets) {
      if (effective === 'system') delete target.dataset.trevixalTheme
      else target.dataset.trevixalTheme = effective
      if (preset) target.dataset.trevixalPreset = preset.name
      else delete target.dataset.trevixalPreset
    }
    options.onChange?.({ mode, preset: current })
  }

  writeStyles()
  apply()

  return {
    get mode() {
      return mode
    },
    get preset() {
      return current
    },
    get presets() {
      return [...presets.values()]
    },
    setMode(next) {
      mode = next
      // Choosing light or dark leaves a preset that disagrees behind.
      const preset = current ? presets.get(current) : undefined
      if (preset && next !== 'system' && preset.base !== next) current = null
      apply()
    },
    setPreset(name) {
      current = name && presets.has(name) ? name : null
      apply()
    },
    register(preset) {
      presets.set(preset.name, preset)
      writeStyles()
      if (current === preset.name) apply()
    },
    isDark() {
      const preset = current ? presets.get(current) : undefined
      if (preset) return preset.base === 'dark'
      if (mode !== 'system') return mode === 'dark'
      return document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches === true
    },
    destroy() {
      for (const target of targets) {
        delete target.dataset.trevixalTheme
        delete target.dataset.trevixalPreset
      }
    },
  }
}

// ------------------------------------------------------------ theme files

/** The `format` a theme file declares itself with. */
export const THEME_FILE_FORMAT = 'trevixal-theme'

/** A file that is not a theme, or names no palette to build on. */
export class ThemeFileError extends Error {
  override readonly name = 'ThemeFileError'
}

/** The theme in force as a preset: the named one, or the plain palette with no tokens of its own. */
export function currentTheme(theme: ThemeController): ThemePreset {
  const preset = theme.presets.find((entry) => entry.name === theme.preset)
  if (preset) return preset
  const base = theme.isDark() ? 'dark' : 'light'
  return { name: base, label: base === 'dark' ? 'Dark' : 'Light', base, tokens: {} }
}

/** A theme as a file: JSON another editor imports with {@link parseTheme}. */
export function serializeTheme(preset: ThemePreset): string {
  const { name, label, base, tokens } = preset
  return JSON.stringify(
    { format: THEME_FILE_FORMAT, version: 1, name, label, base, tokens },
    null,
    2,
  )
}

/**
 * Read a theme file. It comes from anywhere, so a token that could break out
 * of its declaration is dropped, as the controller would drop it, and a file
 * that is not a theme at all throws {@link ThemeFileError} rather than
 * applying half a palette.
 */
export function parseTheme(text: string): ThemePreset {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new ThemeFileError('This file is not JSON.')
  }
  if (typeof data !== 'object' || data === null) throw new ThemeFileError('This is not a theme.')
  const file = data as Record<string, unknown>
  if (file.format !== THEME_FILE_FORMAT) throw new ThemeFileError('This is not a Trevixal theme.')
  if (file.base !== 'light' && file.base !== 'dark') {
    throw new ThemeFileError('The theme names no light or dark palette to build on.')
  }
  const tokens: Record<string, string> = {}
  if (typeof file.tokens === 'object' && file.tokens !== null) {
    for (const [token, value] of Object.entries(file.tokens)) {
      if (typeof value !== 'string') continue
      if (SAFE_TOKEN_NAME.test(token) && !UNSAFE_IN_VALUE.test(value)) tokens[token] = value
    }
  }
  const label = typeof file.label === 'string' ? file.label.trim().slice(0, 60) : ''
  const name =
    typeof file.name === 'string' && /^[a-z0-9-]{1,40}$/i.test(file.name) ? file.name : ''
  return { name: name || 'imported', label: label || 'Imported', base: file.base, tokens }
}

/** The palette an export carries: what the tokens resolve to right now. */
export interface ThemeSnapshot {
  /** The ground the palette sits on, decided by how light `color-bg` is. */
  readonly scheme: 'light' | 'dark'
  /** The preset in force, or null for the plain light or dark palette. */
  readonly preset: string | null
  /** Token values keyed by name without the `--tvx-` prefix. */
  readonly tokens: Readonly<Record<string, string>>
}

/**
 * The tokens to read when the engine will not enumerate custom properties.
 * Only the ones an exported document can actually use: the chrome's tokens
 * describe menus and toolbars, which no export carries.
 */
const SNAPSHOT_TOKENS: readonly string[] = [
  'color-bg',
  'color-surface',
  'color-border',
  'color-text',
  'color-text-muted',
  'color-accent',
  'color-accent-contrast',
  'color-selection',
  'color-code-bg',
  'color-mark-bg',
  'color-danger',
  'color-insertion-bg',
  'color-insertion-text',
  'color-deletion-bg',
  'color-deletion-text',
  'font-family',
  'font-family-mono',
]

/**
 * The theme as it is actually rendering on `element`.
 *
 * Read rather than reconstructed from the controller's state: a palette can
 * arrive from a preset, a custom theme, host CSS or the system's dark
 * preference, and only the computed value knows which of those won.
 */
export function readThemeSnapshot(element: Element): ThemeSnapshot {
  const style = element.ownerDocument.defaultView?.getComputedStyle?.(element)
  const tokens: Record<string, string> = {}
  if (style) {
    // Two sources, both needed.
    //
    // Engines list custom properties among the computed entries, which is how
    // a palette picks up tokens nobody here knows the names of. A host's own,
    // a preset's extras. But the list is not a promise of completeness:
    // Firefox was measured returning forty-three names for an editing surface
    // with `--tvx-color-bg` among them on one page and missing on another,
    // while `getPropertyValue` answered correctly on both. Trusting the list
    // alone therefore lost the one token the snapshot cannot do without, and
    // the side-by-side preview came out light beside a Nord editor.
    //
    // So the known palette is always read by name as well, and the listing
    // only adds to it.
    const names = new Set(Array.from(style).filter((name) => name.startsWith(TOKEN_PREFIX)))
    for (const token of SNAPSHOT_TOKENS) names.add(`${TOKEN_PREFIX}${token}`)
    for (const name of names) {
      const value = style.getPropertyValue(name).trim()
      if (value) tokens[name.slice(TOKEN_PREFIX.length)] = value
    }
  }
  return {
    scheme: isDarkColor(tokens['color-bg'] ?? '#ffffff') ? 'dark' : 'light',
    preset: element.closest('[data-trevixal-preset]')?.getAttribute('data-trevixal-preset') || null,
    tokens,
  }
}

/** The tokens the custom-theme dialog lets a user set, in the order shown. */
export const CUSTOM_THEME_TOKENS: readonly { token: string; label: string }[] = [
  { token: 'color-bg', label: 'Page background' },
  { token: 'color-surface', label: 'Chrome background' },
  { token: 'color-text', label: 'Text' },
  { token: 'color-border', label: 'Borders' },
  { token: 'color-accent', label: 'Accent' },
]

export interface CustomThemeInput {
  readonly name?: string
  readonly label?: string
  readonly base?: 'light' | 'dark'
  readonly tokens: Readonly<Record<string, string>>
}

/**
 * Build a preset from a handful of chosen colours, filling in what follows
 * from them: the accent's contrast colour, a muted text colour and a
 * selection wash. Hosts get a usable theme from five inputs.
 */
export function buildCustomTheme(input: CustomThemeInput): ThemePreset {
  const tokens: Record<string, string> = { ...input.tokens }
  const accent = tokens['color-accent']
  const background = tokens['color-bg']
  const base = input.base ?? (background && isDarkColor(background) ? 'dark' : 'light')
  if (accent && !tokens['color-accent-contrast']) {
    tokens['color-accent-contrast'] = isDarkColor(accent) ? '#ffffff' : '#101020'
  }
  if (accent && !tokens['color-selection']) {
    const rgb = parseColor(accent)
    if (rgb) tokens['color-selection'] = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.25)`
  }
  if (tokens['color-text'] && !tokens['color-text-muted']) {
    tokens['color-text-muted'] = mixColors(
      tokens['color-text'],
      background ?? (base === 'dark' ? '#000000' : '#ffffff'),
      0.45,
    )
  }
  if (background && !tokens['color-code-bg']) {
    tokens['color-code-bg'] = mixColors(background, base === 'dark' ? '#ffffff' : '#000000', 0.06)
  }
  return {
    name: input.name ?? 'custom',
    label: input.label ?? 'Custom',
    base,
    tokens,
  }
}

/** `#rgb`, `#rrggbb` and `rgb()` to channels; null for anything else. */
export function parseColor(value: string): [number, number, number] | null {
  const text = value.trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)
  if (hex) {
    const digits = hex[1] as string
    const full =
      digits.length === 3
        ? digits
            .split('')
            .map((digit) => digit + digit)
            .join('')
        : digits
    return [
      Number.parseInt(full.slice(0, 2), 16),
      Number.parseInt(full.slice(2, 4), 16),
      Number.parseInt(full.slice(4, 6), 16),
    ]
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(text)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  return null
}

/** Perceived lightness, so a chosen colour picks its own contrast partner. */
export function isDarkColor(value: string): boolean {
  const rgb = parseColor(value)
  if (!rgb) return false
  const [r, g, b] = rgb
  return (r * 299 + g * 587 + b * 114) / 1000 < 140
}

/** Blend two colours; `amount` is how much of `b` to take. */
export function mixColors(a: string, b: string, amount: number): string {
  const first = parseColor(a)
  const second = parseColor(b)
  if (!first || !second) return a
  const channel = (index: number): number =>
    Math.round((first[index] as number) * (1 - amount) + (second[index] as number) * amount)
  const hex = (value: number): string => value.toString(16).padStart(2, '0')
  return `#${hex(channel(0))}${hex(channel(1))}${hex(channel(2))}`
}

// ------------------------------------------------------------------- fonts

export interface FontDefinition {
  /** Family name used in the document's `font-family`. */
  readonly family: string
  /** Label for the font select; the family name by default. */
  readonly label?: string
  /** CSS stack, e.g. `"Merriweather", Georgia, serif"`. */
  readonly stack?: string
  /** Web font to load: a Google Fonts URL, or any stylesheet. */
  readonly url?: string
  /** Font file to register through `@font-face` instead of a stylesheet. */
  readonly source?: { readonly src: string; readonly weight?: string; readonly style?: string }
}

export interface FontManagerOptions {
  readonly fonts?: readonly FontDefinition[]
  /** Called whenever the list changes, so the toolbar can rebuild its select. */
  readonly onChange?: (fonts: readonly FontDefinition[]) => void
}

export interface FontManager {
  readonly fonts: readonly FontDefinition[]
  /** Register and load a font; returns the definition as stored. */
  add(font: FontDefinition): FontDefinition
  remove(family: string): void
  /** `SelectOption`-shaped entries for the toolbar's font select. */
  options(): readonly { value: string; label: string; previewStyle: string }[]
  destroy(): void
}

const FONT_STYLE_ID = 'trevixal-fonts'

/** Characters that could close a CSS string, a declaration or a block. */
const CSS_UNSAFE = new Set(['"', "'", '\\', '(', ')', '{', '}', '<', '>'])

/**
 * A family name or font URL is host- or user-supplied text going straight
 * into a stylesheet. Escaping would keep it inert but still readable as
 * markup by anything scanning the sheet, so the structural characters are
 * dropped outright. A family name never legitimately contains them.
 */
function cssSafe(value: string, allowSemicolon = false): string {
  return [...value]
    .filter((char) => {
      if (CSS_UNSAFE.has(char)) return false
      if (!allowSemicolon && char === ';') return false
      return (char.codePointAt(0) ?? 0) > 0x1f
    })
    .join('')
    .trim()
}

/**
 * Only `http(s)` and relative URLs may become a `<link>`. `javascript:` and
 * `data:` stylesheets are how a "font" turns into a script or a rule set.
 */
function isSafeStylesheetURL(url: string): boolean {
  // The URL parser ignores leading and embedded control characters, so the
  // scheme has to be read from the same string the browser would see.
  const cleaned = [...url].filter((char) => (char.codePointAt(0) ?? 0) > 0x20).join('')
  if (cleaned.length === 0) return false
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(cleaned)
  if (!scheme) return true // Relative, including protocol-relative.
  const name = (scheme[1] ?? '').toLowerCase()
  return name === 'http' || name === 'https'
}

/**
 * Fonts beyond the built-in stacks: register a family, optionally loading it
 * from a URL or a font file, and the toolbar's font select picks it up. The
 * `<link>`/`@font-face` goes in the page head once per family, so switching
 * documents does not reload it.
 */
export function createFontManager(
  document: Document,
  options: FontManagerOptions = {},
): FontManager {
  const fonts = new Map<string, FontDefinition>()
  const loaded = new Set<string>()
  let style = document.getElementById(FONT_STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = FONT_STYLE_ID
    document.head.appendChild(style)
  }

  /** The `<link>` already loading this family, whoever added it. */
  const linkFor = (family: string): HTMLLinkElement | null => {
    for (const link of document.querySelectorAll<HTMLLinkElement>('link[data-trevixal-font]')) {
      // Matched by property rather than by an interpolated attribute selector,
      // which a family name containing a quote or a bracket would break.
      if (link.dataset.trevixalFont === family) return link
    }
    return null
  }

  const load = (font: FontDefinition): void => {
    if (loaded.has(font.family)) return
    loaded.add(font.family)
    // A second manager on the same page shares the head: re-adding the family
    // would fetch the same stylesheet, and duplicate the same @font-face.
    if (font.url && isSafeStylesheetURL(font.url) && !linkFor(font.family)) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = font.url
      link.dataset.trevixalFont = font.family
      document.head.appendChild(link)
    }
    if (font.source && style) {
      const face = [
        '@font-face {',
        `font-family: "${cssSafe(font.family)}";`,
        `src: url("${cssSafe(font.source.src, true)}");`,
        `font-weight: ${cssSafe(font.source.weight ?? 'normal')};`,
        `font-style: ${cssSafe(font.source.style ?? 'normal')};`,
        'font-display: swap;',
        '}',
      ].join(' ')
      const existing = style.textContent ?? ''
      if (!existing.includes(face)) style.textContent = `${existing}\n${face}`
    }
  }

  const emit = (): void => options.onChange?.([...fonts.values()])
  for (const font of options.fonts ?? []) {
    fonts.set(font.family, font)
    load(font)
  }

  return {
    get fonts() {
      return [...fonts.values()]
    },
    add(font) {
      fonts.set(font.family, font)
      load(font)
      emit()
      return font
    },
    remove(family) {
      if (!fonts.delete(family)) return
      linkFor(family)?.remove()
      loaded.delete(family)
      emit()
    },
    options() {
      return [...fonts.values()].map((font) => ({
        value: font.stack ?? font.family,
        label: font.label ?? font.family,
        previewStyle: `font-family: ${font.stack ?? font.family}`,
      }))
    },
    destroy() {
      for (const link of document.querySelectorAll('link[data-trevixal-font]')) link.remove()
      style?.remove()
    },
  }
}

/** Turn a Google Fonts family name into its stylesheet URL. */
export function googleFontURL(family: string, weights: readonly number[] = [400, 700]): string {
  const name = family.trim().replace(/\s+/g, '+')
  return `https://fonts.googleapis.com/css2?family=${name}:wght@${weights.join(';')}&display=swap`
}

// -------------------------------------------------------------- custom CSS

export interface CustomStyles {
  /** The CSS currently applied. */
  readonly css: string
  set(css: string): void
  clear(): void
  destroy(): void
}

/**
 * Host- or user-supplied CSS, scoped to the editor by prefixing every rule
 * with the surface's selector unless the rule already mentions it. That way
 * a stray `body { display: none }` cannot take the page down with it.
 */
export function createCustomStyles(document: Document, scope = '.trevixal-content'): CustomStyles {
  const element = document.createElement('style')
  element.dataset.trevixalCustomCss = 'true'
  document.head.appendChild(element)
  let css = ''
  return {
    get css() {
      return css
    },
    set(next) {
      css = next
      element.textContent = scopeCSS(next, scope)
    },
    clear() {
      css = ''
      element.textContent = ''
    },
    destroy() {
      element.remove()
    },
  }
}

/**
 * Prefix each top-level selector with `scope`. At-rules keep their block and
 * have their inner rules scoped instead, so `@media` still works. Comments
 * are stripped, and anything unbalanced is dropped rather than guessed at.
 */
export function scopeCSS(css: string, scope: string): string {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: string[] = []
  let index = 0
  while (index < source.length) {
    const brace = source.indexOf('{', index)
    if (brace === -1) break
    // A statement at-rule (`@import`, `@charset`, `@namespace`) ends at a
    // semicolon with no block of its own. Swallowing it into the next rule's
    // prelude would make that rule look like an at-rule and let it out of the
    // scope entirely, so it is dropped and scanning resumes after it.
    const semicolon = source.indexOf(';', index)
    if (semicolon !== -1 && semicolon < brace) {
      index = semicolon + 1
      continue
    }
    const prelude = source.slice(index, brace).trim()
    // Find the block's matching close brace.
    let depth = 0
    let end = brace
    for (; end < source.length; end++) {
      const char = source[end]
      if (char === '{') depth++
      else if (char === '}') {
        depth--
        if (depth === 0) break
      }
    }
    if (depth !== 0) break
    const body = source.slice(brace + 1, end)
    if (prelude.startsWith('@')) {
      if (/^@(media|supports|layer|container)/i.test(prelude)) {
        out.push(`${prelude} { ${scopeCSS(body, scope)} }`)
      } else {
        // @font-face, @keyframes and friends are global by nature.
        out.push(`${prelude} { ${body.trim()} }`)
      }
    } else if (prelude.length > 0) {
      const selectors = splitSelectors(prelude).map((selector) =>
        selector.includes(scope) ? selector : `${scope} ${selector}`,
      )
      out.push(`${selectors.join(', ')} { ${body.trim()} }`)
    }
    index = end + 1
  }
  return out.join('\n')
}

// --------------------------------------------------------------- page mode

export type PageMode = 'continuous' | 'paged'

/** Page sizes the page view offers, in millimetres: the paper the print is set on. */
export const PAGE_SIZES: Readonly<
  Record<string, { width: number; height: number; label: string }>
> = {
  a4: { ...PAPER_SIZES.a4, label: 'A4' },
  letter: { ...PAPER_SIZES.letter, label: 'US Letter' },
  legal: { ...PAPER_SIZES.legal, label: 'US Legal' },
  a5: { ...PAPER_SIZES.a5, label: 'A5' },
}

export interface PageViewOptions {
  /** The element wrapping the editing surface. */
  readonly target: HTMLElement
  readonly size?: keyof typeof PAGE_SIZES | string
  /** Page margin in millimetres. */
  readonly margin?: number
  readonly mode?: PageMode
  readonly onChange?: (mode: PageMode) => void
}

export interface PageView {
  readonly mode: PageMode
  readonly size: string
  setMode(mode: PageMode): void
  setSize(size: string): void
  setMargin(mm: number): void
  /** Set the sheet as a document's page setup says: its paper, margins, header, footer and watermark. */
  setPage(setup: PageSetup): void
  toggle(): void
  destroy(): void
}

/** CSS pixels to a millimetre: the ratio every browser lays pages out at. */
const PX_PER_MM = 96 / 25.4

/**
 * The paginated look of a word processor: the surface becomes a sheet of a
 * chosen size on a grey desk, with a rule where each page break falls, and
 * the page setup's header, footer and watermark on each sheet.
 *
 * It is presentation only: the model has no pages, and the print lays out
 * its own (page-layout.ts). The rules here are a guide, drawn with a
 * repeating background at the page height.
 */
export function createPageView(options: PageViewOptions): PageView {
  const target = options.target
  const document = target.ownerDocument
  let mode: PageMode = options.mode ?? 'continuous'
  let size = options.size ?? 'a4'
  let margin = options.margin ?? 20
  let setup: PageSetup | null = null
  let marks: HTMLElement | null = null
  let frame = 0

  const content = (): HTMLElement | null => target.querySelector<HTMLElement>('.trevixal-content')

  /** The header, footer and watermark drawn on each sheet, over the text and out of its way. */
  const drawMarks = (): void => {
    marks?.remove()
    marks = null
    const surface = content()
    if (mode !== 'paged' || !setup || !surface) return
    if (!setup.header && !setup.footer && !setup.watermark) return
    const { top, bottom } = setup.margins
    const pageHeight = pageDimensions(setup.size, setup.orientation).height * PX_PER_MM
    const pages = Math.max(1, Math.ceil(surface.scrollHeight / pageHeight - 0.01))
    const layer = document.createElement('div')
    layer.className = 'trevixal-page-marks'
    layer.setAttribute('aria-hidden', 'true')
    layer.style.top = `${surface.offsetTop}px`
    layer.style.left = `${surface.offsetLeft}px`
    layer.style.width = `${surface.offsetWidth}px`
    for (let index = 0; index < pages; index++) {
      const at = index * pageHeight
      const mark = (name: string, text: string, y: number, height: number): void => {
        if (!text) return
        const element = document.createElement('div')
        element.className = `trevixal-page-marks__${name}`
        element.textContent = fillPageTemplate(text, index + 1, pages)
        element.style.top = `${y}px`
        element.style.height = `${height}px`
        layer.appendChild(element)
      }
      mark('header', setup.header, at, top * PX_PER_MM)
      mark('footer', setup.footer, at + pageHeight - bottom * PX_PER_MM, bottom * PX_PER_MM)
      mark('watermark', setup.watermark, at, pageHeight)
    }
    // Beside the surface, so both are placed against the same box.
    surface.after(layer)
    marks = layer
  }

  // The marks move with the text: a page more, a narrower window.
  const observer =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          cancelAnimationFrame(frame)
          frame = requestAnimationFrame(drawMarks)
        })

  const apply = (): void => {
    const page = PAGE_SIZES[size]
    const turned = setup?.orientation === 'landscape'
    target.classList.toggle('trevixal-paged', mode === 'paged')
    if (mode === 'paged' && page) {
      target.style.setProperty('--tvx-page-width', `${turned ? page.height : page.width}mm`)
      target.style.setProperty('--tvx-page-height', `${turned ? page.width : page.height}mm`)
    } else if (mode === 'paged') {
      target.style.setProperty('--tvx-page-width', size)
      target.style.setProperty('--tvx-page-height', 'auto')
    }
    if (mode === 'paged') {
      const sides = setup?.margins
      target.style.setProperty(
        '--tvx-page-margin',
        sides ? `${sides.top}mm ${sides.right}mm ${sides.bottom}mm ${sides.left}mm` : `${margin}mm`,
      )
      const surface = content()
      if (surface) observer?.observe(surface)
    } else {
      target.style.removeProperty('--tvx-page-width')
      target.style.removeProperty('--tvx-page-height')
      target.style.removeProperty('--tvx-page-margin')
      observer?.disconnect()
    }
    drawMarks()
    options.onChange?.(mode)
  }
  apply()

  return {
    get mode() {
      return mode
    },
    get size() {
      return size
    },
    setMode(next) {
      mode = next
      apply()
    },
    setSize(next) {
      size = next
      apply()
    },
    setMargin(mm) {
      margin = mm
      apply()
    },
    setPage(next) {
      setup = next
      size = next.size
      apply()
    },
    toggle() {
      mode = mode === 'paged' ? 'continuous' : 'paged'
      apply()
    },
    destroy() {
      observer?.disconnect()
      cancelAnimationFrame(frame)
      marks?.remove()
      target.classList.remove('trevixal-paged')
      target.style.removeProperty('--tvx-page-width')
      target.style.removeProperty('--tvx-page-height')
      target.style.removeProperty('--tvx-page-margin')
    },
  }
}

/** Keep a page view set as the document's page setup says, as it changes. Returns a disposer. */
export function followPageSetup(editor: Editor, view: PageView): () => void {
  let stored: unknown = editor.state.doc.attrs.pageSetup
  view.setPage(pageSetupOf(stored))
  return editor.onTransaction(({ state }) => {
    if (state.doc.attrs.pageSetup === stored) return
    stored = state.doc.attrs.pageSetup
    view.setPage(pageSetupOf(stored))
  })
}

/**
 * Split a selector list on its own commas. A comma inside `:is(...)`,
 * `:not(...)` or an attribute value belongs to that construct, splitting
 * there would scope half a selector and corrupt the other half.
 */
function splitSelectors(prelude: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let start = 0
  for (let index = 0; index < prelude.length; index++) {
    const char = prelude[index]
    if (quote) {
      if (char === '\\') index++
      else if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") quote = char
    else if (char === '(' || char === '[') depth++
    else if (char === ')' || char === ']') depth--
    else if (char === ',' && depth === 0) {
      parts.push(prelude.slice(start, index))
      start = index + 1
    }
  }
  parts.push(prelude.slice(start))
  return parts.map((part) => part.trim()).filter(Boolean)
}
