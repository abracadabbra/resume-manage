<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useTechInterviewQuestionsStore } from '@/stores/techInterviewQuestions'
import TechCategoryNav from './TechCategoryNav.vue'
import TechQuestionList from './TechQuestionList.vue'
import TechQuestionDetail from './TechQuestionDetail.vue'

const store = useTechInterviewQuestionsStore()

onMounted(async () => {
  await store.ensureLoaded()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
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
      <TechCategoryNav />
      <TechQuestionList />
      <TechQuestionDetail />
    </template>
  </div>
</template>

<style scoped>
.tech-interview-panel {
  display: flex;
  height: 100%;
  background: #faf8f5;
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
  to {
    transform: rotate(360deg);
  }
}

.error-icon {
  font-size: 40px;
  margin: 0;
}

.retry-btn {
  margin-top: 8px;
  padding: 8px 20px;
  border: 1px solid #d97745;
  border-radius: 8px;
  background: #fff;
  color: #d97745;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.retry-btn:hover {
  background: #d97745;
  color: #fff;
}
</style>
