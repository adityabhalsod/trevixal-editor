import { type Command, type Editor, editorDocument } from '@trevixal/core'
import { openDialog } from './dialog'
import { createDropdown } from './dropdown'
import { type IconName, createIcon } from './icons'

/** The table commands the floating toolbar drives, injected by the host. */
export interface TableToolbarCommands {
  readonly addRowBefore: Command
  readonly addRowAfter: Command
  readonly deleteRow: Command
  readonly addColumnBefore: Command
  readonly addColumnAfter: Command
  readonly deleteColumn: Command
  readonly mergeCells: Command
  readonly splitCell: Command
  /**
   * Word's Split Cells. When present, the Split entry asks how many columns
   * and runs this; without it the entry runs `splitCell`, which un-merges.
   */
  readonly splitCellInto?: (columns: number) => Command
  readonly toggleHeaderRow: Command
  readonly deleteTable: Command
  // Optional, so a host wired to the original ten keeps working: an entry
  // whose command is missing is left out rather than shown disabled.
  readonly moveRowUp?: Command
  readonly moveRowDown?: Command
  readonly moveColumnLeft?: Command
  readonly moveColumnRight?: Command
  readonly swapCellLeft?: Command
  readonly swapCellRight?: Command
  readonly swapCellUp?: Command
  readonly swapCellDown?: Command
  readonly distributeColumns?: Command
  readonly clearSizing?: Command
}

interface Entry {
  // `splitCellInto` is not an entry of its own: it is how Split asks.
  readonly name: Exclude<keyof TableToolbarCommands, 'splitCellInto'>
  readonly label: string
  readonly icon: IconName
  /** Starts a visual group in the dropdown. */
  readonly separatorBefore?: boolean
}

/** Every table operation, in the order a menu should present them. */
const ENTRIES: readonly Entry[] = [
  { name: 'addRowBefore', label: 'Insert row above', icon: 'tableRowAbove' },
  { name: 'addRowAfter', label: 'Insert row below', icon: 'tableRowBelow' },
  { name: 'deleteRow', label: 'Delete row', icon: 'tableRowDelete' },
  {
    name: 'addColumnBefore',
    label: 'Insert column left',
    icon: 'tableColumnLeft',
    separatorBefore: true,
  },
  { name: 'addColumnAfter', label: 'Insert column right', icon: 'tableColumnRight' },
  { name: 'deleteColumn', label: 'Delete column', icon: 'tableColumnDelete' },
  { name: 'mergeCells', label: 'Merge cells', icon: 'tableMerge', separatorBefore: true },
  { name: 'splitCell', label: 'Split cells…', icon: 'tableSplit' },
  { name: 'toggleHeaderRow', label: 'Toggle header row', icon: 'tableHeaderRow' },
  { name: 'moveRowUp', label: 'Move row up', icon: 'tableMoveRowUp', separatorBefore: true },
  { name: 'moveRowDown', label: 'Move row down', icon: 'tableMoveRowDown' },
  { name: 'moveColumnLeft', label: 'Move column left', icon: 'tableMoveColumnLeft' },
  { name: 'moveColumnRight', label: 'Move column right', icon: 'tableMoveColumnRight' },
  { name: 'swapCellLeft', label: 'Swap cell left', icon: 'tableSwapCell', separatorBefore: true },
  { name: 'swapCellRight', label: 'Swap cell right', icon: 'tableSwapCell' },
  { name: 'swapCellUp', label: 'Swap cell up', icon: 'tableSwapCellVertical' },
  { name: 'swapCellDown', label: 'Swap cell down', icon: 'tableSwapCellVertical' },
  {
    name: 'distributeColumns',
    label: 'Distribute columns evenly',
    icon: 'tableDistribute',
    separatorBefore: true,
  },
  { name: 'clearSizing', label: 'Reset sizes', icon: 'resizeColumns' },
  { name: 'deleteTable', label: 'Delete table', icon: 'tableDelete', separatorBefore: true },
]

/** Word's widest table. The split command declines beyond it too. */
const MOST_SPLIT_COLUMNS = 63

/**
 * Word's Split Cells dialog, asking how many columns to split each selected
 * cell into. Resolves to that count, or null when dismissed. It does not ask
 * for rows: the table model spans columns only.
 */
export function openSplitCellsDialog(document: Document): Promise<number | null> {
  return openDialog({
    document,
    title: 'Split cells',
    submitLabel: 'Split',
    fields: [
      {
        name: 'columns',
        label: 'Number of columns',
        type: 'number',
        value: '2',
        required: true,
        min: 2,
        max: MOST_SPLIT_COLUMNS,
        hint: 'Each selected cell becomes this many, side by side.',
      },
    ],
    // `Number`, not `parseInt`: a 2.5 stays 2.5 and the command turns it down,
    // rather than quietly becoming 2.
  }).then((values) => (values ? Number(values.columns) : null))
}

export interface TableToolbarOptions {
  readonly commands: TableToolbarCommands
  /**
   * Where the floating toolbar is appended. Must be a positioned ancestor of
   * the editor surface, or an ancestor whose own offset parent it shares.
   * The toolbar is positioned absolutely within it.
   */
  readonly container?: HTMLElement
}

export interface TableToolbar {
  readonly element: HTMLElement
  destroy(): void
}

/**
 * A floating control that appears only while the caret is inside a table cell,
 * the Confluence pattern. Collapsed it is a single grid button; clicking it
 * opens the full list of table operations, each with its own icon.
 *
 * Nothing here touches the document: the toolbar reads the selection to decide
 * whether to show, and runs the injected commands when clicked.
 */
export function createTableToolbar(editor: Editor, options: TableToolbarOptions): TableToolbar {
  const view = editor.view
  const doc = editorDocument(editor, options.container, 'createTableToolbar')

  const host = options.container ?? (view?.dom.parentElement as HTMLElement)
  const root = doc.createElement('div')
  root.className = 'trevixal-tabletoolbar'
  root.hidden = true
  // A toolbar over the document must never steal the selection it acts on.
  root.addEventListener('mousedown', (event) => event.preventDefault())

  const dropdown = createDropdown({
    document: doc,
    className: 'trevixal-tabletoolbar__dropdown',
    render: (panel, self) => {
      // Entries whose command the host did not supply are dropped, and the
      // separator is deferred until something actually follows it, otherwise
      // skipping a whole group leaves a rule with nothing under it.
      let pendingSeparator = false
      let rendered = 0
      for (const entry of ENTRIES) {
        const command = options.commands[entry.name]
        if (!command) continue
        if (entry.separatorBefore) pendingSeparator = true
        if (pendingSeparator && rendered > 0) {
          const rule = doc.createElement('div')
          rule.className = 'trevixal-menu__separator'
          rule.setAttribute('role', 'separator')
          panel.appendChild(rule)
        }
        pendingSeparator = false
        rendered++
        const button = doc.createElement('button')
        button.type = 'button'
        button.className = 'trevixal-menu__item'
        button.setAttribute('role', 'menuitem')
        button.dataset.trevixalItem = entry.name

        const glyph = doc.createElement('span')
        glyph.className = 'trevixal-menu__icon'
        const icon = createIcon(doc, entry.icon)
        if (icon) glyph.appendChild(icon)
        const label = doc.createElement('span')
        label.className = 'trevixal-menu__label'
        label.textContent = entry.label
        button.append(glyph, label)

        button.addEventListener('mousedown', (event) => event.preventDefault())
        button.addEventListener('click', () => {
          self.close()
          const splitInto = options.commands.splitCellInto
          if (entry.name === 'splitCell' && splitInto) {
            void openSplitCellsDialog(doc).then((columns) => {
              editor.view?.focus()
              if (columns !== null) editor.exec(splitInto(columns))
            })
            return
          }
          editor.exec(command)
          editor.view?.focus()
        })
        panel.appendChild(button)
      }
    },
  })
  // The dropdown primitive builds an empty trigger; fill it here.
  dropdown.trigger.setAttribute('aria-label', 'Table options')
  dropdown.trigger.title = 'Table options'
  const triggerIcon = createIcon(doc, 'table')
  if (triggerIcon) dropdown.trigger.appendChild(triggerIcon)

  root.appendChild(dropdown.element)
  host.appendChild(root)

  /** The cell holding the caret, or null when the selection is outside a table. */
  const activeCell = (): HTMLTableCellElement | null => {
    const current = editor.view
    if (!current) return null
    const selection = doc.getSelection()
    const anchor = selection?.anchorNode
    if (!anchor || !current.dom.contains(anchor)) return null
    let node: Node | null = anchor
    while (node && node !== current.dom) {
      if (node instanceof HTMLTableCellElement) return node
      node = node.parentNode
    }
    return null
  }

  const update = (): void => {
    const cell = activeCell()
    if (!cell) {
      if (!root.hidden) {
        dropdown.close()
        root.hidden = true
      }
      return
    }

    root.hidden = false
    // Anchor to the cell's top-right corner, in the host's coordinate space,
    // so the toolbar tracks scrolling and reflow without measuring the page.
    // Both boxes are viewport-relative, but the toolbar is positioned against
    // the host's content origin, which the host's own scroll has moved.
    const cellBox = cell.getBoundingClientRect()
    const hostBox = host.getBoundingClientRect()
    const offsetLeft = cellBox.right - hostBox.left - host.clientLeft + host.scrollLeft
    const offsetTop = cellBox.top - hostBox.top - host.clientTop + host.scrollTop
    root.style.left = `${offsetLeft - root.offsetWidth - 2}px`
    root.style.top = `${offsetTop + 2}px`
  }

  const offTransaction = editor.on('transaction', update)
  const offSelection = editor.on('selectionUpdate', update)
  // `selectionchange` is asynchronous, so a plain click into a cell is not
  // covered by the editor's own events.
  doc.addEventListener('selectionchange', update)
  update()

  return {
    element: root,
    destroy() {
      offTransaction()
      offSelection()
      doc.removeEventListener('selectionchange', update)
      dropdown.destroy()
      root.remove()
    },
  }
}
