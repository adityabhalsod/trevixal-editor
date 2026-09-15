import { type ChildProcess, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import type { StaticServer } from './serve-dist'

/**
 * Run an example that needs a server of its own, and wait until it answers.
 *
 * Most examples build to a folder of files, and `serveDist` is enough for
 * those. A Next.js app is not one of them: `next build` produces a bundle its
 * own runtime serves, and that runtime is exactly what a Vercel deployment
 * runs, so testing the folder instead would be testing something the reader
 * never gets.
 */

/** Ask the operating system for a port, then give it straight back. */
async function freePort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const address = probe.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  return port
}

/** Poll until the server answers anything at all, or give up. */
async function waitForServer(origin: string, child: ChildProcess, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${origin}: exited with ${child.exitCode}`)
    try {
      await fetch(origin, { signal: AbortSignal.timeout(2_000) })
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw new Error(`${origin}: still not answering after ${timeoutMs}ms`)
}

export interface AppServerOptions {
  /** Directory to run in: the example's own folder. */
  readonly cwd: string
  readonly command: string
  readonly args: readonly string[]
}

export async function serveApp(options: AppServerOptions): Promise<StaticServer> {
  const port = await freePort()
  const origin = `http://127.0.0.1:${port}`
  const child = spawn(options.command, [...options.args], {
    cwd: options.cwd,
    // The port reaches the app two ways because frameworks disagree about
    // which one they read, and passing both costs nothing.
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
    stdio: 'ignore',
    shell: process.platform === 'win32',
  })

  try {
    await waitForServer(origin, child)
  } catch (error) {
    child.kill('SIGKILL')
    throw error
  }

  return {
    origin,
    close: () =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null) return resolve()
        child.once('exit', () => resolve())
        child.kill('SIGTERM')
        // A framework server that ignores SIGTERM would otherwise hold the
        // whole run open; the suite is finished with it either way.
        setTimeout(() => child.kill('SIGKILL'), 5_000).unref()
      }),
  }
}
