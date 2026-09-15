/**
 * A three-line static server, because a page that loads a module script has
 * to be served over http: browsers refuse module and `crossorigin` loads from
 * `file://`. Everything else here works from disk.
 */
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

createServer(async (request, response) => {
  const requested = (request.url ?? '/').split('?')[0] ?? '/'
  const relative = normalize(requested === '/' ? '/index.html' : requested).replace(
    /^(\.\.[/\\])+/,
    '',
  )
  try {
    const body = await readFile(join(here, relative))
    response.writeHead(200, { 'content-type': TYPES[extname(relative)] ?? 'text/plain' })
    response.end(body)
  } catch {
    response.writeHead(404).end('not found')
  }
}).listen(5180, () => console.log('http://localhost:5180'))
