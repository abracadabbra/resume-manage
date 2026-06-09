<script setup lang="ts">
import { computed } from 'vue'
import { useResumeStore } from '@/stores/resume'
import { useAiConfigStore } from '@/stores/aiConfig'
import AiOptimizeResult from './AiOptimizeResult.vue'
import AiOptimizeToolbar from './AiOptimizeToolbar.vue'
import { useAiOptimize } from './useAiOptimize'
import { useApplyOptimizedContent } from './useApplyOptimizedContent'
import type { ModuleData } from '@/services/aiService'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'open-config'): void
}>()

const resumeStore = useResumeStore()
const aiConfig = useAiConfigStore()

const visibleModules = computed(() => resumeStore.modules.filter((m) => m.visible))

const {
  selectedModule,
  isLoading,
  streamText,
  errorMsg,
  isDone,
  markdown,
  parsed,
  renderedSuggestions,
  resolvedOptimizedContent,
  renderedOptimizedContent,
  handleOptimize,
  handleStop,
  handleReset: resetOptimizeResult,
  setErrorMessage,
} = useAiOptimize({
  getConfig: () => ({
    apiUrl: aiConfig.apiUrl,
    apiToken: aiConfig.apiToken,
    modelName: aiConfig.modelName,
  }),
  getModuleData,
  onResetAppliedModule(moduleKey) {
    resetAppliedModule(moduleKey)
  },
})

const {
  canApplySelectedModule,
  isSelectedModuleApplied,
  canUndoSelectedModule,
  handleApply,
  handleUndoApply,
  resetAppliedModule,
} = useApplyOptimizedContent({
  selectedModule,
  resolvedOptimizedContent,
  markdown,
  setErrorMessage,
})

function getModuleData(): ModuleData {
  return {
    basicInfo: { ...resumeStore.basicInfo },
    educationList: resumeStore.educationList.map((e) => ({ ...e })),
    skills: resumeStore.skills,
    workList: resumeStore.workList.map((w) => ({ ...w })),
    projectList: resumeStore.projectList.map((p) => ({ ...p })),
    awardList: resumeStore.awardList.map((a) => ({ ...a })),
    selfIntro: resumeStore.selfIntro,
  }
}

function handleReset() {
  resetOptimizeResult()
}

function handleClose() {
  handleStop()
  emit('close')
}
</script>

<template>
  <teleport to="body">
    <div class="panel-overlay" @click.self="handleClose">
      <aside class="optimize-panel">
        <AiOptimizeToolbar
          v-model:selected-module="selectedModule"
          :model-name="aiConfig.modelName"
          :visible-modules="visibleModules"
          :is-loading="isLoading"
          :is-done="isDone"
          :is-configured="aiConfig.isConfigured"
          @open-config="emit('open-config')"
          @close="handleClose"
          @optimize="handleOptimize"
          @stop="handleStop"
          @reset="handleReset"
        />

        <AiOptimizeResult
          :error-msg="errorMsg"
          :is-loading="isLoading"
          :stream-text="streamText"
          :suggestions-html="renderedSuggestions"
          :optimized-html="renderedOptimizedContent"
          :has-suggestions="Boolean(parsed.suggestions)"
          :has-optimized-content="Boolean(resolvedOptimizedContent)"
          :is-done="isDone"
          :can-apply-selected-module="canApplySelectedModule"
          :can-undo-selected-module="canUndoSelectedModule"
          :is-applied="isSelectedModuleApplied"
          @apply="handleApply"
          @undo="handleUndoApply"
        />
      </aside>
    </div>
  </teleport>
</template>

<style scoped>
.panel-overlay {
  position: fixed;
  inset: 0;
  background: transparent;
  z-index: 900;
  display: block;
  pointer-events: none;
  animation: fadeIn 0.18s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.optimize-panel {
  --preview-panel-width: 812px;
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: calc(100vw - var(--preview-panel-width));
  min-width: 560px;
  max-width: 100vw;
  height: 100vh;
  background: #faf7f4;
  border-right: 1px solid #e9ded0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
  pointer-events: auto;
  animation: slideIn 0.25s ease;
  box-shadow: -8px 0 30px rgba(30, 20, 14, 0.1);
}

.optimize-panel::-webkit-scrollbar {
  width: 10px;
}

.optimize-panel::-webkit-scrollbar-thumb {
  background: #cdbcae;
}

.optimize-panel::-webkit-scrollbar-thumb:hover {
  background: #b7a392;
}

@keyframes slideIn {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
}

@media (max-width: 720px) {
  .optimize-panel {
    width: 100vw;
    max-width: 100vw;
    min-width: 0;
    border-right: none;
    border-left: 1px solid #e9ded0;
  }
}

@media (max-width: 1480px) and (min-width: 721px) {
  .optimize-panel {
    --preview-panel-width: 640px;
    min-width: 420px;
  }
}
</style>
