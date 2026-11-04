import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'

// Aspire passes the API's addresses when it runs the web app: https with the AppHost's "https"
// launch profile, only http with its "http" profile. A plain `npm run dev` uses the API's own
// default address.
/** Where the dev server forwards /api: the API's https address, else its http one, else its default. */
const apiTarget =
  process.env.services__api__https__0 ??
  process.env.services__api__http__0 ??
  'https://localhost:7088'

// The browser only talks to this dev server, which forwards /api to the API. Same origin means
// no CORS, and the browser never has to trust the API's HTTPS certificate.
/** Proxy rule shared by `vite dev` and `vite preview`. On failure it answers 502 problem JSON. */
const apiProxy: Record<string, ProxyOptions> = {
  '/api': {
    target: apiTarget,
    changeOrigin: true,
    secure: false, // Node doesn't read the Windows certificate store, so it can't verify the dev cert
    configure: (proxy) => {
      // Answer with a problem the web app understands instead of an empty error page.
      proxy.on('error', (error, _request, response) => {
        const reason = (error as NodeJS.ErrnoException).code ?? error.message
        console.error(`[designapp] can't reach the API at ${apiTarget}: ${reason}`)
        if (!('writeHead' in response) || response.headersSent) return
        response.writeHead(502, { 'Content-Type': 'application/problem+json' })
        response.end(JSON.stringify({ status: 502, title: 'API unavailable', detail: `The dev server can't reach the API at ${apiTarget}.` }))
      })
    },
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
