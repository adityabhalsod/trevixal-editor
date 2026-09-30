import { type Plugin, defineConfig } from 'vite'
import { serviceWorkerSource } from './service-worker'

/** The files `public/` puts beside the build, which the bundle does not list. */
const PUBLIC_FILES = ['manifest.webmanifest', 'icon.svg']

/**
 * Write `sw.js` once the bundle is known, with every file of it to cache.
 * Only for a build: the dev server's modules are not an app shell.
 */
function serviceWorker(): Plugin {
  return {
    name: 'trevixal-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = [
        ...Object.keys(bundle).filter((name) => !name.endsWith('.map') && name !== 'index.html'),
        ...PUBLIC_FILES,
      ]
      // The hashed file names are the build's fingerprint: a new build is a new worker.
      const version = String(
        files
          .join('|')
          .split('')
          .reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7),
      )
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: serviceWorkerSource(files, version),
      })
    },
  }
}

// Relative asset paths so the built page also opens straight from disk.
export default defineConfig({ base: './', plugins: [serviceWorker()] })
