import {
  type Command,
  type Editor,
  type EditorNode,
  Fragment,
  type NodeSpec,
  type Path,
  SetNodeAttrsStep,
  WrapNodesStep,
  blocksInRange,
  escapeHTML,
  nodeAtPath,
  pathOfElement,
  pathsEqual,
  setDocumentAttrs,
  templateVariables,
} from '@trevixal/core'
import { emptyParagraph, insertBlockHere, selectFirstTextblock } from './helpers'

/**
 * Four blocks beyond the everyday ones: a sticky note in the margin, a poll,
 * a map, and content shown only when a template variable says so.
 */

// ------------------------------------------------------------- margin notes

/** The colours a margin note comes in. */
export const NOTE_COLORS = ['yellow', 'blue', 'green', 'pink'] as const
export type NoteColor = (typeof NOTE_COLORS)[number]

function noteColor(value: unknown): NoteColor {
  return NOTE_COLORS.includes(value as NoteColor) ? (value as NoteColor) : 'yellow'
}

// ---------------------------------------------------------------------- polls

/** One choice of a poll and the votes it has. */
export interface PollOption {
  readonly label: string
  readonly votes: number
}

/** A poll's choices from their stored JSON; junk becomes none. */
export function pollOptions(value: unknown): PollOption[] {
  if (typeof value !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (entry): entry is { label: unknown; votes?: unknown } =>
          typeof entry === 'object' && entry !== null,
      )
      .map((entry) => ({
        label: String(entry.label ?? '').slice(0, 200),
        votes: Math.max(0, Math.floor(Number(entry.votes) || 0)),
      }))
      .filter((entry) => entry.label.trim() !== '')
      .slice(0, 20)
  } catch {
    return []
  }
}

/** The poll drawn: the question, and each choice with its share of the votes. */
function pollHTML(node: EditorNode): string {
  const question = String(node.attrs.question ?? '')
  const options = pollOptions(node.attrs.options)
  const total = options.reduce((sum, option) => sum + option.votes, 0)
  const rows = options
    .map((option, index) => {
      const share = total > 0 ? Math.round((option.votes / total) * 100) : 0
      return `<li class="trevixal-poll__option"><button type="button" class="trevixal-poll__vote" data-poll-option="${index}" aria-label="Vote for ${escapeHTML(option.label)}"><span class="trevixal-poll__bar" style="width:${share}%"></span><span class="trevixal-poll__label">${escapeHTML(option.label)}</span><span class="trevixal-poll__count">${option.votes} · ${share}%</span></button></li>`
    })
    .join('')
  const votes = total === 1 ? '1 vote' : `${total} votes`
  return `<p class="trevixal-poll__question">${escapeHTML(question || 'Poll')}</p><ul class="trevixal-poll__options">${rows}</ul><p class="trevixal-poll__total">${votes}</p>`
}

// ----------------------------------------------------------------------- maps

/** The map tiles unless a host names its own: OpenStreetMap's. */
export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors'

/**
 * How many tiles across and down a map draws: enough to fill a view up to
 * 1024 pixels wide and 256 high with the place in its middle, wherever in
 * its tile the place falls.
 */
const MAP_COLUMNS = 6
const MAP_ROWS = 3
const TILE = 256

/** A latitude and longitude as the tile they fall in at a zoom, and where in it. */
export function tileOf(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, lat))
  const x = ((lng + 180) / 360) * n
  const radians = (latitude * Math.PI) / 180
  const y = ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * n
  return { x, y }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

export interface MapNodeOptions {
  /** A tile URL template with `{z}`, `{x}` and `{y}`: any provider's. */
  readonly tiles?: string
  /** The credit its tiles ask for. */
  readonly attribution?: string
}

/** The map drawn: the tiles around the place, a pin on it, and the credit. */
function mapHTML(node: EditorNode, options: MapNodeOptions): string {
  const lat = clampNumber(node.attrs.lat, -85, 85, 0)
  const lng = clampNumber(node.attrs.lng, -180, 180, 0)
  const zoom = Math.round(clampNumber(node.attrs.zoom, 1, 18, 13))
  const label = String(node.attrs.label ?? '')
  const template = options.tiles ?? OSM_TILES
  const center = tileOf(lat, lng, zoom)
  const left = Math.floor(center.x - MAP_COLUMNS / 2)
  const top = Math.floor(center.y - MAP_ROWS / 2)
  const count = 2 ** zoom
  const tiles: string[] = []
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let column = 0; column < MAP_COLUMNS; column++) {
      const x = (((left + column) % count) + count) % count
      const y = top + row
      if (y < 0 || y >= count) continue
      const src = template
        .replace('{z}', String(zoom))
        .replace('{x}', String(x))
        .replace('{y}', String(y))
      tiles.push(
        `<img class="trevixal-map__tile" src="${escapeHTML(src)}" alt="" loading="lazy" draggable="false" style="left:${column * TILE}px;top:${row * TILE}px">`,
      )
    }
  }
  const pinX = (center.x - left) * TILE
  const pinY = (center.y - top) * TILE
  const place = label || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  return `<div class="trevixal-map__view"><div class="trevixal-map__sheet" style="--pin-x:${pinX.toFixed(1)}px;--pin-y:${pinY.toFixed(1)}px">${tiles.join('')}<span class="trevixal-map__pin" style="left:${pinX.toFixed(1)}px;top:${pinY.toFixed(1)}px" aria-hidden="true"></span></div></div><div class="trevixal-map__bar"><span class="trevixal-map__place">${escapeHTML(place)}</span><span class="trevixal-map__controls"><button type="button" data-map-zoom="1" aria-label="Zoom in">+</button><button type="button" data-map-zoom="-1" aria-label="Zoom out">−</button></span><span class="trevixal-map__credit">${escapeHTML(options.attribution ?? OSM_ATTRIBUTION)}</span></div>`
}

// ------------------------------------------------------------- conditionals

/** Whether a conditional block's condition holds for the document's variables. */
export function conditionMet(
  node: EditorNode,
  variables: Readonly<Record<string, string>>,
): boolean {
  const name = String(node.attrs.variable ?? '')
  const value = variables[name]
  if (value === undefined || value === '') return false
  const wanted = node.attrs.equals
  return typeof wanted === 'string' && wanted !== '' ? value === wanted : true
}

/** A variable name as a block keeps it; null when it is not one. */
function variableName(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z_][\w-]{0,39}$/.test(value.trim())
    ? value.trim()
    : null
}

// ------------------------------------------------------------------ schema

/**
 * The four node specs: `marginNote`, `poll`, `mapBlock` and `conditional`.
 * `options` names the map tiles, when not OpenStreetMap's.
 */
export function advancedBlockNodes(options: MapNodeOptions = {}): Record<string, NodeSpec> {
  return {
    marginNote: {
      content: 'paragraph+',
      group: 'block',
      attrs: { color: { default: 'yellow' } },
      toHTML: (node) => ({
        tag: 'aside',
        attrs: { class: 'trevixal-margin-note', 'data-color': noteColor(node.attrs.color) },
      }),
      parseHTML: [
        {
          tag: 'aside',
          getAttrs: (element) =>
            (element.getAttribute('class') ?? '').includes('trevixal-margin-note')
              ? { color: noteColor(element.getAttribute('data-color')) }
              : false,
        },
      ],
    },
    poll: {
      group: 'block',
      atom: true,
      attrs: { question: { default: '' }, options: { default: '[]' } },
      toHTML: (node) => ({
        tag: 'div',
        attrs: {
          class: 'trevixal-poll',
          'data-poll': '',
          'data-question': String(node.attrs.question ?? ''),
          'data-options': JSON.stringify(pollOptions(node.attrs.options)),
        },
        innerHTML: pollHTML(node),
      }),
      parseHTML: [
        {
          tag: 'div',
          attribute: 'data-poll',
          getAttrs: (element) => ({
            question: element.getAttribute('data-question') ?? '',
            options: JSON.stringify(pollOptions(element.getAttribute('data-options'))),
          }),
        },
      ],
    },
    mapBlock: {
      group: 'block',
      atom: true,
      attrs: {
        lat: { default: 0 },
        lng: { default: 0 },
        zoom: { default: 13 },
        label: { default: '' },
      },
      toHTML: (node) => ({
        tag: 'figure',
        attrs: {
          class: 'trevixal-map',
          'data-map': '',
          'data-lat': String(clampNumber(node.attrs.lat, -85, 85, 0)),
          'data-lng': String(clampNumber(node.attrs.lng, -180, 180, 0)),
          'data-zoom': String(Math.round(clampNumber(node.attrs.zoom, 1, 18, 13))),
          'data-label': String(node.attrs.label ?? ''),
          role: 'img',
          'aria-label': `Map of ${String(node.attrs.label || `${node.attrs.lat}, ${node.attrs.lng}`)}`,
        },
        innerHTML: mapHTML(node, options),
      }),
      parseHTML: [
        {
          tag: 'figure',
          attribute: 'data-map',
          getAttrs: (element) => ({
            lat: clampNumber(element.getAttribute('data-lat'), -85, 85, 0),
            lng: clampNumber(element.getAttribute('data-lng'), -180, 180, 0),
            zoom: Math.round(clampNumber(element.getAttribute('data-zoom'), 1, 18, 13)),
            label: element.getAttribute('data-label') ?? '',
          }),
        },
      ],
    },
    conditional: {
      content: 'block+',
      group: 'block',
      attrs: { variable: { default: '' }, equals: { default: null } },
      toHTML: (node) => {
        const variable = variableName(node.attrs.variable) ?? ''
        const equals =
          typeof node.attrs.equals === 'string' && node.attrs.equals ? node.attrs.equals : null
        return {
          tag: 'div',
          attrs: {
            class: 'trevixal-conditional',
            'data-if': variable,
            ...(equals ? { 'data-equals': equals } : {}),
          },
        }
      },
      parseHTML: [
        {
          tag: 'div',
          attribute: 'data-if',
          getAttrs: (element) => ({
            variable: variableName(element.getAttribute('data-if')) ?? '',
            equals: element.getAttribute('data-equals') || null,
          }),
        },
      ],
    },
  }
}

// ---------------------------------------------------------------- commands

/** Put a margin note in beside the block at the caret, the caret inside it. */
export function insertMarginNote(color: NoteColor = 'yellow'): Command {
  return (state) => {
    const type = state.schema.nodes.marginNote
    if (!type) return null
    const note = type.create({ color: noteColor(color) }, Fragment.of(emptyParagraph(state.schema)))
    const inserted = insertBlockHere(state, note, false)
    if (!inserted) return null
    return inserted.tr.setSelection(selectFirstTextblock(note, inserted.path))
  }
}

/** Put in a poll asking `question`, one choice per label. */
export function insertPoll(question: string, labels: readonly string[]): Command {
  return (state) => {
    const type = state.schema.nodes.poll
    const choices = labels.map((label) => label.trim()).filter(Boolean)
    if (!type || choices.length < 2) return null
    const options = JSON.stringify(choices.map((label) => ({ label, votes: 0 })))
    return insertBlockHere(state, type.create({ question: question.trim(), options }))?.tr ?? null
  }
}

/** Put in a map of a place. */
export function insertMap(place: {
  lat: number
  lng: number
  zoom?: number
  label?: string
}): Command {
  return (state) => {
    const type = state.schema.nodes.mapBlock
    if (!type || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return null
    const node = type.create({
      lat: clampNumber(place.lat, -85, 85, 0),
      lng: clampNumber(place.lng, -180, 180, 0),
      zoom: Math.round(clampNumber(place.zoom ?? 13, 1, 18, 13)),
      label: place.label ?? '',
    })
    return insertBlockHere(state, node)?.tr ?? null
  }
}

/** A place written as `lat, lng`: two numbers. */
export function parseCoordinates(text: string): { lat: number; lng: number } | null {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text)
  if (!match) return null
  const lat = Number(match[1])
  const lng = Number(match[2])
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null
}

/**
 * Show the selected blocks only while a template variable is set (or set to
 * `equals`): they are wrapped in a conditional block.
 */
export function wrapInConditional(variable: string, equals: string | null = null): Command {
  return (state) => {
    const name = variableName(variable)
    if (!name || !state.schema.nodes.conditional) return null
    const blocks = blocksInRange(state.doc, state.selection.from, state.selection.to)
    const first = blocks[0]
    const last = blocks[blocks.length - 1]
    if (!first || !last) return null
    const parentPath = first.path.slice(0, -1)
    if (!pathsEqual(parentPath, last.path.slice(0, -1))) return null
    const from = first.path[first.path.length - 1] as number
    const to = (last.path[last.path.length - 1] as number) + 1
    const tr = state.tr
    tr.step(
      new WrapNodesStep(parentPath, from, to, 'conditional', {
        variable: name,
        equals: equals?.trim() || null,
      }),
    )
    return tr
  }
}

/** Set the document's template variables. */
export function setTemplateVariables(variables: Readonly<Record<string, string>>): Command {
  return (state) => {
    const kept: Record<string, string> = {}
    for (const [name, value] of Object.entries(variables)) {
      const valid = variableName(name)
      if (valid && value.trim() !== '') kept[valid] = value.trim()
    }
    const names = Object.keys(kept).sort()
    const json =
      names.length > 0
        ? JSON.stringify(Object.fromEntries(names.map((name) => [name, kept[name]])))
        : null
    if (state.doc.attrs.variables === json) return null
    return setDocumentAttrs({ variables: json })(state)
  }
}

/**
 * The document as a reader gets it: a conditional block whose condition
 * holds gives way to its blocks, and one whose condition fails goes. What an
 * export writes out.
 */
export function resolveConditionals(doc: EditorNode): EditorNode {
  const variables = templateVariables(doc.attrs.variables)
  const resolve = (node: EditorNode): EditorNode[] => {
    if (node.type.name === 'conditional') {
      return conditionMet(node, variables) ? node.content.children.flatMap(resolve) : []
    }
    if (node.isTextblock || node.isAtom || node.content.childCount === 0) return [node]
    const children = node.content.children.flatMap(resolve)
    if (children.length === 0)
      return node.type.name === doc.type.name ? [node.withContent(Fragment.empty)] : []
    return [node.withContent(Fragment.from(children))]
  }
  const [resolved] = resolve(doc)
  if (!resolved || resolved.childCount === 0) {
    return doc.withContent(Fragment.of(emptyParagraph(doc.type.schema)))
  }
  return resolved
}

// ------------------------------------------------------------- interaction

export interface AdvancedBlocksOptions {
  /** Change a map's place: asked when its place is double-clicked. */
  readonly editMap?: (current: {
    lat: number
    lng: number
    zoom: number
    label: string
  }) => Promise<{ lat: number; lng: number; zoom: number; label: string } | null> | null
}

/**
 * What the blocks do when used: a poll counts a vote (one each per poll on
 * this page, which a second choice moves), a map zooms from its buttons, and
 * each conditional block says whether it is shown, which the stylesheet
 * draws. Returns a disposer.
 */
export function enableAdvancedBlocks(
  editor: Editor,
  options: AdvancedBlocksOptions = {},
): () => void {
  const view = editor.view
  if (!view) return () => {}
  /** The choice this page voted for in each poll, by where it is. */
  const votes = new Map<string, number>()

  const setAttrs = (path: Path, attrs: Record<string, unknown>): void => {
    const node = nodeAtPath(editor.state.doc, path)
    if (!node) return
    editor.dispatch(editor.state.tr.step(new SetNodeAttrsStep(path, { ...node.attrs, ...attrs })))
  }

  const onClick = (event: MouseEvent): void => {
    const target = event.target as Element | null
    const vote = target?.closest?.('[data-poll-option]')
    const zoom = target?.closest?.('[data-map-zoom]')
    const block = (vote ?? zoom)?.closest('.trevixal-poll, .trevixal-map')
    if (!(block instanceof HTMLElement) || !view.dom.contains(block)) return
    const path = pathOfElement(view.dom, view.renderer, block)
    const node = path ? nodeAtPath(editor.state.doc, path) : null
    if (!path || !node) return
    event.preventDefault()
    if (vote && node.type.name === 'poll') {
      const choice = Number(vote.getAttribute('data-poll-option'))
      const key = path.join('/')
      const before = votes.get(key)
      const counted = pollOptions(node.attrs.options).map((option, index) => ({
        label: option.label,
        votes: option.votes + (index === choice ? 1 : 0) - (index === before ? 1 : 0),
      }))
      if (before === choice) return
      votes.set(key, choice)
      setAttrs(path, { options: JSON.stringify(counted) })
      return
    }
    if (zoom && node.type.name === 'mapBlock') {
      const next = Math.round(
        clampNumber(
          Number(node.attrs.zoom) + Number(zoom.getAttribute('data-map-zoom')),
          1,
          18,
          13,
        ),
      )
      if (next !== node.attrs.zoom) setAttrs(path, { zoom: next })
    }
  }

  const onDoubleClick = (event: MouseEvent): void => {
    const map = (event.target as Element | null)?.closest?.('.trevixal-map')
    if (!(map instanceof HTMLElement) || !view.dom.contains(map) || !options.editMap) return
    const path = pathOfElement(view.dom, view.renderer, map)
    const node = path ? nodeAtPath(editor.state.doc, path) : null
    if (!path || node?.type.name !== 'mapBlock') return
    event.preventDefault()
    void Promise.resolve(
      options.editMap({
        lat: Number(node.attrs.lat),
        lng: Number(node.attrs.lng),
        zoom: Number(node.attrs.zoom),
        label: String(node.attrs.label ?? ''),
      }),
    ).then((place) => {
      if (place) setAttrs(path, { ...place })
    })
  }

  /** Mark each conditional block with whether it shows, for the stylesheet. */
  const mark = (): void => {
    const variables = templateVariables(editor.state.doc.attrs.variables)
    for (const element of view.dom.querySelectorAll<HTMLElement>('.trevixal-conditional')) {
      const path = pathOfElement(view.dom, view.renderer, element)
      const node = path ? nodeAtPath(editor.state.doc, path) : null
      if (!node) continue
      const met = String(conditionMet(node, variables))
      if (element.dataset.conditionMet !== met) element.dataset.conditionMet = met
    }
  }

  view.dom.addEventListener('click', onClick)
  view.dom.addEventListener('dblclick', onDoubleClick)
  const offTransaction = editor.on('transaction', mark)
  mark()
  return () => {
    view.dom.removeEventListener('click', onClick)
    view.dom.removeEventListener('dblclick', onDoubleClick)
    offTransaction()
  }
}
