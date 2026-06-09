import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: '/resume-manage/',
  plugins: [
    vue(),
    command === 'serve' ? vueDevTools() : null,
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('jspdf')) return 'pdf-jspdf'
          if (id.includes('html2canvas')) return 'pdf-html2canvas'
          if (id.includes('markdown-it')) return 'markdown'
          if (id.includes('/src/data/interview-questions.json')) return 'question-bank-data'
          return undefined
        },
      },
    },
  },
}))
