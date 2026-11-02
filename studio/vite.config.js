// Builds the board into ../public/board, which the dependency-free desk server serves as static files.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/board/',
  plugins: [react()],
  build: { outDir: '../public/board', emptyOutDir: true, chunkSizeWarningLimit: 6000 },
  server: { proxy: { '/api': 'http://localhost:8790' } },
});
