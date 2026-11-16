import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// One self-contained index.html: data, fonts, worker and code are all inlined,
// so the app runs from any static host or straight from disk.
export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [viteSingleFile()],
  build: { outDir: 'dist', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 8000, target: 'es2022' },
  worker: { format: 'iife' },
})
