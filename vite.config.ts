import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { getHistory } from './api/_history.js'

const UPSTREAM = 'https://chrisbarbati.ddns.net:2048'

function historyPlugin(): Plugin {
  return {
    name: 'history-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0]
        if (url !== '/api/history') {
          next()
          return
        }
        try {
          const body = await getHistory()
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
  plugins: [vue(), historyPlugin()],
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
