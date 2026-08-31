import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { getHistory, getPastRange } from './api/_history.js'

const UPSTREAM = 'https://chrisbarbati.ddns.net:2048'

function serverApiPlugin(): Plugin {
  return {
    name: 'history-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        let path = url.pathname
        if (path.endsWith('/')) path = path.slice(0, -1)
        let body: unknown
        try {
          if (path === '/api/history') {
            body = await getHistory()
          } else if (path === '/api/archive') {
            const range = await getPastRange({
              days: url.searchParams.get('days') ?? undefined,
              from: url.searchParams.get('from') ?? undefined,
              to: url.searchParams.get('to') ?? undefined,
              bucketHours: url.searchParams.get('bucket-hours') ?? undefined,
            })
            body = range.points
          } else {
            next()
            return
          }
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'public, max-age=120')
          res.end(JSON.stringify(body))
        } catch (err) {
          console.error('[history]', err)
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'history unavailable' }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), serverApiPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api/weather': {
        target: UPSTREAM,
        changeOrigin: true,
        secure: false,
        rewrite: () => '/API/weather?temp-unit=celsius&pressure-unit=millibar',
      },
      '/api/pasthour': {
        target: UPSTREAM,
        changeOrigin: true,
        secure: false,
        rewrite: () => '/API/weather/pasthour',
      },
      '/api/forecast': {
        target: UPSTREAM,
        changeOrigin: true,
        secure: false,
        rewrite: () => '/API/weather/forecast',
      },
    },
  },
})
