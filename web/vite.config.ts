import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// One self-contained index.html: data, fonts, worker and code are all inlined,
// so the app runs from any static host or straight from disk.
// MARSWALK_BETA=1 builds the beta copy: same app, marked BETA, written to dist-beta
const beta = process.env.MARSWALK_BETA === '1'
export default defineConfig({
  base: './',
  define: { __BETA__: JSON.stringify(beta) },
  publicDir: false,
  plugins: [viteSingleFile()],
  build: { outDir: beta ? 'dist-beta' : 'dist', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 8000, target: 'es2022' },
  worker: { format: 'iife' },
})
