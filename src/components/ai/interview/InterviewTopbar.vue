<script setup lang="ts">
import type { InterviewMode } from '@/services/interviewService'

defineProps<{
  mode: InterviewMode
  isAiConfigured: boolean
  modelName: string
  showResumePreview: boolean
}>()

const emit = defineEmits<{
  (e: 'switch-mode', mode: InterviewMode): void
  (e: 'open-config'): void
  (e: 'toggle-resume-preview'): void
}>()
</script>

<template>
  <header class="topbar">
    <div class="role-switch">
      <button
        type="button"
        class="mode-btn"
        :class="{ active: mode === 'candidate' }"
        @click="emit('switch-mode', 'candidate')"
      >
        你是面试者
      </button>
      <button
        type="button"
        class="mode-btn"
        :class="{ active: mode === 'interviewer' }"
        @click="emit('switch-mode', 'interviewer')"
      >
        你是面试官
      </button>
    </div>

    <div class="top-actions">
      <button
        class="interview-config-btn"
        type="button"
        :data-model-tooltip="isAiConfigured ? modelName : '配置模型'"
        @click="emit('open-config')"
      >
        <svg class="config-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
          />
        </svg>
        <span class="interview-config-btn-text">{{ isAiConfigured ? modelName : '配置模型' }}</span>
      </button>
      <button class="top-btn" type="button" @click="emit('toggle-resume-preview')">
        {{ showResumePreview ? '收起简历' : '查看简历' }}
      </button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  border: 1px solid #e4d8cb;
  border-radius: 12px;
  background: #fff;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.role-switch {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mode-btn {
  border-radius: 8px;
  border: 1px solid #dfd2c2;
  background: #f7f3ee;
  color: #625649;
  font-size: 12px;
  font-weight: 700;
  padding: 7px 12px;
  cursor: pointer;
}

.mode-btn.active {
  border-color: #1f1c17;
  background: #1f1c17;
  color: #fff;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.interview-config-btn {
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
  max-width: 260px;
  overflow: visible;
}

.interview-config-btn-text {
  flex: 1;
  min-width: 0;
  display: inline-block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.interview-config-btn::before,
.interview-config-btn::after {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.interview-config-btn::before {
  content: '';
  position: absolute;
  left: 50%;
  top: calc(100% + 3px);
  transform: translate(-50%, -6px);
  border: 5px solid transparent;
  border-bottom-color: #2d2521;
  z-index: 80;
}

.interview-config-btn::after {
  content: attr(data-model-tooltip);
  position: absolute;
  left: 50%;
  top: calc(100% + 8px);
  transform: translate(-50%, -6px);
  width: max-content;
  max-width: min(760px, 90vw);
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
  z-index: 81;
}

.interview-config-btn:hover::before,
.interview-config-btn:hover::after,
.interview-config-btn:focus-visible::before,
.interview-config-btn:focus-visible::after {
  opacity: 1;
  transform: translate(-50%, 0);
}

.interview-config-btn:hover {
  border-color: #d97745;
  color: #d97745;
}

.config-icon {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}

.top-btn {
  border: 1px solid #dfd2c2;
  border-radius: 8px;
  background: #f7f3ee;
  color: #5f5448;
  font-size: 12px;
  font-weight: 700;
  padding: 7px 10px;
  cursor: pointer;
}

@media (max-width: 860px) {
  .topbar {
    flex-direction: column;
    align-items: stretch;
  }

  .role-switch,
  .top-actions {
    width: 100%;
  }

  .mode-btn,
  .interview-config-btn,
  .top-btn {
    flex: 1;
    text-align: center;
  }
}
</style>
