import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/designer/',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  build: {
    // Both apps build into one folder, which the API's Worker serves.
    outDir: '../../dist/site/designer',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    // The API runs beside it with `npm run dev -w @setout/api`.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
});
