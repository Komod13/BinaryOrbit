import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: 'web',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./web/src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
      '/_AMapService': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
});
