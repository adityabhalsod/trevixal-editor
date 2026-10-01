import { type EditorNode, Fragment, type TextNode } from '@trevixal/core'
import { FORM_FIELD, fieldName } from './fields'

/**
 * Mail merge: one document per row of a CSV or JSON file, each field (and
 * each `{{name}}` in the text) filled from the column of its name.
 */

/** One row: its values by column name. */
export type MergeRow = Readonly<Record<string, string>>

/** A file with no rows this can read. */
export class MergeFileError extends Error {
  override readonly name = 'MergeFileError'
}

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and line breaks inside quotes. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index] as string
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"'
        index++
      } else if (char === '"') quoted = false
      else field += char
      continue
    }
    if (char === '"') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += char
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((each) => each.some((value) => value.trim() !== ''))
}

/** The rows of a CSV file with a header line, or of a JSON array of objects. */
export function parseMergeRows(text: string): MergeRow[] {
  const start = text.trimStart()
  let rows: MergeRow[]
  if (start.startsWith('[')) {
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      throw new MergeFileError('This file is not JSON.')
    }
    rows = (Array.isArray(data) ? data : []).flatMap((entry) =>
      typeof entry === 'object' && entry !== null
        ? [
            Object.fromEntries(
              Object.entries(entry as Record<string, unknown>).map(([key, value]) => [
                key,
                value === null || value === undefined ? '' : String(value),
              ]),
            ),
          ]
        : [],
    )
  } else {
    const [header, ...body] = parseCSV(text)
    const names = (header ?? []).map((name) => name.trim())
    rows = body.map((cells) =>
      Object.fromEntries(names.map((name, index) => [name, cells[index] ?? ''])),
    )
  }
  if (rows.length === 0) throw new MergeFileError('No rows were found in this file.')
  return rows
}

const PLACEHOLDER = /\{\{\s*([A-Za-z_][\w-]*)\s*\}\}/g

/** The document with its fields filled and its `{{name}}` placeholders replaced from `row`. */
export function mergeDocument(doc: EditorNode, row: MergeRow): EditorNode {
  const visit = (node: EditorNode): EditorNode => {
    if (node.type.name === FORM_FIELD) {
      const name = fieldName(node.attrs.name)
      const value = name ? row[name] : undefined
      return value === undefined ? node : node.type.create({ ...node.attrs, value })
    }
    if (node.isText) {
      const text = (node as TextNode).text
      if (!text.includes('{{')) return node
      const merged = text.replace(PLACEHOLDER, (whole, name: string) => row[name] ?? whole)
      return merged === '' ? node : node.type.schema.text(merged, node.marks)
    }
    if (node.content.childCount === 0) return node
    return node.withContent(Fragment.from(node.content.children.map(visit)))
  }
  return visit(doc)
}

/** A file name for a row's document: its first value, made safe, or its number. */
export function rowName(row: MergeRow, index: number): string {
  const first = Object.values(row).find((value) => value.trim() !== '') ?? ''
  const safe = first
    .replace(/[^\p{L}\p{N} _-]+/gu, '')
    .trim()
    .slice(0, 60)
  return safe || `Document ${index + 1}`
}
