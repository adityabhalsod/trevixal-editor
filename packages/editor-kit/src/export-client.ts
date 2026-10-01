/**
 * Downloads written in a worker. The formats that need nothing of the page
 * (Word, OpenDocument, RTF, LaTeX, PowerPoint) go to `export-worker.ts`;
 * everything else, and everything where a worker cannot start, is written
 * on the main thread as before.
 */
import type { DocJSON, EditorNode } from '@trevixal/core'
import type { RenderedBlock } from '@trevixal/extension-export'
import type { DocumentExporter, ExportContext } from '@trevixal/ui'

/** The formats the worker writes: none of them reads the page's DOM. */
export const WORKER_FORMATS: ReadonlySet<string> = new Set(['docx', 'odt', 'rtf', 'latex', 'pptx'])

export interface ExportRequest {
  readonly id: number
  readonly format: string
  readonly doc: DocJSON
  readonly title: string
  readonly theme?: ExportContext['theme']
  /** What the editor drew, by each block's path joined with dots. */
  readonly rendered: readonly (readonly [string, RenderedBlock])[]
}

export type ExportResponse =
  | { readonly id: number; readonly data: string | Uint8Array }
  | { readonly id: number; readonly error: string }

/** A download written off the main thread; null for a format the worker leaves alone. */
export type WorkerSerialize = (
  exporter: DocumentExporter,
  doc: EditorNode,
  context: ExportContext,
) => Promise<string | Uint8Array> | null

/** Paths for what the editor drew, so the worker can find the blocks again. */
function renderedByPath(doc: EditorNode, context: ExportContext): [string, RenderedBlock][] {
  const rendered = context.rendered
  if (!rendered || rendered.size === 0) return []
  const entries: [string, RenderedBlock][] = []
  const walk = (node: EditorNode, path: string): void => {
    const block = rendered.get(node)
    if (block) entries.push([path, block])
    node.content.children.forEach((child, index) =>
      walk(child, path ? `${path}.${index}` : `${index}`),
    )
  }
  walk(doc, '')
  return entries
}

/**
 * A serializer that hands the formats it can to a worker, started on the
 * first download. Where a worker cannot start (a page without module
 * workers, the one-script CDN build) it answers null, and the exporter
 * writes the file where it always has.
 */
export function createWorkerSerializer(): WorkerSerialize {
  let worker: Worker | null | undefined
  let next = 0
  const pending = new Map<
    number,
    { resolve: (data: string | Uint8Array) => void; reject: (error: Error) => void }
  >()
  const start = (): Worker | null => {
    if (worker !== undefined) return worker
    try {
      worker = new Worker(new URL('./export-worker.js', import.meta.url), { type: 'module' })
    } catch {
      worker = null
      return null
    }
    worker.onmessage = (event: MessageEvent<ExportResponse>) => {
      const waiting = pending.get(event.data.id)
      if (!waiting) return
      pending.delete(event.data.id)
      if ('error' in event.data) waiting.reject(new Error(event.data.error))
      else waiting.resolve(event.data.data)
    }
    worker.onerror = () => {
      // A worker that cannot load its script fails every download in it:
      // they fall back, and the next one does not try the worker again.
      for (const waiting of pending.values()) waiting.reject(new Error('The export worker failed.'))
      pending.clear()
      worker?.terminate()
      worker = null
    }
    return worker
  }
  return (exporter, doc, context) => {
    if (!WORKER_FORMATS.has(exporter.name)) return null
    const running = start()
    if (!running) return null
    const id = next++
    const request: ExportRequest = {
      id,
      format: exporter.name,
      doc: doc.toJSON() as DocJSON,
      title: context.title,
      ...(context.theme ? { theme: context.theme } : {}),
      rendered: renderedByPath(doc, context),
    }
    return new Promise<string | Uint8Array>((resolve, reject) => {
      pending.set(id, { resolve, reject })
      running.postMessage(request)
    }).catch(() => exporter.serialize(doc, context))
  }
}
