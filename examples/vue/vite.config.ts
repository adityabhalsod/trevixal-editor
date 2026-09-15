import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Relative asset paths, so the built page also opens straight from disk.
export default defineConfig({ base: './', plugins: [vue()] })
