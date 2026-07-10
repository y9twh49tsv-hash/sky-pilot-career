import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  plugins: [legacy()],
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1100
  }
});
