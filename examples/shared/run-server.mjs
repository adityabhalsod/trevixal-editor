/**
 * Run an example's dev server, and let Ctrl+C stop it without an error.
 *
 * pnpm counts a script that ends on a signal as a failed one. Stopping
 * `vite`, `next dev` or `nuxt dev` with Ctrl+C therefore printed
 * `Command failed with signal "SIGINT"` (ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL,
 * or ELIFECYCLE from inside the example) over a server that had stopped as
 * asked. This passes the stop on, waits for the server, and exits 0 when the
 * stop was asked for. Any other exit keeps the server's own code.
 *
 * The scripts start it with `exec`, which puts it in place of the shell pnpm
 * runs the script in. Ubuntu's `sh`, dash, dies on Ctrl+C itself, whatever
 * its child does, and pnpm would report that instead. `exec` is a POSIX shell
 * builtin, so on Windows these scripts need WSL or Git Bash as pnpm's shell.
 *
 *     "dev": "exec node ../shared/run-server.mjs vite"
 */
import { spawn } from 'node:child_process'

const [command, ...args] = process.argv.slice(2)
// Windows starts `vite` and the rest through `.cmd` shims, which need a shell.
const server = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32' })

let stopping = false
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true
    server.kill(signal)
  })
}

server.on('error', (error) => {
  console.error(error.message)
  process.exit(1)
})
server.on('exit', (code) => process.exit(stopping ? 0 : (code ?? 1)))
