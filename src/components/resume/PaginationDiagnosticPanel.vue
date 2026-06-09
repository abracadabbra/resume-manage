<script setup lang="ts">
import type { PaginationDiagnostics } from '@/services/paginationDiagnostics'

defineProps<{
  diagnostics: PaginationDiagnostics
}>()
</script>

<template>
  <div class="diagnostic-panel">
    <div class="diagnostic-summary">
      <div class="diagnostic-summary-main">
        <span class="diagnostic-title">分页诊断</span>
        <span class="diagnostic-summary-text">
          共 {{ diagnostics.totalPages }} 页
          <template v-if="diagnostics.hasSuspiciousWhitespace">
            · 检测到 {{ diagnostics.suspiciousPageCount }} 页留白偏大
          </template>
          <template v-else>
            · 当前留白正常
          </template>
        </span>
      </div>
      <div class="diagnostic-last-page">
        末页留白 {{ diagnostics.lastPageBlankHeight }}px
        （{{ Math.round(diagnostics.lastPageBlankRatio * 100) }}%）
      </div>
    </div>

    <div class="diagnostic-page-grid">
      <div
        v-for="page in diagnostics.pages"
        :key="`diag-page-${page.pageNumber}`"
        class="diagnostic-card"
        :class="{ warn: page.suspiciousBlank }"
      >
        <div class="diagnostic-card-head">
          <span class="diagnostic-card-title">第 {{ page.pageNumber }} 页</span>
          <span class="diagnostic-card-ratio">使用率 {{ Math.round(page.usageRatio * 100) }}%</span>
        </div>
        <div class="diagnostic-card-meta">
          留白 {{ page.blankHeight }}px
          <template v-if="page.breakAt !== null">
            · 断点 {{ page.breakAt }}px
          </template>
        </div>
        <div v-if="page.breakAt !== null" class="diagnostic-card-flow">
          <div>断点前：{{ page.previousLabel || '未识别到块' }}</div>
          <div>断点后：{{ page.nextLabel || '未识别到块' }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diagnostic-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border: 1px solid #e6d8c9;
  border-radius: 8px;
  background: #fff9f4;
}

.diagnostic-summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.diagnostic-summary-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.diagnostic-title {
  font-size: 13px;
  font-weight: 700;
  color: #2d2521;
}

.diagnostic-summary-text,
.diagnostic-last-page {
  font-size: 12px;
  color: #7b6a5b;
  line-height: 1.5;
}

.diagnostic-page-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.diagnostic-card {
  padding: 10px;
  border: 1px solid #eadfce;
  border-radius: 8px;
  background: #fff;
}

.diagnostic-card.warn {
  border-color: #f1c0a6;
  background: #fff7f2;
}

.diagnostic-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.diagnostic-card-title {
  font-size: 12px;
  font-weight: 700;
  color: #2d2521;
}

.diagnostic-card-ratio {
  font-size: 11px;
  font-weight: 700;
  color: #b45e33;
}

.diagnostic-card-meta,
.diagnostic-card-flow {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.5;
  color: #7b6a5b;
}

@media (max-width: 1280px) {
  .diagnostic-summary {
    flex-direction: column;
  }
}
</style>
