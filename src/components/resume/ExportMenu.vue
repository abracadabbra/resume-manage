<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

defineProps<{
  exporting: boolean
}>()

const emit = defineEmits<{
  exportPdf: [mode: 'compressed' | 'hd']
  exportMarkdown: []
}>()

const exportMenuOpen = ref(false)
const exportMenuRef = ref<HTMLElement | null>(null)

function closeMenu() {
  exportMenuOpen.value = false
}

function handleExportTriggerClick() {
  exportMenuOpen.value = !exportMenuOpen.value
}

function handleExportTriggerEnter() {
  exportMenuOpen.value = true
}

function handleDocumentPointerDown(event: MouseEvent) {
  const target = event.target as Node | null
  if (!target || !exportMenuRef.value) return
  if (!exportMenuRef.value.contains(target)) {
    closeMenu()
  }
}

function handleExportPdf(mode: 'compressed' | 'hd') {
  closeMenu()
  emit('exportPdf', mode)
}

function handleExportMarkdown() {
  closeMenu()
  emit('exportMarkdown')
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentPointerDown)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleDocumentPointerDown)
})
</script>

<template>
  <div
    ref="exportMenuRef"
    class="export-actions export-dropdown"
    @mouseenter="!exporting && handleExportTriggerEnter()"
  >
    <button class="btn-export" :disabled="exporting" @click="handleExportTriggerClick">
      {{ exporting ? '导出中...' : '导出' }}
    </button>
    <div v-if="exportMenuOpen && !exporting" class="export-menu">
      <button class="export-menu-item" @click="handleExportPdf('hd')">导出高清 PDF</button>
      <button class="export-menu-item" @click="handleExportPdf('compressed')">导出压缩 PDF</button>
      <button class="export-menu-item" @click="handleExportMarkdown">导出 Markdown</button>
    </div>
  </div>
</template>

<style scoped>
.btn-export {
  border: none;
  height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  background: #2d2521;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}

.btn-export:disabled {
  opacity: 0.7;
  cursor: wait;
}

.export-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.export-dropdown {
  position: relative;
}

.export-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 124px;
  padding: 4px;
  border-radius: 8px;
  border: 1px solid #e9ded0;
  background: #fff;
  box-shadow: 0 10px 20px rgba(45, 37, 33, 0.14);
  z-index: 12;
}

.export-menu-item {
  width: 100%;
  border: none;
  border-radius: 6px;
  background: #fff;
  color: #2d2521;
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  padding: 7px 8px;
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease;
}

.export-menu-item:hover {
  background: #eadccf;
  color: #1f1916;
}
</style>
