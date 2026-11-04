import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'

// Aspire passes the API's address when it runs the web app; a plain `npm run dev` uses the
// API's default launch-settings address.
const apiTarget =
  process.env.API_HTTPS ?? process.env.services__api__https__0 ?? 'https://localhost:7088'

// The browser only talks to this dev server, which forwards /api to the API. Same origin means
// no CORS, and the browser never has to trust the API's HTTPS certificate.
const apiProxy: Record<string, ProxyOptions> = {
  '/api': {
    target: apiTarget,
    changeOrigin: true,
    secure: false, // Node doesn't read the Windows certificate store, so it can't verify the dev cert
  },
}

console.info(`[designapp] forwarding /api to ${apiTarget}`)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
})
