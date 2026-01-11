import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'window',
  },
  server: {
    port: 80,
    proxy: {
      '/api': {
        target: 'http://localhost:50',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
