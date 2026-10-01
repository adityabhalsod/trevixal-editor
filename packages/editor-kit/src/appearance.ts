/**
 * How the editor looks, as the reader and the document choose it: themes
 * to and from files, the document's own fonts, and the reading settings
 * (reduced motion, a dyslexia-friendly face). The theme controller and the
 * font manager are the chrome's; this is what the View and Format menus do
 * with them.
 */
import type { Editor } from '@trevixal/core'
import {
  type FontManager,
  MOTION_ATTRIBUTE,
  type ThemeController,
  ThemeFileError,
  type ThemePreset,
  currentTheme,
  defaultFontFamilies,
  documentFonts,
  downloadFile,
  openDialog,
  openInfoDialog,
  parseTheme,
  pickFile,
  serializeTheme,
  setDocumentFonts,
  suggestFileName,
} from '@trevixal/ui'
import { CUSTOM_THEME } from './features'

/** Set on the kit's root while the dyslexia-friendly face is on. */
export const READING_ATTRIBUTE = 'data-trevixal-reading'

/** Download the theme in force as a file another editor can import. */
export function exportTheme(theme: ThemeController): void {
  const preset = currentTheme(theme)
  downloadFile(document, {
    name: suggestFileName(`${preset.label} theme`, 'json'),
    mime: 'application/json',
    data: serializeTheme(preset),
  })
}

/**
 * Read a theme file and put it on, in the custom theme's slot so it never
 * replaces a built-in one. Resolves with the theme, for the caller to keep,
 * or null when nothing was chosen or the file was not a theme.
 */
export async function importTheme(theme: ThemeController): Promise<ThemePreset | null> {
  const file = await pickFile(document, '.json,application/json')
  if (!file) return null
  let preset: ThemePreset
  try {
    preset = { ...parseTheme(await file.text()), name: CUSTOM_THEME }
  } catch (error) {
    if (!(error instanceof ThemeFileError)) throw error
    await openInfoDialog({ document, title: 'Not a theme', body: error.message })
    return null
  }
  theme.register(preset)
  theme.setPreset(CUSTOM_THEME)
  return preset
}

/** Format ▸ Document fonts…: the body and heading fonts, kept in the document's styles. */
export async function askDocumentFonts(editor: Editor, fonts: FontManager): Promise<void> {
  const current = documentFonts(editor.state.doc)
  const choices = [
    { value: '', label: 'Default' },
    ...[...defaultFontFamilies(), ...fonts.options()].filter(
      (option, index, all) =>
        option.value !== '' && all.findIndex((other) => other.value === option.value) === index,
    ),
  ]
  const values = await openDialog({
    document,
    title: 'Document fonts',
    submitLabel: 'Apply',
    body: 'Saved with the document, so it looks the same wherever it opens.',
    fields: [
      { name: 'body', label: 'Body', type: 'select', value: current.body ?? '', options: choices },
      {
        name: 'headings',
        label: 'Headings',
        type: 'select',
        value: current.headings ?? '',
        options: choices,
      },
    ],
  })
  editor.view?.focus()
  if (!values) return
  editor.exec(setDocumentFonts({ body: values.body || null, headings: values.headings || null }))
}

/** Put the reading settings on the kit's root, or take them off. */
export function applyReading(
  root: HTMLElement,
  settings: { readonly reducedMotion: boolean; readonly dyslexiaFont: boolean },
): void {
  if (settings.reducedMotion) root.setAttribute(MOTION_ATTRIBUTE, 'reduced')
  else root.removeAttribute(MOTION_ATTRIBUTE)
  if (settings.dyslexiaFont) root.setAttribute(READING_ATTRIBUTE, 'dyslexia')
  else root.removeAttribute(READING_ATTRIBUTE)
}
