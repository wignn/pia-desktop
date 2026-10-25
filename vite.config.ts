import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import process from 'node:process'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const host = process.env.TAURI_DEV_HOST
  const baseUrl =
    env.PIA_BASE_URL ||
    env.VITE_PIA_BASE_URL ||
    process.env.PIA_BASE_URL ||
    'https://api-engine.wign.dev'
  const wsUrl =
    env.PIA_WS_URL ||
    env.VITE_PIA_WS_URL ||
    process.env.PIA_WS_URL ||
    'wss://api-engine.wign.dev/api/v1/ws'

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@renderer': path.resolve(import.meta.dirname, 'src'),
        '@shared': path.resolve(import.meta.dirname, 'src/shared')
      }
    },
    define: {
      'process.env.PIA_BASE_URL': JSON.stringify(baseUrl),
      'process.env.PIA_WS_URL': JSON.stringify(wsUrl),
      'import.meta.env.VITE_PIA_BASE_URL': JSON.stringify(baseUrl),
      'import.meta.env.VITE_PIA_WS_URL': JSON.stringify(wsUrl)
    },
    optimizeDeps: {
      exclude: ['maplibre-gl']
    },
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: 'ws',
            host,
            port: 1421
          }
        : undefined,
      watch: {
        ignored: ['**/src-tauri/**']
      }
    }
  }
})
