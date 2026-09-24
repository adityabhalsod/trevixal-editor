import type { Command, Editor, EditorNode, EditorSnapshot, Path } from '@trevixal/core'
import {
  type Control,
  NO_LIST_NUMBERING,
  type SelectOption,
  applyBlockFormat,
  blockFormatValue,
  createColorControl,
  createListNumberingControl,
  createSelectControl,
  createTableGridControl,
  currentListNumbering,
  defaultBlockFormats,
  defaultFontFamilies,
  defaultFontSizes,
  defaultListNumberings,
  definedListNumberings,
} from './controls'
import {
  ARIA_SUFFIX,
  type Messages,
  TOOLBAR_GROUP_KEY,
  TOOLBAR_KEY,
  type Translator,
  createTranslator,
} from './i18n'
import { type IconName, createIcon } from './icons'
import { openDefineListNumbering } from './list-dialogs'
import {
  type QuickInsertItem,
  type ToolUsageTracker,
  createQuickInsertControl,
  createRecentToolsControl,
} from './quick-tools'
import { type ShortcutLabels, formatShortcut, parseShortcut } from './shortcuts'
import { type TableDesignCommands, createTableDesignControl } from './table-design'
import { applyGroupOrder, bindGroupReorder, groupElements, groupOrder } from './toolbar-reorder'

/**
 * A single toolbar control. Open for extension: register your own items
 * without touching the toolbar implementation (open/closed principle).
 */
export interface ToolbarItem {
  readonly name: string
  /** Visible label, used when no icon is given and as the tooltip fallback. */
  readonly label: string
  readonly icon?: IconName
  /** Accessible name; falls back to `label`. */
  readonly ariaLabel?: string
  /** Appended to the tooltip, e.g. `"Ctrl+B"`. */
  readonly shortcut?: string
  /**
   * `event` is the click that triggered the item. Items that distinguish a
   * double click (its `detail` is 2) can read it; most ignore it.
   */
  readonly run: (editor: Editor, event: MouseEvent) => void
  readonly isActive?: (snapshot: EditorSnapshot) => boolean
  readonly isEnabled?: (snapshot: EditorSnapshot) => boolean
  /**
   * Extra attributes set on every refresh, for state the document does not
   * hold, such as whether the format painter is currently armed.
   */
  readonly dataset?: () => Readonly<Record<string, string | null>>
}

/** A non-button control (select, color picker, table grid) built on demand. */
export interface ToolbarControl {
  readonly name: string
  readonly create: (editor: Editor, document: Document) => Control
}

/** A visually separated run of controls. */
export interface ToolbarGroup {
  readonly name: string
  /** Human-readable name, spoken by the grip when the groups can be rearranged. */
  readonly label?: string
  readonly items: readonly (ToolbarItem | ToolbarControl)[]
}

/** What the Quick access group holds; each part is left out without its option. */
export interface QuickAccessOptions {
  /** What the "+" offers, collected each time it opens. */
  readonly insertItems?: () => readonly QuickInsertItem[]
  /** Records the tools used, and shows the pinned and recent ones beside the "+". */
  readonly tracker?: ToolUsageTracker
}

/** The Quick access group's name and label, for translations and saved layouts. */
export const QUICK_ACCESS_GROUP = { name: 'quick', label: 'Quick access' } as const

export interface ToolbarOptions {
  /** Flat item list (legacy shape) or grouped rows. */
  readonly items?: readonly (ToolbarItem | ToolbarControl)[]
  readonly groups?: readonly ToolbarGroup[]
  readonly ariaLabel?: string
  /** Block formats offered by the format select. */
  readonly blockFormats?: readonly SelectOption[]
  readonly fontFamilies?: readonly SelectOption[]
  readonly fontSizes?: readonly SelectOption[]
  readonly lineHeights?: readonly SelectOption[]
  readonly paragraphSpacings?: readonly SelectOption[]
  readonly letterSpacings?: readonly SelectOption[]
  /** Called by the link button; supply a dialog. */
  readonly onLink?: (editor: Editor) => void
  /** Called by the image button; supply a picker or dialog. */
  readonly onImage?: (editor: Editor) => void
  /** Called by the table grid with the chosen dimensions. */
  readonly onInsertTable?: (editor: Editor, rows: number, cols: number) => void
  /**
   * Word's Table Design tab, as a dropdown beside the table grid; left out
   * without it. `createEditorUI` supplies it from its `tableCommands`.
   */
  readonly tableDesign?: TableDesignCommands
  /**
   * Items to add to the default groups, keyed by group name. Prefer this
   * over rebuilding `groups`: the built-in link, image and table controls
   * close over this options object, so a hand-built list that omits it
   * silently produces dead buttons.
   */
  /**
   * Translations, keyed `toolbar.<item name>` and `toolbar.group.<name>`,
   * with `.aria` for an accessible name that differs from the label. Anything
   * missing keeps its English; see {@link defaultMessages}.
   */
  readonly messages?: Messages
  readonly extraItems?: Readonly<Record<string, readonly (ToolbarItem | ToolbarControl)[]>>
  /**
   * Group names to render, in this order. Omit for every group. Lets a host
   * pick categories, `groupNames: ['marks', 'lists']` for a compact bar.
   */
  readonly groupNames?: readonly string[]
  /**
   * Give every group a grip that drags it to a new place in the bar, the
   * Office toolbar convention. From the keyboard, Space on the grip picks the
   * group up and the arrow keys move it. Each new order is reported through
   * `onReorder`.
   */
  readonly reorderable?: boolean
  /**
   * The order to show the groups in, by name, typically what `onReorder`
   * last reported. Unlike `groupNames` it hides nothing: groups it does not
   * mention follow in their default order, and names that match no group are
   * ignored, so a remembered order survives a group being added or removed.
   */
  readonly groupOrder?: readonly string[]
  /** Called with the new group order whenever the user rearranges the bar. */
  readonly onReorder?: (order: readonly string[]) => void
  /**
   * Advanced-block commands, supplied by the host so this package does not
   * depend on `@trevixal/extension-blocks`. Pass `blockUICommands()` from
   * that package. The `blocks` group is skipped when this is absent.
   */
  readonly blockCommands?: BlockCommands
  /**
   * JSON/XML formatting, from `@trevixal/extension-format-code`. The matching
   * buttons are skipped when absent.
   */
  readonly codeFormatCommands?: CodeFormatCommands
  /** Copy the code block at the selection; from the code-highlight package. */
  readonly onCopyCode?: (editor: Editor) => void
  /** Opens the find-and-replace bar. */
  readonly onFindReplace?: (editor: Editor) => void
  /** Toggles the table-of-contents panel. */
  readonly onToggleTableOfContents?: (editor: Editor) => void
  /** Toggles the document-outline panel. */
  readonly onToggleOutline?: (editor: Editor) => void
  /** Opens the command palette. */
  readonly onCommandPalette?: (editor: Editor) => void
  /** Toggles focus mode. */
  readonly onToggleFocusMode?: (editor: Editor) => void
  /** Toggles fullscreen. */
  readonly onToggleFullscreen?: (editor: Editor) => void
  /** Arms the format painter; supplied by a host holding a FormatPainter. */
  readonly onFormatPainter?: (editor: Editor, event: MouseEvent) => void
  /**
   * Current painter state, for the button's appearance and tooltip. Armed
   * state lives in the painter rather than the document, so the toolbar
   * cannot read it from a snapshot.
   */
  readonly formatPainterState?: () => FormatPainterState
  /** Opens a special-character picker. */
  readonly onSpecialCharacter?: (editor: Editor) => void
  /** Opens an emoji picker. */
  readonly onEmoji?: (editor: Editor) => void
  /** Shows the word-count readout. */
  readonly onWordCount?: (editor: Editor) => void
  /**
   * A Quick access group at the start of the bar, like Word's toolbar of the
   * same name: a "+" that searches everything insertable, and a tray of the
   * tools this user pinned or used last.
   */
  readonly quickAccess?: QuickAccessOptions
  /**
   * What a shortcut manager binds, as `manager.labels()` reports it: each
   * tooltip then names the key that really fires, or none. Without it a
   * tooltip names only the keys the engine itself answers (Bold, Undo…).
   */
  readonly shortcutLabels?: ShortcutLabels
}

/**
 * Advanced-block commands the toolbar drives. Every member is optional: a
 * host wiring only callouts gets only the callout control, never a dead
 * button for the rest.
 */
export interface BlockCommands {
  readonly insertCallout?: (variant: string) => Command
  readonly insertToggleBlock?: Command
  readonly insertColumns?: (count: number) => Command
  readonly insertCard?: Command
  readonly insertTimeline?: Command
  readonly insertPageBreak?: Command
  readonly insertBadge?: (label: string, tone: string) => Command
  readonly insertButton?: (label: string, href: string) => Command
  readonly insertFootnote?: Command
  readonly insertAnchor?: (id: string) => Command
  // Containers and citations; entries for the ones a host omits are dropped.
  readonly insertTabs?: (count: number) => Command
  readonly addTab?: Command
  readonly removeTab?: Command
  readonly insertAccordion?: (count: number) => Command
  readonly addAccordionItem?: Command
  readonly insertCitation?: (text: string) => Command
  readonly insertReferenceList?: Command
  readonly renumberCitations?: Command
  readonly setCalloutVariant?: (variant: string) => Command
  readonly setColumnCount?: (count: number) => Command
  readonly insertTimelineItem?: Command
  readonly toggleToggleOpen?: Command
  // The reference apparatus: captions, cross-references, the lists built
  // from them, the index and endnotes. Kinds and formats are plain strings.
  readonly insertCaption?: (kind: string, label: string, text: string) => Command
  readonly referenceTargets?: (doc: EditorNode) => readonly ReferenceTargetInfo[]
  readonly insertCrossReference?: (
    target: Pick<ReferenceTargetInfo, 'id' | 'path'>,
    format: string,
  ) => Command
  readonly insertCaptionList?: (kind: string) => Command
  readonly insertDocumentIndex?: Command
  readonly markIndexEntry?: (entry: string, sub: string) => Command
  readonly insertEndnote?: Command
}

/** Something a cross-reference can point at, as `@trevixal/extension-blocks` lists them. */
export interface ReferenceTargetInfo {
  /** `heading`, `figure`, `table`, `equation`, `footnote` or `endnote`. */
  readonly kind: string
  /** Null for a heading nothing points at yet; the reference gives it one. */
  readonly id: string | null
  readonly path: Path
  readonly label: string
  readonly number: string
  readonly text: string
  /** The whole of it, as a list shows it: "Figure 2: A cat", "2.1 Results". */
  readonly full: string
}

/** What the toolbar needs to know about a format painter it does not own. */
export interface FormatPainterState {
  readonly armed: boolean
  readonly locked: boolean
  /** A human-readable summary of the copied format, for the tooltip. */
  readonly description?: string | null
}

/** JSON/XML reformatting commands, from `@trevixal/extension-format-code`. */
export interface CodeFormatCommands {
  readonly formatJSON?: Command
  readonly formatXML?: Command
  readonly minify?: Command
}

/** A group as Help ▸ Customize toolbar lists it. */
export interface ToolbarGroupInfo {
  readonly name: string
  readonly label: string
}

export interface Toolbar {
  readonly element: HTMLElement
  /**
   * Repaint every control. The toolbar already refreshes on each
   * transaction; call this when state the document does not hold changes,
   * a format painter arming, for instance.
   */
  refresh(): void
  /** The shown groups' current order, by name. */
  getGroupOrder(): readonly string[]
  /** Rearrange the groups; names are matched as for `ToolbarOptions.groupOrder`. */
  setGroupOrder(order: readonly string[]): void
  /** Every group the bar was built with, shown or hidden, in its default order. */
  readonly groups: readonly ToolbarGroupInfo[]
  /**
   * Show these groups, in this order, and hide the rest: what Help ▸
   * Customize toolbar applies. A hidden group leaves the bar whole and comes
   * back as it was, so nothing is rebuilt and the page need not reload.
   */
  setVisibleGroups(names: readonly string[]): void
  /** Re-print the tooltips' keys, e.g. after the user rebinds one. */
  setShortcutLabels(labels: ShortcutLabels | undefined): void
  destroy(): void
}

/**
 * Buttons whose menu entry goes by another name. A shortcut manager names its
 * actions after the menu entries, so this is how a button finds its key.
 */
const MENU_NAMES: Readonly<Record<string, string>> = {
  link: 'insertLink',
  code: 'inlineCode',
  bulletList: 'listBullet',
  orderedList: 'listOrdered',
  taskList: 'listTask',
  'align-left': 'alignleft',
  'align-center': 'aligncenter',
  'align-right': 'alignright',
  'align-justify': 'alignjustify',
  indent: 'indentMore',
  outdent: 'indentLess',
  emoji: 'insertEmoji',
}

function isControl(entry: ToolbarItem | ToolbarControl): entry is ToolbarControl {
  return 'create' in entry
}

const markItem = (
  name: string,
  icon: IconName,
  ariaLabel: string,
  shortcut?: string,
): ToolbarItem => ({
  name,
  label: ariaLabel,
  icon,
  ariaLabel,
  shortcut,
  run: (editor) => editor.commands.toggleMark(name),
  isActive: (snapshot) => snapshot.activeMarks.includes(name),
})

const alignItem = (
  align: 'left' | 'center' | 'right' | 'justify',
  icon: IconName,
  label: string,
): ToolbarItem => ({
  name: `align-${align}`,
  label,
  icon,
  ariaLabel: label,
  run: (editor) => editor.commands.setTextAlign(align),
  isActive: (snapshot) => snapshot.align === align,
})

/** Case conversions offered by the case select. */
const CASE_OPTIONS: readonly SelectOption[] = [
  { value: 'upper', label: 'UPPERCASE' },
  { value: 'lower', label: 'lowercase' },
  { value: 'title', label: 'Title Case' },
]

/**
 * Every list style, bullet and ordered together. `setListStyle` declines a
 * style the list at the selection does not allow, so one flat list is safe
 * and saves the user hunting in two places.
 */
const LIST_STYLE_OPTIONS: readonly SelectOption[] = [
  { value: '', label: 'Default' },
  { value: 'disc', label: 'Disc' },
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
  { value: 'decimal', label: '1, 2, 3' },
  { value: 'lower-alpha', label: 'a, b, c' },
  { value: 'upper-alpha', label: 'A, B, C' },
  { value: 'lower-roman', label: 'i, ii, iii' },
  { value: 'upper-roman', label: 'I, II, III' },
]

/** The callout variants, matching the schema's allowlist. */
const CALLOUT_OPTIONS: readonly SelectOption[] = [
  { value: 'info', label: 'Info' },
  { value: 'success', label: 'Success' },
  { value: 'warning', label: 'Warning' },
  { value: 'danger', label: 'Danger' },
  { value: 'note', label: 'Note' },
]

/** Column counts, matching the schema's 2..4 clamp. */
const COLUMN_OPTIONS: readonly SelectOption[] = [
  { value: '2', label: '2 columns' },
  { value: '3', label: '3 columns' },
  { value: '4', label: '4 columns' },
]

/** Line heights offered by default; a host can replace the list. */
export function defaultLineHeights(): readonly SelectOption[] {
  return [
    { value: '', label: 'Default' },
    { value: '1', label: 'Single' },
    { value: '1.15', label: '1.15' },
    { value: '1.5', label: '1.5' },
    { value: '2', label: 'Double' },
  ]
}

/** Paragraph spacings offered by default. */
export function defaultParagraphSpacings(): readonly SelectOption[] {
  return [
    { value: '', label: 'None' },
    { value: '4px', label: 'Small' },
    { value: '8px', label: 'Medium' },
    { value: '16px', label: 'Large' },
  ]
}

/** Letter spacings offered by default. */
export function defaultLetterSpacings(): readonly SelectOption[] {
  return [
    { value: '', label: 'Normal' },
    { value: '-0.02em', label: 'Tight' },
    { value: '0.05em', label: 'Wide' },
    { value: '0.1em', label: 'Wider' },
  ]
}

/** A button that runs a plain command, greyed out when it cannot apply. */
const commandItem = (
  name: string,
  icon: IconName,
  label: string,
  command: Command | undefined,
  shortcut?: string,
): ToolbarItem | null =>
  command
    ? {
        name,
        label,
        icon,
        ariaLabel: label,
        shortcut,
        run: (editor) => editor.exec(command),
        // A command returns null when it declines, which is exactly the
        // condition for greying the button out.
        isEnabled: () => true,
      }
    : null

/**
 * The Quick access group, or null without anything to put in it. `items` is
 * every button the bar holds, by name, which is what the tray offers back.
 */
function quickAccessGroup(
  access: QuickAccessOptions | undefined,
  items: ReadonlyMap<string, ToolbarItem>,
): ToolbarGroup | null {
  const { insertItems, tracker } = access ?? {}
  const controls: ToolbarControl[] = []
  if (insertItems) {
    controls.push({
      name: 'quickInsert',
      create: (editor, document) =>
        createQuickInsertControl(editor, document, { items: insertItems }),
    })
  }
  if (tracker) {
    controls.push({
      name: 'recentTools',
      create: (editor, document) => createRecentToolsControl(editor, document, { tracker, items }),
    })
  }
  return controls.length > 0 ? { ...QUICK_ACCESS_GROUP, items: controls } : null
}

/** Drops the entries a host did not wire, so no dead buttons are rendered. */
/** The Table design dropdown, when the host supplied what it drives. */
function tableDesignItem(commands: TableDesignCommands | undefined): readonly ToolbarControl[] {
  if (!commands) return []
  return [
    {
      name: 'tableDesign',
      create: (editor, document) => createTableDesignControl({ document, editor, commands }),
    },
  ]
}

function present(
  items: readonly (ToolbarItem | ToolbarControl | null)[],
): readonly (ToolbarItem | ToolbarControl)[] {
  return items.filter((item): item is ToolbarItem | ToolbarControl => item !== null)
}

/** A callback-backed button, omitted entirely when the callback is absent. */
function callbackItem(
  name: string,
  icon: IconName,
  label: string,
  handler: ((editor: Editor) => void) | undefined,
  shortcut?: string,
): ToolbarItem | null {
  if (!handler) return null
  return { name, label, icon, ariaLabel: label, shortcut, run: (editor) => handler(editor) }
}

/**
 * The stock toolbar layout: format/font/size selects, marks, lists,
 * alignment, indent, colors, insert controls and history, grouped the way
 * familiar editors arrange them.
 */
export function defaultToolbarGroups(options: ToolbarOptions = {}): readonly ToolbarGroup[] {
  return [
    {
      name: 'block',
      label: 'Block',
      items: [
        {
          name: 'blockFormat',
          create: (editor, document) =>
            createSelectControl({
              document,
              options: options.blockFormats ?? defaultBlockFormats(),
              placeholder: 'Paragraph',
              ariaLabel: 'Block format',
              width: '8.5rem',
              valueOf: blockFormatValue,
              onSelect: (value) => applyBlockFormat(editor, value),
            }),
        },
        {
          name: 'lineHeight',
          create: (editor, document) =>
            createSelectControl({
              document,
              options: options.lineHeights ?? defaultLineHeights(),
              placeholder: 'Line height',
              ariaLabel: 'Line height',
              width: '7rem',
              valueOf: (snapshot) => blockStringAttr(snapshot, 'lineHeight'),
              onSelect: (value) => editor.commands.setLineHeight(value || null),
            }),
        },
        {
          name: 'paragraphSpacing',
          create: (editor, document) =>
            createSelectControl({
              document,
              options: options.paragraphSpacings ?? defaultParagraphSpacings(),
              placeholder: 'Spacing',
              ariaLabel: 'Paragraph spacing',
              width: '7rem',
              valueOf: (snapshot) => blockStringAttr(snapshot, 'spaceAfter'),
              onSelect: (value) =>
                editor.commands.setParagraphSpacing({
                  before: value || null,
                  after: value || null,
                }),
            }),
        },
      ],
    },
    {
      name: 'typography',
      label: 'Font',
      items: [
        {
          name: 'fontFamily',
          create: (editor, document) =>
            createSelectControl({
              document,
              options: options.fontFamilies ?? defaultFontFamilies(),
              placeholder: 'Font',
              ariaLabel: 'Font family',
              width: '8rem',
              valueOf: (snapshot) => stringAttr(snapshot, 'fontFamily', 'family'),
              onSelect: (value) => editor.commands.setFontFamily(value),
            }),
        },
        {
          name: 'fontSize',
          create: (editor, document) =>
            createSelectControl({
              document,
              options: options.fontSizes ?? defaultFontSizes(),
              placeholder: 'Size',
              ariaLabel: 'Font size',
              width: '5rem',
              valueOf: (snapshot) => stringAttr(snapshot, 'fontSize', 'size'),
              onSelect: (value) => editor.commands.setFontSize(value),
            }),
        },
      ],
    },
    {
      name: 'marks',
      label: 'Text style',
      items: [
        markItem('bold', 'bold', 'Bold', 'Ctrl+B'),
        markItem('italic', 'italic', 'Italic', 'Ctrl+I'),
        markItem('underline', 'underline', 'Underline', 'Ctrl+U'),
        markItem('strikethrough', 'strikethrough', 'Strikethrough'),
        markItem('code', 'code', 'Inline code'),
        markItem('superscript', 'superscript', 'Superscript'),
        markItem('subscript', 'subscript', 'Subscript'),
        {
          name: 'smallCaps',
          label: 'Small caps',
          icon: 'smallCaps',
          ariaLabel: 'Small caps',
          run: (editor) => editor.commands.toggleSmallCaps(),
          isActive: (snapshot) => snapshot.activeMarks.includes('smallCaps'),
        },
        {
          name: 'letterSpacing',
          create: (editor, document) =>
            createSelectControl({
              document,
              options: options.letterSpacings ?? defaultLetterSpacings(),
              placeholder: 'Spacing',
              ariaLabel: 'Letter spacing',
              width: '6.5rem',
              valueOf: (snapshot) => stringAttr(snapshot, 'letterSpacing', 'spacing'),
              onSelect: (value) => editor.commands.setLetterSpacing(value || null),
            }),
        },
        {
          name: 'convertCase',
          create: (editor, document) =>
            createSelectControl({
              document,
              options: CASE_OPTIONS,
              placeholder: 'Case',
              ariaLabel: 'Change case',
              width: '6.5rem',
              // Case is an action, not a state the document carries, so the
              // select never shows a current value.
              valueOf: () => null,
              onSelect: (value) => {
                if (value === 'upper' || value === 'lower' || value === 'title') {
                  editor.commands.convertCase(value)
                }
              },
            }),
        },
      ],
    },
    {
      name: 'lists',
      label: 'Lists',
      items: [
        {
          name: 'bulletList',
          label: 'Bullet list',
          icon: 'bulletList',
          run: (editor) => editor.commands.toggleBulletList(),
          isActive: (snapshot) => snapshot.listType === 'bulletList',
        },
        {
          name: 'orderedList',
          label: 'Numbered list',
          icon: 'orderedList',
          run: (editor) => editor.commands.toggleOrderedList(),
          isActive: (snapshot) => snapshot.listType === 'orderedList',
        },
        {
          name: 'taskList',
          label: 'Task list',
          icon: 'taskList',
          run: (editor) => editor.commands.toggleTaskList(),
          isActive: (snapshot) => snapshot.listType === 'taskList',
        },
        {
          name: 'listStyle',
          create: (editor, document) =>
            createSelectControl({
              document,
              options: LIST_STYLE_OPTIONS,
              placeholder: 'List style',
              ariaLabel: 'List style',
              width: '8rem',
              valueOf: () => null,
              // Declines outside a list, and for a style the list type does
              // not allow, so a bullet list cannot be given roman numerals.
              onSelect: (value) => editor.commands.setListStyle(value || null),
            }),
        },
        {
          name: 'listNumbering',
          create: (editor, document) =>
            createListNumberingControl({
              document,
              options: defaultListNumberings(),
              definedOptions: () => definedListNumberings(editor.state.doc),
              onDefine: () => openDefineListNumbering(editor, document),
              valueOf: (snapshot) => currentListNumbering(editor, snapshot),
              onSelect: (value) => {
                if (value === NO_LIST_NUMBERING) editor.commands.unwrapList()
                else editor.commands.setListNumbering(value)
              },
            }),
        },
        {
          name: 'restartNumbering',
          label: 'Restart numbering',
          icon: 'restartNumbering',
          run: (editor) => editor.commands.restartNumbering(),
          isEnabled: (snapshot) => snapshot.listType === 'orderedList',
        },
        {
          name: 'outdent',
          label: 'Decrease indent',
          icon: 'outdent',
          run: (editor) => editor.commands.outdent(),
          isEnabled: (snapshot) => snapshot.indent > 0,
        },
        {
          name: 'indent',
          label: 'Increase indent',
          icon: 'indent',
          run: (editor) => editor.commands.indent(),
        },
      ],
    },
    {
      name: 'align',
      label: 'Alignment',
      items: [
        alignItem('left', 'alignLeft', 'Align left'),
        alignItem('center', 'alignCenter', 'Align center'),
        alignItem('right', 'alignRight', 'Align right'),
        alignItem('justify', 'alignJustify', 'Justify'),
      ],
    },
    {
      name: 'color',
      label: 'Color',
      items: [
        {
          name: 'textColor',
          create: (editor, document) =>
            createColorControl({
              document,
              icon: 'textColor',
              ariaLabel: 'Text color',
              valueOf: (snapshot) => stringAttr(snapshot, 'textColor', 'color'),
              onSelect: (color) => editor.commands.setTextColor(color),
              onClear: () => editor.commands.unsetMark('textColor'),
            }),
        },
        {
          name: 'backgroundColor',
          create: (editor, document) =>
            createColorControl({
              document,
              icon: 'backgroundColor',
              ariaLabel: 'Background color',
              valueOf: (snapshot) => stringAttr(snapshot, 'backgroundColor', 'color'),
              onSelect: (color) => editor.commands.setBackgroundColor(color),
              onClear: () => editor.commands.unsetMark('backgroundColor'),
            }),
        },
        markItem('highlight', 'backgroundColor', 'Highlight'),
      ],
    },
    {
      name: 'insert',
      label: 'Insert',
      items: [
        {
          name: 'link',
          label: 'Insert link',
          icon: 'link',
          run: (editor) => options.onLink?.(editor),
          isActive: (snapshot) => snapshot.activeMarks.includes('link'),
        },
        {
          name: 'unlink',
          label: 'Remove link',
          icon: 'unlink',
          run: (editor) => editor.commands.unsetLink(),
          isEnabled: (snapshot) => snapshot.activeMarks.includes('link'),
        },
        {
          name: 'image',
          label: 'Insert image',
          icon: 'image',
          run: (editor) => options.onImage?.(editor),
        },
        {
          name: 'table',
          create: (editor, document) =>
            createTableGridControl({
              document,
              onSelect: (rows, cols) => options.onInsertTable?.(editor, rows, cols),
            }),
        },
        ...tableDesignItem(options.tableDesign),
        {
          name: 'blockquote',
          label: 'Quote',
          icon: 'quote',
          run: (editor) => editor.commands.wrapIn('blockquote'),
          isActive: (snapshot) => snapshot.blockType === 'blockquote',
        },
        {
          name: 'horizontalRule',
          label: 'Horizontal rule',
          icon: 'horizontalRule',
          run: (editor) => editor.commands.insertHorizontalRule(),
        },
        ...present([
          commandItem(
            'pageBreak',
            'pageBreak',
            'Page break',
            options.blockCommands?.insertPageBreak,
          ),
          callbackItem(
            'specialChar',
            'specialChar',
            'Special character',
            options.onSpecialCharacter,
          ),
          callbackItem('emoji', 'badge', 'Emoji', options.onEmoji),
          commandItem('footnote', 'footnote', 'Footnote', options.blockCommands?.insertFootnote),
        ]),
      ],
    },
    {
      name: 'paint',
      label: 'Format painter',
      items: present([
        options.onFormatPainter
          ? {
              name: 'formatPainter',
              label: 'Format painter',
              icon: 'formatPainter',
              ariaLabel: 'Format painter',
              run: (editor, event) => options.onFormatPainter?.(editor, event),
              isActive: () => options.formatPainterState?.().armed ?? false,
              // Published as `data-painter` / `data-format`: the SCSS and the
              // e2e suite already key off those names.
              dataset: () => {
                const state = options.formatPainterState?.()
                return {
                  painter: state?.locked ? 'locked' : state?.armed ? 'armed' : null,
                  format: state?.description ?? null,
                }
              },
            }
          : null,
      ]),
    },
    {
      name: 'blocks',
      label: 'Blocks',
      items: present([
        options.blockCommands?.insertCallout
          ? {
              name: 'callout',
              create: (editor, document) =>
                createSelectControl({
                  document,
                  options: CALLOUT_OPTIONS,
                  placeholder: 'Callout',
                  ariaLabel: 'Insert callout',
                  width: '7.5rem',
                  valueOf: () => null,
                  onSelect: (value) => {
                    const command = options.blockCommands?.insertCallout?.(value)
                    if (command) editor.exec(command)
                  },
                }),
            }
          : null,
        commandItem(
          'toggleBlock',
          'toggleBlock',
          'Toggle block',
          options.blockCommands?.insertToggleBlock,
        ),
        options.blockCommands?.insertColumns
          ? {
              name: 'columns',
              create: (editor, document) =>
                createSelectControl({
                  document,
                  options: COLUMN_OPTIONS,
                  placeholder: 'Columns',
                  ariaLabel: 'Insert columns',
                  width: '7rem',
                  valueOf: () => null,
                  onSelect: (value) => {
                    const count = Number.parseInt(value, 10)
                    const command = options.blockCommands?.insertColumns?.(count)
                    if (command) editor.exec(command)
                  },
                }),
            }
          : null,
        commandItem('card', 'card', 'Card', options.blockCommands?.insertCard),
        commandItem('timeline', 'timeline', 'Timeline', options.blockCommands?.insertTimeline),
      ]),
    },
    {
      name: 'code',
      label: 'Code',
      items: present([
        {
          name: 'codeBlock',
          label: 'Code block',
          icon: 'codeLanguage',
          ariaLabel: 'Code block',
          run: (editor) => editor.commands.setCodeBlock(),
          isActive: (snapshot) => snapshot.blockType === 'codeBlock',
        },
        callbackItem('copyCode', 'copyCode', 'Copy code', options.onCopyCode),
        commandItem(
          'formatJson',
          'formatJson',
          'Format JSON',
          options.codeFormatCommands?.formatJSON,
        ),
        commandItem('formatXml', 'formatXml', 'Format XML', options.codeFormatCommands?.formatXML),
        commandItem('minify', 'minify', 'Minify', options.codeFormatCommands?.minify),
      ]),
    },
    {
      name: 'tools',
      label: 'Tools',
      items: present([
        callbackItem('findReplace', 'search', 'Find and replace', options.onFindReplace),
        callbackItem(
          'tableOfContents',
          'tableOfContents',
          'Table of contents',
          options.onToggleTableOfContents,
        ),
        callbackItem('outline', 'outline', 'Document outline', options.onToggleOutline),
        callbackItem(
          'commandPalette',
          'commandPalette',
          'Command palette',
          options.onCommandPalette,
          'Ctrl+K',
        ),
        callbackItem('focusMode', 'focusMode', 'Focus mode', options.onToggleFocusMode),
        callbackItem('fullscreen', 'fullscreen', 'Fullscreen', options.onToggleFullscreen),
        callbackItem('wordCount', 'wordCount', 'Word count', options.onWordCount),
      ]),
    },
    {
      name: 'history',
      label: 'History',
      items: [
        {
          name: 'clearFormatting',
          label: 'Clear formatting',
          icon: 'removeFormat',
          run: (editor) => editor.commands.clearFormatting(),
        },
        {
          name: 'undo',
          label: 'Undo',
          icon: 'undo',
          shortcut: 'Ctrl+Z',
          run: (editor) => editor.commands.undo(),
          isEnabled: (snapshot) => snapshot.canUndo,
        },
        {
          name: 'redo',
          label: 'Redo',
          icon: 'redo',
          shortcut: 'Ctrl+Y',
          run: (editor) => editor.commands.redo(),
          isEnabled: (snapshot) => snapshot.canRedo,
        },
      ],
    },
  ]
}

/** The stock item set, flattened. Compose your own list for a custom toolbar. */
export function defaultToolbarItems(
  options: ToolbarOptions = {},
): readonly (ToolbarItem | ToolbarControl)[] {
  return defaultToolbarGroups(options).flatMap((group) => group.items)
}

function stringAttr(snapshot: EditorSnapshot, mark: string, attr: string): string | null {
  const value = snapshot.markAttrs[mark]?.[attr]
  return typeof value === 'string' ? value : null
}

/** A string-valued attribute of the block holding the selection. */
function blockStringAttr(snapshot: EditorSnapshot, attr: string): string | null {
  const value = snapshot.blockAttrs?.[attr]
  // Line height is stored as a bare number when it is a multiplier, so both
  // shapes have to round-trip back into the select.
  if (typeof value === 'number') return String(value)
  return typeof value === 'string' ? value : null
}

/**
 * Mount an accessible toolbar (WAI-ARIA toolbar pattern: `aria-pressed`,
 * roving tabindex, arrow-key navigation) that reflects and dispatches editor
 * commands.
 */
export function createToolbar(
  editor: Editor,
  container: HTMLElement,
  options: ToolbarOptions = {},
): Toolbar {
  const document = container.ownerDocument
  const translate = createTranslator(options.messages)
  /** Every button in the bar, by name: what the Quick access tray offers back. */
  const itemsByName = new Map<string, ToolbarItem>()
  const quick = quickAccessGroup(options.quickAccess, itemsByName)
  const declared = [
    ...(quick ? [quick] : []),
    ...(options.groups ??
      (options.items
        ? [{ name: 'default', items: options.items }]
        : defaultToolbarGroups(options))),
  ]
  // An explicit `groupNames` both filters and orders; an unknown name is
  // simply absent rather than an error, so a host can name groups it may not
  // have wired yet.
  const selected = options.groupNames
    ? options.groupNames
        .map((name) => declared.find((group) => group.name === name))
        .filter((group): group is ToolbarGroup => group !== undefined)
    : declared
  // Groups whose every control was omitted for want of a callback would
  // otherwise render as an empty separator.
  const base = selected.filter((group) => group.items.length > 0)
  const extra = options.extraItems
  const merged = extra
    ? base.map((group) =>
        extra[group.name] ? { ...group, items: [...extra[group.name], ...group.items] } : group,
      )
    : base
  const groups = options.groupOrder ? orderGroups(merged, options.groupOrder) : merged
  const groupInfo = merged.map((group) => ({
    name: group.name,
    label: translate(`${TOOLBAR_GROUP_KEY}${group.name}`, group.label ?? group.name),
  }))
  // Filled before anything is built, so the tray can offer any button.
  for (const group of groups) {
    for (const entry of group.items) if (!isControl(entry)) itemsByName.set(entry.name, entry)
  }

  const root = document.createElement('div')
  root.className = 'trevixal-toolbar'
  root.setAttribute('role', 'toolbar')
  root.setAttribute('aria-label', options.ariaLabel ?? 'Text formatting')

  const buttons: { item: ToolbarItem; element: HTMLButtonElement }[] = []
  const controls: Control[] = []

  for (const group of groups) {
    const groupElement = document.createElement('div')
    groupElement.className = 'trevixal-toolbar__group'
    groupElement.dataset.trevixalGroup = group.name
    if (group.label) {
      groupElement.dataset.trevixalGroupLabel = translate(
        `${TOOLBAR_GROUP_KEY}${group.name}`,
        group.label,
      )
    }
    if (options.reorderable) groupElement.appendChild(createGrip(document, group, translate))

    for (const entry of group.items) {
      if (isControl(entry)) {
        const control = entry.create(editor, document)
        control.element.dataset.trevixalItem = entry.name
        groupElement.appendChild(control.element)
        controls.push(control)
        continue
      }
      const button = createToolbarButton(
        document,
        entry,
        editor,
        translate,
        options.quickAccess?.tracker,
      )
      groupElement.appendChild(button)
      buttons.push({ item: entry, element: button })
    }
    root.appendChild(groupElement)
  }

  const roving = bindRovingFocus(root)
  const reorder = options.reorderable
    ? bindGroupReorder(root, { onReorder: options.onReorder })
    : null

  const refresh = (): void => {
    const snapshot = editor.getSnapshot()
    for (const { item, element } of buttons) {
      if (item.isActive) element.setAttribute('aria-pressed', String(item.isActive(snapshot)))
      element.disabled = item.isEnabled ? !item.isEnabled(snapshot) : false
      if (item.dataset) {
        for (const [key, value] of Object.entries(item.dataset())) {
          if (value === null) delete element.dataset[key]
          else element.dataset[key] = value
        }
      }
    }
    for (const control of controls) control.refresh(snapshot)
    roving.retune()
  }
  refresh()
  const unsubscribe = editor.on('transaction', refresh)

  let shortcutLabels = options.shortcutLabels
  /** The key a tooltip names: the manager's when there is one, else the engine's own. */
  const keysFor = (item: ToolbarItem): string => {
    if (shortcutLabels) return shortcutLabels[MENU_NAMES[item.name] ?? item.name] ?? ''
    return item.shortcut ? formatShortcut(parseShortcut(item.shortcut)) : ''
  }
  const retitle = (): void => {
    for (const { item, element } of buttons) {
      const name = element.getAttribute('aria-label') ?? item.label
      const keys = keysFor(item)
      element.title = keys ? `${name} (${keys})` : name
    }
  }
  retitle()

  /**
   * Groups `setVisibleGroups` took off the bar. Detached rather than hidden,
   * so the arrow keys, the grips and the reported order skip them without
   * each having to know that hiding exists.
   */
  const stowed = new Map<string, HTMLElement>()
  const setVisibleGroups = (names: readonly string[]): void => {
    for (const group of groupElements(root)) {
      const name = group.dataset.trevixalGroup ?? ''
      if (names.includes(name)) continue
      group.remove()
      stowed.set(name, group)
    }
    // Back in after the last group still shown, which keeps the reorder
    // module's drop bar last; `applyGroupOrder` then settles the order.
    const shown = groupElements(root)
    const anchor = shown[shown.length - 1]?.nextSibling ?? root.firstChild
    for (const name of names) {
      const group = stowed.get(name)
      if (!group) continue
      stowed.delete(name)
      root.insertBefore(group, anchor)
    }
    applyGroupOrder(root, names)
    roving.retune()
  }

  container.appendChild(root)
  return {
    element: root,
    refresh,
    getGroupOrder: () => groupOrder(root),
    setGroupOrder: (order) => applyGroupOrder(root, order),
    groups: groupInfo,
    setVisibleGroups,
    setShortcutLabels(labels) {
      shortcutLabels = labels
      retitle()
    },
    destroy() {
      unsubscribe()
      reorder?.destroy()
      for (const control of controls) control.destroy()
      root.remove()
    },
  }
}

function createToolbarButton(
  document: Document,
  item: ToolbarItem,
  editor: Editor,
  translate: Translator,
  usage?: ToolUsageTracker,
): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'trevixal-toolbar__button'
  button.dataset.trevixalItem = item.name
  const icon = item.icon ? createIcon(document, item.icon) : null
  const label = translate(`${TOOLBAR_KEY}${item.name}`, item.label)
  if (icon) button.appendChild(icon)
  else button.textContent = label
  // Most items repeat the label as their accessible name, and a host that
  // translates the label plainly means both. Only a name that genuinely
  // differs gets a key of its own, which is also the rule `defaultMessages`
  // follows when it lists them.
  const ariaFallback = item.ariaLabel && item.ariaLabel !== item.label ? item.ariaLabel : label
  const name = translate(`${TOOLBAR_KEY}${item.name}${ARIA_SUFFIX}`, ariaFallback)
  button.setAttribute('aria-label', name)
  // The tooltip, keys and all, is the toolbar's to write: see `retitle`.
  button.title = name
  button.tabIndex = -1
  // Keep the editor selection: the toolbar must never take focus on click.
  button.addEventListener('mousedown', (event) => event.preventDefault())
  button.addEventListener('click', (event) => {
    item.run(editor, event)
    usage?.record(item.name)
  })
  return button
}

/**
 * Arrow keys walk the toolbar; exactly one *enabled* control is tabbable at
 * a time. The tab stop is recomputed on every refresh, because the control
 * holding it (undo, outdent…) is often the one that becomes disabled,
 * which would otherwise leave the whole toolbar unreachable by Tab.
 */
function bindRovingFocus(root: HTMLElement): { retune: () => void } {
  const SELECTOR = '.trevixal-toolbar__button, .trevixal-dropdown__trigger, .trevixal-toolbar__grip'

  const focusables = (): HTMLElement[] =>
    [...root.querySelectorAll<HTMLElement>(SELECTOR)].filter(
      (element) => !(element as HTMLButtonElement).disabled,
    )

  const setTabStop = (target: HTMLElement | undefined): void => {
    for (const element of root.querySelectorAll<HTMLElement>(SELECTOR)) {
      element.tabIndex = element === target ? 0 : -1
    }
  }

  const retune = (): void => {
    const items = focusables()
    const active = root.ownerDocument.activeElement as HTMLElement | null
    // Keep the tab stop where the user is; otherwise move it somewhere usable.
    setTabStop(active && items.includes(active) ? active : items[0])
  }

  const focusAt = (index: number): void => {
    const items = focusables()
    if (items.length === 0) return
    const target = items[(index + items.length) % items.length]
    setTabStop(target)
    target?.focus()
  }

  root.addEventListener('keydown', (event) => {
    const items = focusables()
    const current = items.indexOf(root.ownerDocument.activeElement as HTMLElement)
    if (current === -1) return
    // A right-to-left toolbar is drawn mirrored: the next control is to the left.
    const step = root.ownerDocument.defaultView?.getComputedStyle(root).direction === 'rtl' ? -1 : 1
    switch (event.key) {
      case 'ArrowRight':
        focusAt(current + step)
        break
      case 'ArrowLeft':
        focusAt(current - step)
        break
      case 'Home':
        focusAt(0)
        break
      case 'End':
        focusAt(items.length - 1)
        break
      default:
        return
    }
    event.preventDefault()
  })

  retune()
  return { retune }
}

/** Listed names first, in that order; the rest keep their place after them. */
function orderGroups(
  groups: readonly ToolbarGroup[],
  order: readonly string[],
): readonly ToolbarGroup[] {
  const listed = order
    .map((name) => groups.find((group) => group.name === name))
    .filter((group): group is ToolbarGroup => group !== undefined)
  return [...listed, ...groups.filter((group) => !listed.includes(group))]
}

/** The handle a group is dragged by. A button, so the keyboard can pick it up too. */
function createGrip(
  document: Document,
  group: ToolbarGroup,
  translate: Translator,
): HTMLButtonElement {
  const grip = document.createElement('button')
  grip.type = 'button'
  grip.className = 'trevixal-toolbar__grip'
  grip.dataset.trevixalGrip = group.name
  const label = translate(`${TOOLBAR_GROUP_KEY}${group.name}`, group.label ?? group.name)
  grip.setAttribute('aria-label', `Move ${label} group`)
  grip.setAttribute('aria-pressed', 'false')
  grip.title = `Drag to move the ${label} group. From the keyboard: Space, then the arrow keys.`
  grip.tabIndex = -1
  const icon = createIcon(document, 'grip')
  if (icon) grip.appendChild(icon)
  return grip
}
