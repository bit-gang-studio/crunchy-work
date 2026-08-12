import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** The web app is a plain SPA built to dist/web, which the server serves as static files. */
export default defineConfig({
  root: 'src/web',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
  server: {
    port: 4420,
    // In dev the SPA runs on Vite and proxies the API to the Node server on 4421.
    proxy: { '/api': 'http://localhost:4421' },
  },
})
