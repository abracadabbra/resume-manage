<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useTechInterviewQuestionsStore } from '@/stores/techInterviewQuestions'
import TechCategoryNav from './TechCategoryNav.vue'
import TechQuestionList from './TechQuestionList.vue'
import TechQuestionDetail from './TechQuestionDetail.vue'
import CloudSyncBanner from './CloudSyncBanner.vue'
import CloudSyncConflictDialog from './CloudSyncConflictDialog.vue'

const store = useTechInterviewQuestionsStore()
const conflictDrawerOpen = ref(false)

onMounted(async () => {
  await store.ensureLoaded()
  // 预加载前5道题的AI答案，减少翻题时的等待感
  if (store.isLoaded) {
    const preloadIds = store.filteredQuestions.slice(0, 5).map(q => q.id)
    void Promise.all(preloadIds.map(id => store.loadAiAnswerIfNeeded(id)))
  }
  window.addEventListener('keydown', handleKeydown)
  // 已登录则后台触发 pull（不阻塞）
  if (store.syncState.state.enabled) {
    void store.cloud.pull()
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  // 离开时 flush pendingPush
  void store.cloud.flushPending()
})

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'j' || e.key === 'ArrowDown') {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    e.preventDefault()
    store.selectNextQuestion()
  } else if (e.key === 'k' || e.key === 'ArrowUp') {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    e.preventDefault()
    store.selectPrevQuestion()
  }
}
</script>

<template>
  <div class="tech-interview-panel">
    <div v-if="store.isLoading" class="loading-state">
      <div class="loading-spinner" />
      <p>加载大厂面经数据中...</p>
    </div>

    <div v-else-if="store.loadError" class="error-state">
      <p class="error-icon">⚠️</p>
      <p>{{ store.loadError }}</p>
      <button class="retry-btn" @click="store.ensureLoaded()">重试</button>
    </div>

    <template v-else-if="store.isLoaded">
      <CloudSyncBanner @open-conflicts="conflictDrawerOpen = true" />
      <div class="content">
        <TechCategoryNav />
        <TechQuestionList />
        <TechQuestionDetail />
      </div>
      <CloudSyncConflictDialog
        v-if="conflictDrawerOpen"
        @close="conflictDrawerOpen = false"
      />
    </template>
  </div>
</template>

<style scoped>
.tech-interview-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  background: #faf8f5;
}

.content {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.loading-state,
.error-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #8a7461;
  font-size: 14px;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e8e0d5;
  border-top-color: #d97745;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-icon {
  font-size: 32px;
  margin: 0;
}

.retry-btn {
  padding: 6px 16px;
  border: 1px solid #d4c4b0;
  background: #fff;
  color: #5a4a3a;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.retry-btn:hover {
  border-color: #d97745;
  color: #d97745;
}
</style>