/**
 * The worker that writes Word, OpenDocument, RTF, LaTeX and PowerPoint files
 * off the main thread, so a long manuscript downloads without the page
 * freezing. It builds the document back from JSON against the kit's own
 * schema, and what the editor drew (highlighted code, diagram pictures)
 * arrives keyed by each block's path.
 */
import { type EditorNode, nodeFromJSON } from '@trevixal/core'
import { type RenderedBlock, exportFormats } from '@trevixal/extension-export'
import type { ExportRequest, ExportResponse } from './export-client'
import { createFullSchema } from './schema'

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<ExportRequest>) => void) | null
  postMessage(message: ExportResponse, transfer?: Transferable[]): void
}

const schema = createFullSchema()
const exporters = exportFormats()

/** What the editor drew, keyed by the rebuilt document's own nodes. */
function renderedFor(
  doc: EditorNode,
  byPath: ReadonlyMap<string, RenderedBlock>,
): Map<EditorNode, RenderedBlock> {
  const rendered = new Map<EditorNode, RenderedBlock>()
  const walk = (node: EditorNode, path: string): void => {
    const block = byPath.get(path)
    if (block) rendered.set(node, block)
    node.content.children.forEach((child, index) =>
      walk(child, path ? `${path}.${index}` : `${index}`),
    )
  }
  walk(doc, '')
  return rendered
}

scope.onmessage = (event) => {
  const { id, format, doc: json, title, theme, rendered } = event.data
  const exporter = exporters.find((entry) => entry.name === format)
  if (!exporter) {
    scope.postMessage({ id, error: `No ${format} writer in the worker.` })
    return
  }
  void (async () => {
    try {
      const doc = nodeFromJSON(schema, json)
      const data = await exporter.serialize(doc, {
        schema,
        title,
        ...(theme ? { theme } : {}),
        rendered: renderedFor(doc, new Map(rendered)),
      })
      scope.postMessage({ id, data }, typeof data === 'string' ? [] : [data.buffer])
    } catch (error) {
      scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
    }
  })()
}
