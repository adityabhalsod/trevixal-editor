/**
 * create-trevixal-extension: scaffold a Trevixal editor extension. The
 * command is `npm create trevixal-extension <package-name>`; what it writes
 * is here too, for a tool of your own.
 */

export { type CreateIO, run } from './run'
export {
  ExtensionNameError,
  type ExtensionNames,
  extensionFiles,
  extensionNames,
} from './templates'
