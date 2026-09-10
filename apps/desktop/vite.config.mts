import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/desktop',
  server: {
    port: 1420,
    host: '127.0.0.1',
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  preview: {
    port: 4300,
    host: 'localhost',
  },
  plugins: [react(), tailwindcss()],
  resolve: { tsconfigPaths: true },
  optimizeDeps: {
    include: [
      '@tauri-apps/plugin-opener',
      '@tauri-apps/plugin-dialog',
      'elkjs/lib/elk.bundled.js',
      '@xyflow/react',
    ],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  define: {
    'import.meta.vitest': undefined,
  },
}));
