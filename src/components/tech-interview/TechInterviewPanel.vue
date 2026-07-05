<script setup lang="ts">
import { onMounted, onUnmounted, provide, ref } from 'vue'
import { useTechInterviewQuestionsStore } from '@/stores/techInterviewQuestions'
import { useAuthStore } from '@/stores/auth'
import TechCategoryNav from './TechCategoryNav.vue'
import TechQuestionList from './TechQuestionList.vue'
import TechQuestionDetail from './TechQuestionDetail.vue'
import CloudSyncBanner from './CloudSyncBanner.vue'
import CloudSyncConflictDialog from './CloudSyncConflictDialog.vue'
import TechInterviewAuthDialog from './TechInterviewAuthDialog.vue'

const store = useTechInterviewQuestionsStore()
const auth = useAuthStore()
const conflictDrawerOpen = ref(false)
const authDialogOpen = ref(false)

const toastMessage = ref('')
const toastVisible = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(message: string) {
  toastMessage.value = message
  toastVisible.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastVisible.value = false
  }, 2000)
}

provide('techInterviewToast', showToast)

onMounted(async () => {
  // 1) 初始化 auth（拉当前 session + 监听变化）
  await auth.init()
  // 同步 userId 给 techInterviewQuestions，供 cloud.adapter.userId() 使用
  store.setCurrentUserId(auth.userId)

  await store.ensureLoaded()
  // 预加载前5道题的AI答案，减少翻题时的等待感
  if (store.isLoaded) {
    const preloadIds = store.filteredQuestions.slice(0, 5).map(q => q.id)
    void Promise.all(preloadIds.map(id => store.loadAiAnswerIfNeeded(id)))
  }
  window.addEventListener('keydown', handleKeydown)

  // 2) 已登录且启用云同步 → 后台 pull（不阻塞）
  if (auth.userId && store.syncState.state.enabled) {
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
      <CloudSyncBanner
        @open-conflicts="conflictDrawerOpen = true"
        @open-auth="authDialogOpen = true"
      />
      <div class="content">
        <TechCategoryNav />
        <TechQuestionList />
        <TechQuestionDetail />
      </div>
      <CloudSyncConflictDialog
        v-if="conflictDrawerOpen"
        @close="conflictDrawerOpen = false"
      />
      <TechInterviewAuthDialog
        v-if="authDialogOpen"
        @close="authDialogOpen = false"
      />
      <Transition name="toast">
        <div v-if="toastVisible" class="toast">{{ toastMessage }}</div>
      </Transition>
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

.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 18px;
  border-radius: 8px;
  background: #2d2521;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  pointer-events: none;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(12px);
}
</style>