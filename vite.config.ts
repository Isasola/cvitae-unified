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
          // Core React runtime — tiny, keep in main
          if (id.includes('react/') || id.includes('react-dom/')) return 'vendor-react'
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
