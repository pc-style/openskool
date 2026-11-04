import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'

const BUILD_ID = Date.now().toString(36)

/** Lists the built files for public/sw.js to precache, as /sw-assets.json. */
function swAssets(): Plugin {
  return {
    name: 'sw-assets',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => f.startsWith('assets/') && !f.endsWith('.map'))
        .map((f) => `/${f}`)
      this.emitFile({ type: 'asset', fileName: 'sw-assets.json', source: JSON.stringify({ version: BUILD_ID, files }) })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), swAssets()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
