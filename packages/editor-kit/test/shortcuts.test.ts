import { normalizeKeyName } from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { type ShortcutContext, type ShortcutPlatform, shortcutActions } from '../src/shortcuts'

const nothing = (): void => undefined
const verbs: ShortcutContext = {
  flushAutosave: nothing,
  newDocument: nothing,
  openDocument: nothing,
  openFindReplace: nothing,
  openLinkDialog: nothing,
  openPalette: nothing,
  pickEmoji: nothing,
  printDocument: nothing,
  protectDocument: nothing,
  toggleFocusMode: nothing,
  toggleFullscreen: nothing,
  toggleSplitEditor: nothing,
}

const PLATFORMS: readonly ShortcutPlatform[] = [
  { apple: false, firefox: false },
  { apple: false, firefox: true },
  { apple: true, firefox: false },
]

const byName = (platform: ShortcutPlatform) =>
  new Map(shortcutActions(verbs, platform).map((action) => [action.name, action]))

const PARAGRAPH_STYLES = [0, 1, 2, 3, 4, 5, 6].map((level) =>
  level === 0 ? 'styleParagraph' : `styleHeading${level}`,
)

describe('the assembled editor’s shortcuts', () => {
  it('gives the emoji picker and the paragraph styles a first key AltGr cannot take', () => {
    // Off a Mac, Ctrl+Alt is AltGr on most keyboards but the US one: Ctrl+Alt+E
    // types é or € there, and Ctrl+Alt+2 types ², @ or ~.
    const actions = byName({ apple: false, firefox: false })
    for (const name of ['insertEmoji', ...PARAGRAPH_STYLES]) {
      expect(actions.get(name)?.keys, name).not.toMatch(/Alt/)
    }
    // Google Docs' keys stay on as the second binding.
    expect(actions.get('styleHeading2')?.keys).toBe('Mod-Shift-2')
    expect(actions.get('styleHeading2')?.alternateKeys).toBe('Mod-Alt-2')
  })

  it('keeps ⌘⌥ on a Mac, and offers no ⌘⇧ digit the Mac takes for screenshots', () => {
    const actions = byName({ apple: true, firefox: false })
    for (const name of PARAGRAPH_STYLES) {
      expect(actions.get(name)?.keys, name).toMatch(/^Mod-Alt-\d$/)
      expect(actions.get(name)?.alternateKeys ?? null, name).toBeNull()
    }
  })

  it('offers no Ctrl+Shift+P in Firefox, which keeps it for a private window', () => {
    expect(
      byName({ apple: false, firefox: true }).get('commandPalette')?.alternateKeys ?? null,
    ).toBeNull()
    expect(byName({ apple: false, firefox: false }).get('commandPalette')?.alternateKeys).toBe(
      'Mod-Shift-p',
    )
  })

  it('binds no key to two actions, on any platform', () => {
    for (const platform of PLATFORMS) {
      const seen = new Map<string, string>()
      for (const action of shortcutActions(verbs, platform)) {
        for (const keys of [action.keys, action.alternateKeys]) {
          if (!keys) continue
          const key = normalizeKeyName(keys, platform.apple)
          expect(seen.get(key), `${keys} is ${seen.get(key)} and ${action.name}`).toBeUndefined()
          seen.set(key, action.name)
        }
      }
    }
  })
})
