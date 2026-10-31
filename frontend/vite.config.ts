import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:8000', '/assets-bank': 'http://127.0.0.1:8000' } },
  build: { rollupOptions: { input: { main: resolve(__dirname, 'index.html'), simple: resolve(__dirname, 'simple/index.html') } } },
});
