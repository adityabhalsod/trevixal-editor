import {
  BUILT_IN_STYLES,
  type Command,
  type Editor,
  type EditorNode,
  type NamedStyle,
  documentStyle,
  documentThemeOf,
  parseStoredStyles,
  safeFontFamily,
  setDocumentAttrs,
  storedStylesAttr,
} from '@trevixal/core'
import {
  type ThemeController,
  type ThemeFileError,
  type ThemePreset,
  parseTheme,
  serializeTheme,
} from './theming'

/**
 * The document's own look, saved with it: a theme, and the fonts of its body
 * and headings. Unlike the reader's theme and the fonts the toolbar offers,
 * these travel in the file, so the document looks the same wherever it opens.
 */

/** The preset a document's theme is registered under while that document is open. */
export const DOCUMENT_THEME = 'document'

/** The theme saved with a document, checked as a theme file is, or null. */
export function documentTheme(doc: EditorNode): ThemePreset | null {
  const saved = documentThemeOf(doc.attrs.theme)
  if (!saved) return null
  try {
    return { ...parseTheme(saved), name: DOCUMENT_THEME, label: 'Document theme' }
  } catch (error) {
    // A theme hand-edited into nonsense leaves the reader's own theme on.
    if ((error as ThemeFileError).name === 'ThemeFileError') return null
    throw error
  }
}

/** Save a theme with the document, or with null, stop saving one. */
export function setDocumentTheme(preset: ThemePreset | null): Command {
  return setDocumentAttrs({ theme: preset ? serializeTheme(preset) : null })
}

/**
 * Show each document in the theme saved with it, switched to as it opens;
 * a document with none brings back the theme that was on before. Choosing a
 * theme from the menu still wins while the document stays open. Returns a
 * disposer.
 */
export function bindDocumentTheme(editor: Editor, theme: ThemeController): () => void {
  let applied: unknown = null
  let own = theme.preset === DOCUMENT_THEME ? null : theme.preset
  const sync = (): void => {
    const saved = editor.state.doc.attrs.theme
    if (saved === applied) return
    applied = saved
    const preset = documentTheme(editor.state.doc)
    if (preset) {
      if (theme.preset !== DOCUMENT_THEME) own = theme.preset
      theme.register(preset)
      theme.setPreset(DOCUMENT_THEME)
    } else if (theme.preset === DOCUMENT_THEME) theme.setPreset(own)
  }
  sync()
  return editor.on('update', sync)
}

/** A document's body and heading fonts, as CSS font stacks; null is the default. */
export interface DocumentFonts {
  readonly body: string | null
  readonly headings: string | null
}

const HEADING_STYLES = ['heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6']

/** The fonts a document sets: Normal's for the body, Heading 1's for the headings. */
export function documentFonts(doc: EditorNode): DocumentFonts {
  return {
    body: documentStyle(doc, 'normal')?.props.fontFamily ?? null,
    headings: documentStyle(doc, 'heading1')?.props.fontFamily ?? null,
  }
}

/**
 * Set the document's fonts, in its named styles: the body font is Normal's,
 * the heading font every Heading style's. Each style keeps the rest of what
 * it sets, and the change is one undoable step.
 */
export function setDocumentFonts(fonts: DocumentFonts): Command {
  return (state) => {
    const stored = parseStoredStyles(state.doc.attrs.styles)
    const styles = [...stored]
    for (const id of ['normal', ...HEADING_STYLES]) {
      const family = safeFontFamily(id === 'normal' ? fonts.body : fonts.headings)
      const at = styles.findIndex((style) => style.id === id)
      const current = styles[at] ?? BUILT_IN_STYLES.find((style) => style.id === id)
      if (!current) continue
      const { fontFamily: _dropped, ...rest } = current.props
      const next: NamedStyle = {
        ...current,
        props: family ? { ...rest, fontFamily: family } : rest,
      }
      if (at < 0) styles.push(next)
      else styles[at] = next
    }
    return setDocumentAttrs({ styles: storedStylesAttr(styles) })(state)
  }
}
