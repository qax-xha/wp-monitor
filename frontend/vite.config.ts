import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { codeInspectorPlugin } from 'code-inspector-plugin';
import pages from 'vite-plugin-pages';

export default defineConfig({
  plugins: [
    codeInspectorPlugin({ bundler: 'vite' }),
    react(),
    pages({
      dirs: [{ dir: 'src/views/pages', baseRoute: '' }],
      exclude: ['**/components/**'],
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://monitor.alpha.warpparse.com',
        changeOrigin: true,
      }
    },
  }
});
