import type { Editor } from '@trevixal/core'

/**
 * What hosts should tell their users about spell checking: the editor only
 * flips the `spellcheck` attribute on the editing surface; the browser owns
 * the dictionaries, the languages and the red underline.
 */
export const SPELLCHECK_NOTE =
  'Spell checking is provided by the browser. The editor only turns the surface’s ' +
  'spellcheck attribute on or off; which languages and dictionaries are available, ' +
  'and how misspellings are marked, depend on the browser and operating system.'

/** Turn the browser's spell checking of the editing surface on or off. */
export function setSpellcheck(editor: Editor, enabled: boolean): void {
  editor.setSpellcheck(enabled)
}

/**
 * Whether the surface currently accepts browser spell checking. The
 * attribute's absence means "browser default", which is on; a headless editor
 * has no surface and reports false.
 */
export function isSpellcheckEnabled(editor: Editor): boolean {
  return editor.view ? editor.view.spellcheck : false
}
