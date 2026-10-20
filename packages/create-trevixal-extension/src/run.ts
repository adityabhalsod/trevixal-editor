import manifest from '../package.json' with { type: 'json' }
import { ExtensionNameError, extensionFiles, extensionNames } from './templates'

/** What the command needs of the machine: kept apart, so it can be tested without one. */
export interface CreateIO {
  /** Whether a directory is missing or empty, so writing into it overwrites nothing. */
  readonly isFree: (directory: string) => Promise<boolean>
  /** Write a file, making its directories. */
  readonly write: (path: string, text: string) => Promise<void>
  readonly log: (line: string) => void
  readonly error: (line: string) => void
}

const USAGE = [
  'Usage: create-trevixal-extension <package-name> [directory]',
  '',
  'Makes a Trevixal editor extension: a package with a node type, its',
  'commands, a menu entry and tests, laid out as the shipped extensions are.',
  '',
  '  npm create trevixal-extension @acme/trevixal-extension-sticky-note',
]

/** Run the command on `args`; resolves to its exit code. */
export async function run(
  args: readonly string[],
  io: CreateIO,
  trevixalVersion: string = manifest.version,
): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    for (const line of USAGE) io.log(line)
    return 0
  }
  const [packageName, given] = args
  if (!packageName || args.length > 2) {
    for (const line of USAGE) io.error(line)
    return 1
  }
  let files: ReadonlyMap<string, string>
  let directory: string
  try {
    files = extensionFiles(packageName, trevixalVersion)
    directory = given ?? extensionNames(packageName).directory
  } catch (error) {
    if (!(error instanceof ExtensionNameError)) throw error
    io.error(error.message)
    return 1
  }
  if (!(await io.isFree(directory))) {
    io.error(`${directory} is not empty: choose another directory, or empty it first.`)
    return 1
  }
  for (const [path, text] of files) await io.write(`${directory}/${path}`, text)
  io.log(`Made ${packageName} in ${directory}. Next:`)
  io.log('')
  io.log(`  cd ${directory}`)
  io.log('  npm install')
  io.log('  npm test')
  return 0
}
