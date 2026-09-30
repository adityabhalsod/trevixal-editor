/**
 * The languages the chrome ships in. English is the kit's own; each of the
 * others is a catalogue under `@trevixal/ui/locales/<code>`, loaded by the
 * host when it is wanted, so a page that never switches language never
 * downloads one.
 */

/** A language the chrome can be shown in. */
export interface UILanguage {
  /** BCP 47 code, as `lang` takes it, and the catalogue's file name. */
  readonly code: string
  /** The language's name in itself, as a language menu lists it. */
  readonly name: string
  readonly direction: 'ltr' | 'rtl'
}

export const UI_LANGUAGES: readonly UILanguage[] = [
  { code: 'en', name: 'English', direction: 'ltr' },
  { code: 'de', name: 'Deutsch', direction: 'ltr' },
  { code: 'fr', name: 'Français', direction: 'ltr' },
  { code: 'es', name: 'Español', direction: 'ltr' },
  { code: 'pt', name: 'Português', direction: 'ltr' },
  { code: 'hi', name: 'हिन्दी', direction: 'ltr' },
  { code: 'ja', name: '日本語', direction: 'ltr' },
  { code: 'zh', name: '中文', direction: 'ltr' },
  { code: 'ar', name: 'العربية', direction: 'rtl' },
]

/** The menu entry that switches to a language. */
export function languageItemName(code: string): string {
  return `language-${code}`
}
