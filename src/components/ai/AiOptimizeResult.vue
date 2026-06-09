<script setup lang="ts">
defineProps<{
  errorMsg: string
  isLoading: boolean
  streamText: string
  suggestionsHtml: string
  optimizedHtml: string
  hasSuggestions: boolean
  hasOptimizedContent: boolean
  isDone: boolean
  canApplySelectedModule: boolean
  canUndoSelectedModule: boolean
  isApplied: boolean
}>()

const emit = defineEmits<{
  (e: 'apply'): void
  (e: 'undo'): void
}>()
</script>

<template>
  <div class="results-area">
    <div v-if="errorMsg" class="error-card">
      <span class="error-icon" aria-hidden="true">
        <svg class="icon-sm" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M15 9l-6 6M9 9l6 6" />
        </svg>
      </span>
      <p class="error-text">{{ errorMsg }}</p>
    </div>

    <div v-if="isLoading && !streamText" class="loading-card">
      <div class="loading-dots">
        <span></span><span></span><span></span>
      </div>
      <p class="loading-text">AI 正在分析中...</p>
    </div>

    <div v-if="hasSuggestions" class="result-card suggestions-card">
      <h4 class="result-card-title">
        <svg class="icon-xs" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <path d="M12 2a7 7 0 0 0-4.7 12.2c1 .9 1.7 2.1 1.7 3.4h6c0-1.3.6-2.5 1.6-3.4A7 7 0 0 0 12 2z" />
        </svg>
        <span>优化建议</span>
      </h4>
      <div class="result-content markdown-content" v-safe-html="suggestionsHtml"></div>
    </div>

    <div v-if="hasOptimizedContent" class="result-card content-card">
      <div class="result-card-header">
        <h4 class="result-card-title">
          <svg class="icon-xs" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14 3h7v7" />
            <path d="M10 14L21 3" />
            <path d="M5 7v14h14v-5" />
          </svg>
          <span>优化后内容</span>
        </h4>
        <div class="result-card-actions">
          <button
            v-if="isDone && canApplySelectedModule && !isApplied"
            class="btn-apply"
            @click="emit('apply')"
          >
            <svg class="icon-xs" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <span>应用此内容</span>
          </button>
          <button
            v-if="isDone && canApplySelectedModule && isApplied && canUndoSelectedModule"
            class="btn-undo"
            @click="emit('undo')"
          >
            <svg class="icon-xs" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 2.6-6.4" />
              <path d="M3 4v4h4" />
            </svg>
            <span>撤回应用</span>
          </button>
          <span v-if="isApplied" class="applied-tag">已应用</span>
          <span v-if="isDone && !canApplySelectedModule" class="applied-tag">仅查看结果</span>
        </div>
      </div>
      <div class="result-content markdown-content" v-safe-html="optimizedHtml"></div>
    </div>

    <span v-if="isLoading && streamText" class="stream-cursor">▌</span>
  </div>
</template>

<style scoped>
.icon-sm {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.icon-xs {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}

.results-area {
  flex: 1 0 auto;
  min-height: auto;
  overflow: visible;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.error-card {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 14px;
  border-radius: 10px;
  background: #fef2f0;
  border: 1px solid #f5d0cc;
}

.error-icon {
  color: #c0392b;
  flex-shrink: 0;
}

.error-text {
  font-size: 13px;
  color: #c0392b;
  line-height: 1.5;
  word-break: break-all;
}

.loading-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 16px;
}

.loading-dots {
  display: flex;
  gap: 6px;
}

.loading-dots span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #d97745;
  animation: bounce 1.2s infinite ease-in-out;
}

.loading-dots span:nth-child(2) { animation-delay: 0.15s; }
.loading-dots span:nth-child(3) { animation-delay: 0.3s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

.loading-text {
  font-size: 13px;
  color: #8a7461;
}

.result-card {
  border-radius: 10px;
  border: 1px solid #e9ded0;
  background: #fff;
  overflow: hidden;
}

.result-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 0;
}

.result-card-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.suggestions-card .result-card-title {
  padding: 12px 14px 0;
}

.result-card-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #2d2521;
}

.result-content {
  padding: 10px 14px 14px;
  font-size: 13px;
  color: #3d3530;
  line-height: 1.75;
  word-break: break-word;
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4) {
  margin: 0 0 8px;
  color: #2d2521;
  line-height: 1.45;
}

.markdown-content :deep(h1),
.markdown-content :deep(h2) {
  font-size: 15px;
  font-weight: 700;
}

.markdown-content :deep(h3),
.markdown-content :deep(h4) {
  font-size: 14px;
  font-weight: 700;
}

.markdown-content :deep(p) {
  margin: 0 0 10px;
}

.markdown-content :deep(ol),
.markdown-content :deep(ul) {
  margin: 0 0 10px;
  padding-left: 20px;
}

.markdown-content :deep(li) {
  margin-bottom: 8px;
}

.markdown-content :deep(strong) {
  color: #2d2521;
  font-weight: 700;
}

.markdown-content :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  background: #f5efe8;
  border-radius: 4px;
  padding: 0 4px;
}

.markdown-content :deep(a) {
  color: #c96a3b;
  text-decoration: underline;
  word-break: break-all;
}

.btn-apply {
  height: 30px;
  padding: 0 12px;
  border: 1px solid #d97745;
  border-radius: 7px;
  background: #d97745;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.btn-apply:hover {
  background: #c96a3b;
  border-color: #c96a3b;
}

.btn-undo {
  height: 30px;
  padding: 0 12px;
  border: 1px solid #ddd2c6;
  border-radius: 7px;
  background: #fff;
  color: #5c4f44;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.btn-undo:hover {
  border-color: #d97745;
  color: #d97745;
}

.applied-tag {
  font-size: 12px;
  font-weight: 600;
  color: #d97745;
  padding: 4px 10px;
  border-radius: 6px;
  background: #fff3eb;
}

.stream-cursor {
  color: #d97745;
  font-weight: 700;
  animation: blink 0.7s steps(2, start) infinite;
}

@keyframes blink {
  to { visibility: hidden; }
}
</style>
