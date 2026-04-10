import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
const devServerPort = Number(process.env.VITE_PORT || '5173')
const apiProxyTarget = process.env.VITE_API_TARGET || 'http://127.0.0.1:3001'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three') || id.includes('@react-three')) {
            return 'vendor-three'
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) {
            return 'vendor-react'
          }
          if (id.includes('node_modules/framer-motion') || id.includes('node_modules/lucide-react') || id.includes('node_modules/zustand')) {
            return 'vendor-ui'
          }
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
  server: {
    host: process.env.VITE_HOST || undefined,
    port: devServerPort,
    proxy: {
      '/api': apiProxyTarget,
      '/auth': apiProxyTarget,
      '/healthz': apiProxyTarget,
      '/uploads': apiProxyTarget
    }
  }
})
