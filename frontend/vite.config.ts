import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    strictPort: true,
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
