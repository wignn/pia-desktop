import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.PIA_API_KEY || process.env.PIA_API_KEY || ''
  const baseUrl = env.PIA_BASE_URL || process.env.PIA_BASE_URL || 'https://api-engine.wign.dev'
  const wsUrl = env.PIA_WS_URL || process.env.PIA_WS_URL || 'wss://api-engine.wign.dev/api/v1/ws'

  return {
    main: {
      resolve: {
        alias: {
          '@shared': resolve('src/shared')
        }
      },
      build: {
        sourcemap: false,
        minify: true
      },
      define: {
        'process.env.PIA_API_KEY': JSON.stringify(apiKey),
        'process.env.PIA_BASE_URL': JSON.stringify(baseUrl),
        'process.env.PIA_WS_URL': JSON.stringify(wsUrl)
      }
    },
    preload: {
      resolve: {
        alias: {
          '@shared': resolve('src/shared')
        }
      },
      build: {
        sourcemap: false,
        minify: true
      }
    },
    renderer: {
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src'),
          '@shared': resolve('src/shared')
        }
      },
      build: {
        sourcemap: false,
        minify: 'esbuild'
      },
      optimizeDeps: {
        exclude: ['maplibre-gl']
      },
      plugins: [react()]
    }
  }
})
