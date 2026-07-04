<script setup lang="ts">
import { ref } from 'vue'
import type { InterviewMode } from '@/services/interviewService'

defineProps<{
  mode: InterviewMode
  isAiConfigured: boolean
  modelName: string
  showResumePreview: boolean
  followUpEnabled: boolean
  hasPreviousSession: boolean
}>()

const emit = defineEmits<{
  (e: 'switch-mode', mode: InterviewMode): void
  (e: 'open-config'): void
  (e: 'toggle-resume-preview'): void
  (e: 'open-history'): void
  (e: 'toggle-follow-up'): void
}>()

const showMore = ref(false)

function closeMore() {
  showMore.value = false
}
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
      <!-- 追问 -->
      <button
        v-if="hasPreviousSession"
        type="button"
        class="follow-up-btn"
        :class="{ active: followUpEnabled }"
        @click="emit('toggle-follow-up')"
        title="基于上次薄弱点追问"
      >
        <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" fill="none" stroke="currentColor" stroke-width="1.6"/>
          <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/>
        </svg>
        追问
      </button>

      <!-- 配置 -->
      <button
        class="top-action-btn config-btn"
        type="button"
        :title="isAiConfigured ? modelName : '配置模型'"
        @click="emit('open-config')"
      >
        <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        <span class="config-text">{{ isAiConfigured ? modelName : '配置' }}</span>
      </button>

      <!-- 更多 -->
      <div class="more-wrapper">
        <button
          type="button"
          class="top-action-btn more-trigger"
          :class="{ active: showMore }"
          @click="showMore = !showMore"
        >
          ···
        </button>
        <div v-if="showMore" class="more-dropdown" @click="closeMore">
          <button type="button" class="dropdown-item" @click="emit('toggle-resume-preview')">
            <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true" width="12" height="12">
              <rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/>
              <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" stroke-width="1.6"/>
              <line x1="9" y1="3" x2="9" y2="21" stroke="currentColor" stroke-width="1.6"/>
            </svg>
            {{ showResumePreview ? '收起简历' : '查看简历' }}
          </button>
          <button type="button" class="dropdown-item" @click="emit('open-history')">
            <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true" width="12" height="12">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.6"/>
              <polyline points="12,6 12,12 16,14" fill="none" stroke="currentColor" stroke-width="1.6"/>
            </svg>
            面试历史
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  border: 1px solid #e4d8cb;
  border-radius: 12px;
  background: #fff;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.role-switch {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mode-btn {
  border-radius: 8px;
  border: 1px solid #dfd2c2;
  background: #f7f3ee;
  color: #625649;
  font-size: 12px;
  font-weight: 700;
  padding: 6px 10px;
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
  gap: 6px;
}

/* 通用按钮 */
.top-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid #ddd2c6;
  background: #fff;
  color: #5c4f44;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s, color 0.15s;
}

.btn-icon {
  width: 13px;
  height: 13px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}

/* 追问 */
.follow-up-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid #ddd2c6;
  background: #fff;
  color: #8a7461;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s, color 0.15s;
}
.follow-up-btn.active {
  border-color: #4a90d9;
  background: #eaf2ff;
  color: #315f9a;
}

/* 配置按钮宽度限制 */
.config-btn {
  max-width: 180px;
}
.config-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 更多下拉 */
.more-wrapper {
  position: relative;
}
.more-trigger {
  font-weight: 700;
  letter-spacing: 1px;
  padding: 0 8px;
}
.more-trigger.active {
  border-color: #d97745;
  color: #d97745;
}
.more-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: #fff;
  border: 1px solid #e4d8cb;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(29, 22, 17, 0.12);
  min-width: 130px;
  z-index: 150;
  overflow: hidden;
}
.dropdown-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: none;
  color: #5f5448;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.dropdown-item:hover {
  background: #f7f3ee;
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
  .top-action-btn,
  .follow-up-btn {
    flex: 1;
    text-align: center;
    justify-content: center;
  }
}
</style>
