import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

/** 构建时间戳：启动横幅 / 调试面板都会显示，用来确认手机上跑的是不是最新前端。 */
function buildStamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export default defineConfig({
  root: 'web',
  plugins: [vue()],
  define: {
    __BUILD_STAMP__: JSON.stringify(buildStamp()),
  },
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
