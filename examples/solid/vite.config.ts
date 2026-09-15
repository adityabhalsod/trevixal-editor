import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

// Relative asset paths, so the built page also opens straight from disk.
export default defineConfig({ base: './', plugins: [solid()] })
