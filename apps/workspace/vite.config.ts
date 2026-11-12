import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    // Both apps build into one folder, which the API's Worker serves.
    outDir: '../../dist/site',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // The API runs beside it with `npm run dev -w @setout/api`.
    // CRL's product photos are among the designer's files, which the API serves too.
    proxy: { '/api': 'http://127.0.0.1:8787', '/designer/assets/crl': 'http://127.0.0.1:8787' },
  },
});
