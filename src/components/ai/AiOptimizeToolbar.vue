<script setup lang="ts">
import { computed } from 'vue'

interface VisibleModule {
  key: string
  label: string
}

const props = defineProps<{
  modelName: string
  selectedModule: string
  visibleModules: VisibleModule[]
  isLoading: boolean
  isDone: boolean
  isConfigured: boolean
}>()

const emit = defineEmits<{
  (e: 'update:selectedModule', value: string): void
  (e: 'open-config'): void
  (e: 'close'): void
  (e: 'optimize'): void
  (e: 'stop'): void
  (e: 'reset'): void
}>()

const selectedModuleValue = computed({
  get: () => props.selectedModule,
  set: (value) => emit('update:selectedModule', value),
})
</script>

<template>
  <div class="panel-header">
    <div class="panel-header-left">
      <span class="panel-icon" aria-hidden="true">
        <svg class="icon-md" viewBox="0 0 24 24">
          <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z" />
          <path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z" />
          <path d="M5 15l.7 1.6L7.3 17l-1.6.7L5 19.3l-.7-1.6L2.7 17l1.6-.7L5 15z" />
        </svg>
      </span>
      <h3 class="panel-title">AI 优化建议</h3>
    </div>
    <div class="panel-header-right">
      <button
        class="config-btn"
        :data-model-tooltip="modelName || '配置模型'"
        @click="emit('open-config')"
      >
        <svg class="icon-xs" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        <span class="config-btn-text">{{ modelName || '配置' }}</span>
      </button>
      <button class="close-btn" @click="emit('close')" aria-label="关闭">
        <svg class="icon-sm" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 6L6 18" />
          <path d="M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>

  <div class="selector-section">
    <label class="selector-label">选择要优化的模块</label>
    <select v-model="selectedModuleValue" class="module-select">
      <option value="" disabled>请选择模块...</option>
      <option v-for="mod in visibleModules" :key="mod.key" :value="mod.key">
        {{ mod.label }}
      </option>
    </select>

    <div class="action-row">
      <button
        v-if="!isLoading"
        class="btn-optimize"
        :disabled="!selectedModule || !isConfigured"
        @click="emit('optimize')"
      >
        <svg class="icon-xs" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 19l4.5-1.5L20 7a2.8 2.8 0 1 0-4-4L5.5 13.5 4 18l1 1z" />
          <path d="M13 6l5 5" />
        </svg>
        <span>开始优化</span>
      </button>
      <button v-else class="btn-stop" @click="emit('stop')">
        <svg class="icon-xs" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="7" y="7" width="10" height="10" rx="1.8" />
        </svg>
        <span>停止生成</span>
      </button>

      <button
        v-if="isDone"
        class="btn-reset"
        @click="emit('reset')"
      >
        <svg class="icon-xs" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 11a8 8 0 1 0 2.3 5.7" />
          <path d="M20 4v7h-7" />
        </svg>
        <span>重新生成</span>
      </button>
    </div>

    <p v-if="!isConfigured" class="config-tip">
      <svg class="icon-xs config-tip-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3l10 18H2L12 3z" />
        <path d="M12 9v5" />
        <path d="M12 18h.01" />
      </svg>
      <span>请先点击右上角</span>
      <button class="inline-link" @click="emit('open-config')">配置 AI 服务</button>
    </p>
  </div>
</template>

<style scoped>
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e9ded0;
  background: #fff;
  flex-shrink: 0;
}

.panel-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-icon {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.icon-md {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: #d97745;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

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

.panel-title {
  font-size: 15px;
  font-weight: 700;
  color: #2d2521;
}

.panel-header-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.config-btn {
  position: relative;
  height: 30px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid #ddd2c6;
  background: #fff;
  color: #5c4f44;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  max-width: 160px;
  overflow: visible;
}

.config-btn-text {
  flex: 1;
  min-width: 0;
  display: inline-block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.config-btn::before,
.config-btn::after {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.config-btn::before {
  content: '';
  position: absolute;
  left: 50%;
  top: calc(100% + 3px);
  transform: translate(-50%, -6px);
  border: 5px solid transparent;
  border-bottom-color: #2d2521;
  z-index: 60;
}

.config-btn::after {
  content: attr(data-model-tooltip);
  position: absolute;
  left: 50%;
  top: calc(100% + 8px);
  transform: translate(-50%, -6px);
  width: max-content;
  max-width: min(680px, 88vw);
  padding: 6px 8px;
  border-radius: 6px;
  background: #2d2521;
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  white-space: nowrap;
  word-break: normal;
  overflow-wrap: anywhere;
  z-index: 61;
}

.config-btn:hover::before,
.config-btn:hover::after,
.config-btn:focus-visible::before,
.config-btn:focus-visible::after {
  opacity: 1;
  transform: translate(-50%, 0);
}

.config-btn:hover {
  border-color: #d97745;
  color: #d97745;
}

.close-btn {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: #f5f0ea;
  color: #8a7461;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: #efe7dc;
  color: #d97745;
}

.selector-section {
  padding: 16px 20px;
  border-bottom: 1px solid #e9ded0;
  background: #fff;
  flex-shrink: 0;
}

.selector-label {
  font-size: 12px;
  font-weight: 600;
  color: #5c4f44;
  margin-bottom: 6px;
  display: block;
}

.module-select {
  width: 100%;
  height: 40px;
  border: 1px solid #ddd2c6;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 13px;
  color: #2d2521;
  background: #faf7f4;
  appearance: auto;
}

.module-select:focus {
  outline: none;
  border-color: #d97745;
  box-shadow: 0 0 0 3px rgba(217, 119, 69, 0.12);
}

.action-row {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}

.btn-optimize {
  flex: 1;
  height: 38px;
  border: none;
  border-radius: 8px;
  background: #d97745;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: background 0.15s;
}

.btn-optimize:hover:not(:disabled) {
  background: #c96a3b;
}

.btn-optimize:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-stop {
  flex: 1;
  height: 38px;
  border: none;
  border-radius: 8px;
  background: #e74c3c;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn-stop:hover {
  background: #c0392b;
}

.btn-reset {
  height: 38px;
  padding: 0 14px;
  border: 1px solid #ddd2c6;
  border-radius: 8px;
  background: #fff;
  color: #5c4f44;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-reset:hover {
  border-color: #d97745;
  color: #d97745;
}

.config-tip {
  margin-top: 8px;
  font-size: 12px;
  color: #c96a3b;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.config-tip-icon {
  color: #c96a3b;
}

.inline-link {
  border: none;
  background: none;
  color: #d97745;
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
}
</style>
