import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function resolveProxyTarget(mode) {
  const env = loadEnv(mode, process.cwd(), '')
  return env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000'
}

export default defineConfig(({ mode }) => {
  const target = resolveProxyTarget(mode)
  return {
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target,
        changeOrigin: true,
      },
      '/media': {
        target,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    pool: 'threads',
    maxWorkers: 1,
  },
  }
})
