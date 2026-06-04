import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: ['unseasoned-davian-simperingly.ngrok-free.dev'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
      '/app': {
        target: 'ws://127.0.0.1:8080',
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    sourcemap: 'hidden',
  },
  plugins: [
    react(),
    tsconfigPaths(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  define: {
    'process.env': {},
  },
})
