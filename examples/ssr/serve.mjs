/** A three-line static server for `dist/`. */
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), 'dist')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

createServer(async (request, response) => {
  const requested = (request.url ?? '/').split('?')[0] ?? '/'
  const relative = normalize(requested === '/' ? '/index.html' : requested).replace(
    /^(\.\.[/\\])+/,
    '',
  )
  try {
    const body = await readFile(join(root, relative))
    response.writeHead(200, { 'content-type': TYPES[extname(relative)] ?? 'text/plain' })
    response.end(body)
  } catch {
    response.writeHead(404).end('not found')
  }
}).listen(5181, () => console.log('http://localhost:5181'))
