import { computed, onUnmounted, ref, watch } from 'vue'
import type { useResumeStore } from '@/stores/resume'

type ResumeStore = ReturnType<typeof useResumeStore>

export function useAutoSaveStatus(store: ResumeStore) {
  const nowTick = ref(Date.now())

  const isAutoSavePending = computed(() => store.nextAutoSaveAt !== null)

  const autoSaveChipText = computed(() => {
    if (store.isSaving) {
      return '自动保存中...'
    }

    const nextAt = store.nextAutoSaveAt
    if (nextAt) {
      const remainMs = Math.max(nextAt - nowTick.value, 0)
      const remainSec = Math.max(remainMs / 1000, 0.1)
      return `${remainSec.toFixed(1)}秒后自动保存`
    }

    const savedAt = store.lastSavedAt
    if (!savedAt) {
      return `自动保存间隔 ${Math.max(store.autoSaveDelayMs / 1000, 0.1).toFixed(1)}秒`
    }

    const elapsedMs = Math.max(nowTick.value - savedAt, 0)
    const label = store.lastSaveMode === 'manual' ? '手动保存' : '自动保存'
    if (elapsedMs < 2_000) return `刚刚${label}`
    if (elapsedMs < 60_000) return `${Math.floor(elapsedMs / 1000)}秒前${label}`
    return `${Math.floor(elapsedMs / 60_000)}分钟前${label}`
  })

  // 仅当需要实时刷新 chip 文案时启动 200ms 定时器：
  // - 有 pending 保存（倒计时显示）
  // - 或有最近一次保存记录（"X秒前自动保存"需要在 1 分钟内持续更新）
  // 超过 1 分钟完全空闲时停止 ticker。
  const ACTIVE_LABEL_WINDOW_MS = 60_000
  let ticker: ReturnType<typeof setInterval> | null = null

  function startTicker() {
    if (ticker) return
    ticker = setInterval(() => {
      nowTick.value = Date.now()
    }, 200)
  }

  function stopTicker() {
    if (!ticker) return
    clearInterval(ticker)
    ticker = null
  }

  watch(
    [isAutoSavePending, () => store.lastSavedAt, nowTick],
    ([pending, savedAt]) => {
      const recentSaved =
        savedAt !== null && Date.now() - savedAt < ACTIVE_LABEL_WINDOW_MS
      if (pending || recentSaved) {
        startTicker()
      } else {
        stopTicker()
      }
    },
    { immediate: true },
  )

  onUnmounted(() => {
    stopTicker()
  })

  return { isAutoSavePending, autoSaveChipText }
}
