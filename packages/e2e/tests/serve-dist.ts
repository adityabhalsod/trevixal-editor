import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}

export interface StaticServer {
  readonly origin: string
  close(): Promise<void>
}

/**
 * Serve a built example over HTTP. Vite emits module scripts with
 * `crossorigin`, which browsers refuse to load from `file://`, so the
 * examples have to be served to be testable at all.
 */
export async function serveDist(distDir: string): Promise<StaticServer> {
  const server = createServer(async (request, response) => {
    const requested = (request.url ?? '/').split('?')[0] ?? '/'
    // Strip any leading traversal before joining: the path comes off the wire.
    const relative = normalize(requested === '/' ? '/index.html' : requested).replace(
      /^(\.\.[/\\])+/,
      '',
    )
    try {
      const body = await readFile(join(distDir, relative))
      response.writeHead(200, {
        'content-type': TYPES[extname(relative)] ?? 'application/octet-stream',
      })
      response.end(body)
    } catch {
      response.writeHead(404)
      response.end('not found')
    }
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0

  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
