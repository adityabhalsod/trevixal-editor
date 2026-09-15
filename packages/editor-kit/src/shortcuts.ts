import type { ShortcutAction } from '@trevixal/ui'

/**
 * What the shortcut list can do, as verbs.
 *
 * Deliberately not the handles themselves. Half of what these actions reach
 * for, the command palette, the assembled UI, is built *after* this list is,
 * and only stays safe because every `run` is a closure that fires later. Taking
 * functions rather than objects keeps that true by construction: there is
 * nothing here to read too early.
 */
export interface ShortcutContext {
  flushAutosave(): void
  newDocument(): void
  openDocument(): void
  openFindReplace(): void
  openLinkDialog(): void
  openPalette(): void
  pickEmoji(): void
  printDocument(preview: boolean): void
  protectDocument(): void
  toggleFocusMode(): void
  toggleFullscreen(): void
  toggleSplitEditor(): void
}

/**
 * Every shortcut the chrome advertises, in one list. The manager owns the
 * keys, so what a menu prints is what actually fires, and the user can
 * rebind any of it from Help ▸ Keyboard shortcuts.
 */
export function shortcutActions(context: ShortcutContext): ShortcutAction[] {
  const {
    flushAutosave,
    newDocument,
    openDocument,
    openFindReplace,
    openLinkDialog,
    openPalette,
    pickEmoji,
    printDocument,
    protectDocument,
    toggleFocusMode,
    toggleFullscreen,
    toggleSplitEditor,
  } = context
  return [
    {
      name: 'bold',
      label: 'Bold',
      group: 'Format',
      keys: 'Mod-b',
      run: (e) => e.commands.toggleMark('bold'),
    },
    {
      name: 'italic',
      label: 'Italic',
      group: 'Format',
      keys: 'Mod-i',
      run: (e) => e.commands.toggleMark('italic'),
    },
    {
      name: 'underline',
      label: 'Underline',
      group: 'Format',
      keys: 'Mod-u',
      run: (e) => e.commands.toggleMark('underline'),
    },
    {
      name: 'inlineCode',
      label: 'Inline code',
      group: 'Format',
      keys: 'Mod-e',
      run: (e) => e.commands.toggleMark('code'),
    },
    {
      name: 'clearAllFormatting',
      label: 'Clear all formatting',
      group: 'Format',
      keys: 'Mod-\\',
      run: (e) => e.commands.clearAllFormatting(),
    },
    {
      name: 'undo',
      label: 'Undo',
      group: 'Edit',
      keys: 'Mod-z',
      run: (e) => e.undo(),
    },
    {
      name: 'redo',
      label: 'Redo',
      group: 'Edit',
      keys: 'Mod-Shift-z',
      // The menus have always advertised Ctrl+Y as well; now it really fires.
      alternateKeys: 'Mod-y',
      run: (e) => e.redo(),
    },
    {
      name: 'cut',
      label: 'Cut',
      group: 'Edit',
      keys: 'Mod-x',
      native: true,
      run: () => undefined,
    },
    {
      name: 'copy',
      label: 'Copy',
      group: 'Edit',
      keys: 'Mod-c',
      native: true,
      run: () => undefined,
    },
    {
      name: 'paste',
      label: 'Paste',
      group: 'Edit',
      keys: 'Mod-v',
      native: true,
      run: () => undefined,
    },
    {
      name: 'selectAll',
      label: 'Select all',
      group: 'Edit',
      keys: 'Mod-a',
      native: true,
      run: () => undefined,
    },
    {
      name: 'findReplace',
      label: 'Find and replace',
      group: 'Tools',
      keys: 'Mod-f',
      run: () => openFindReplace(),
    },
    {
      name: 'commandPalette',
      label: 'Command palette',
      group: 'Tools',
      keys: 'Mod-k',
      // The checklist promises both; a second binding is what makes that true
      // rather than a menu label nobody can trigger.
      alternateKeys: 'Mod-Shift-p',
      run: () => openPalette(),
    },
    {
      name: 'insertLink',
      label: 'Insert link',
      group: 'Insert',
      // Not Mod-k: the command palette owns that, and two entries printing
      // the same key means one of them is lying.
      keys: 'Mod-Shift-k',
      run: () => openLinkDialog(),
    },
    {
      name: 'insertEmoji',
      label: 'Emoji picker',
      group: 'Insert',
      keys: 'Mod-Shift-e',
      run: () => void pickEmoji(),
    },
    {
      name: 'insertHardBreak',
      label: 'Line break',
      group: 'Insert',
      keys: 'Shift-Enter',
      native: true,
      run: () => undefined,
    },
    {
      name: 'newDocument',
      label: 'New document',
      group: 'File',
      keys: 'Mod-Alt-n',
      run: () => void newDocument(),
    },
    {
      name: 'saveDocument',
      label: 'Save now',
      group: 'File',
      keys: 'Mod-s',
      run: () => flushAutosave(),
    },
    {
      name: 'openDocument',
      label: 'Open a file',
      group: 'File',
      keys: 'Mod-o',
      run: () => void openDocument(),
    },
    {
      name: 'print',
      label: 'Print',
      group: 'File',
      keys: 'Mod-p',
      run: () => printDocument(false),
    },
    {
      name: 'protectDocument',
      label: 'Protect with password',
      group: 'File',
      keys: 'Mod-Alt-p',
      run: () => void protectDocument(),
    },
    {
      name: 'focusMode',
      label: 'Focus mode',
      group: 'View',
      keys: 'Mod-Shift-f',
      run: () => toggleFocusMode(),
    },
    {
      name: 'fullscreen',
      label: 'Fullscreen',
      group: 'View',
      keys: 'Mod-Shift-Enter',
      run: () => toggleFullscreen(),
    },
    {
      name: 'splitEditor',
      label: 'Split editor',
      group: 'View',
      keys: 'Mod-Alt-s',
      run: () => toggleSplitEditor(),
    },
  ]
}
