import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { type CreateIO, run } from './run'

/** The machine's file system and console, for `run`. */
const nodeIO: CreateIO = {
  isFree: async (directory) => {
    try {
      return (await readdir(directory)).length === 0
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
      throw error
    }
  },
  write: async (path, text) => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, text)
  },
  log: (line) => console.log(line),
  error: (line) => console.error(line),
}

process.exitCode = await run(process.argv.slice(2), nodeIO)
