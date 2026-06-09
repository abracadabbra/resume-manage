import { watch, type WatchStopHandle } from 'vue'

export interface DebouncedAutoSaveOptions<T> {
  delayMs: number
  getSnapshot: () => T
  onScheduled: (nextSaveAt: number) => void
  onSave: () => void
}

export interface DebouncedAutoSaveHandle {
  cancelPending: () => void
  stop: () => void
}

export function useDebouncedAutoSave<T>(
  options: DebouncedAutoSaveOptions<T>,
): DebouncedAutoSaveHandle {
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  function cancelPending() {
    if (!saveTimer) return
    clearTimeout(saveTimer)
    saveTimer = null
  }

  const stopWatcher: WatchStopHandle = watch(
    options.getSnapshot,
    () => {
      cancelPending()
      options.onScheduled(Date.now() + options.delayMs)
      saveTimer = setTimeout(() => {
        saveTimer = null
        options.onSave()
      }, options.delayMs)
    },
    { deep: true },
  )

  return {
    cancelPending,
    stop: () => {
      cancelPending()
      stopWatcher()
    },
  }
}
