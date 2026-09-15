import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// Relative asset paths, so the built page also opens straight from disk.
export default defineConfig({ base: './', plugins: [svelte()] })
