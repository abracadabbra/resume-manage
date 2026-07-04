<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'
import ModuleSidebar from '@/components/common/ModuleSidebar.vue'
import EditorPanel from '@/components/resume/EditorPanel.vue'
import PreviewPanel from '@/components/resume/PreviewPanel.vue'
import type { PrimaryMenuKey } from '@/constants/menus'

const AiInterviewerPanel = defineAsyncComponent(
  () => import('@/components/ai/interview/AiInterviewerPanel.vue'),
)
const QuestionBankPanel = defineAsyncComponent(
  () => import('@/components/question-bank/QuestionBankPanel.vue'),
)
const JdSpecialPanel = defineAsyncComponent(
  () => import('@/components/jd-special/JdSpecialPanel.vue'),
)
const TechInterviewPanel = defineAsyncComponent(
  () => import('@/components/tech-interview/TechInterviewPanel.vue'),
)
const InterviewReviewPanel = defineAsyncComponent(
  () => import('@/components/interview-review/InterviewReviewPanel.vue'),
)

const sidebarCollapsed = ref(false)
const activeMenu = ref<PrimaryMenuKey>('resume-editor')

function handleSelectMenu(key: PrimaryMenuKey) {
  activeMenu.value = key
}
</script>

<template>
  <div class="app-layout">
    <ModuleSidebar
      :collapsed="sidebarCollapsed"
      :active-menu="activeMenu"
      @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
      @select-menu="handleSelectMenu"
    />
    <div class="main-content">
      <template v-if="activeMenu === 'resume-editor'">
        <EditorPanel />
        <PreviewPanel />
      </template>
      <QuestionBankPanel v-else-if="activeMenu === 'question-bank'" />
      <JdSpecialPanel v-else-if="activeMenu === 'jd-special'" />
      <TechInterviewPanel v-else-if="activeMenu === 'tech-interview'" />
      <InterviewReviewPanel v-else-if="activeMenu === 'interview-review'" />
      <AiInterviewerPanel v-else />
    </div>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-width: 0;
}
</style>
