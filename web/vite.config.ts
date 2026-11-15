/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Sub-path hosting (for example GitHub Pages), set by scripts/build-deploy.ts --base.
  base: process.env.HOTSPOTS_BASE ?? '/',
  // scripts/build-deploy.ts copies public/ itself, without the data folders.
  publicDir: process.env.HOTSPOTS_NO_PUBLIC === '1' ? false : 'public',
  server: {
    host: '127.0.0.1',
    port: 5288,
    strictPort: true,
    watch: {
      ignored: ['**/public/data/**', '**/public/firms/**'],
    },
  },
  preview: { host: '127.0.0.1', port: 5289, strictPort: true },
  build: { chunkSizeWarningLimit: 2500 },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
});
