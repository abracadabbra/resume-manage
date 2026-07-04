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
    // tech-interview-data 是按需加载的题库数据（1.2MB+），不影响首屏
    // pdf-jspdf / pdf-html2canvas 仅在导出 PDF 时加载
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('jspdf')) return 'pdf-jspdf'
          if (id.includes('html2canvas')) return 'pdf-html2canvas'
          if (id.includes('markdown-it')) return 'markdown'
          // 题库数据文件单独成 chunk，避免和业务代码混在一起
          if (id.includes('/src/data/interview-questions.json')) return 'question-bank-data'
          if (id.includes('/src/data/tech-interview-questions.json')) return 'tech-interview-data'
          if (id.includes('/src/data/jd-default-questions.json')) return 'jd-default-data'
          // Vue 生态依赖单独分组，减少主 chunk 体积
          if (id.includes('node_modules/vue')) return 'vendor-vue'
          if (id.includes('node_modules/pinia')) return 'vendor-vue'
          if (id.includes('node_modules/@vue')) return 'vendor-vue'
          if (id.includes('node_modules/vue-router')) return 'vendor-vue'
          return undefined
        },
      },
    },
  },
}))
