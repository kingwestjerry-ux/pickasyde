import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy is not needed — Supabase and Anthropic APIs support CORS
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  // Ensure env vars prefixed with VITE_ are exposed to the client bundle
  envPrefix: 'VITE_',
});
