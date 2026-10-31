import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Browser-only lab: no API proxy.
export default defineConfig({
  plugins: [react()],
  // Dev server: localhost only, port from VITE_PORT (Vite's default when unset)
  server: { port: Number(process.env.VITE_PORT) || undefined },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    testTimeout: 20000
  }
});
