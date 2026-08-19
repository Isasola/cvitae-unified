import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          // PDF generation — only loaded in CV/application hub routes
          if (id.includes('jspdf') || id.includes('pdfjs')) return 'vendor-pdf'
          // Supabase client
          if (id.includes('@supabase')) return 'vendor-supabase'
          // React runtime + its internal deps in one chunk to avoid circular init (TDZ)
          // scheduler and use-sync-external-store are react-dom internals that must
          // stay in the same chunk — splitting them causes "Cannot access X before initialization"
          if (
            id.includes('/react/') || id.includes('/react-dom/') ||
            id.includes('/scheduler/') || id.includes('/use-sync-external-store/')
          ) return 'vendor-react'
          // Everything else — shared vendor chunk
          return 'vendor'
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/.netlify/functions': {
        target: 'http://localhost:9999',
        changeOrigin: true,
      },
    },
  },
})
