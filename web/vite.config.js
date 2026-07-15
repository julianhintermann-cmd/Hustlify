import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The production build lands in dist/ and is served by the Node server.
// During `vite dev`, API calls are proxied to the running backend on port 3000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/healthz': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
