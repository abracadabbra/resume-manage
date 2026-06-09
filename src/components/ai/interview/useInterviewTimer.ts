import { computed, ref } from 'vue'

export function useInterviewTimer(initialDurationMinutes = 60) {
  const durationMinutes = ref(initialDurationMinutes)
  const elapsedSeconds = ref(0)
  const sessionStarted = ref(false)
  const timerRunning = ref(false)

  const totalSeconds = computed(() => Math.max(durationMinutes.value, 1) * 60)
  const remainingSeconds = computed(() => Math.max(totalSeconds.value - elapsedSeconds.value, 0))
  const timerText = computed(() => {
    const minutes = Math.floor(remainingSeconds.value / 60)
    const seconds = remainingSeconds.value % 60
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  })
  const timerStatusText = computed(() => {
    if (!sessionStarted.value) return '未开始'
    if (remainingSeconds.value === 0) return '已结束'
    return timerRunning.value ? '进行中' : '已暂停'
  })

  function adjustDuration(delta: number) {
    const next = Math.max(15, Math.min(120, durationMinutes.value + delta))
    if (next === durationMinutes.value) return
    durationMinutes.value = next
    if (!sessionStarted.value) {
      elapsedSeconds.value = 0
    } else {
      elapsedSeconds.value = Math.max(0, Math.min(elapsedSeconds.value, totalSeconds.value - 1))
    }
  }

  function startTimer() {
    sessionStarted.value = true
    timerRunning.value = true
  }

  function pauseTimer() {
    timerRunning.value = false
  }

  function togglePause() {
    timerRunning.value = !timerRunning.value
  }

  function resetTimer() {
    elapsedSeconds.value = 0
    sessionStarted.value = false
    timerRunning.value = false
  }

  function tick() {
    if (!sessionStarted.value || !timerRunning.value) return
    if (remainingSeconds.value <= 0) return
    elapsedSeconds.value += 1
  }

  return {
    durationMinutes,
    elapsedSeconds,
    sessionStarted,
    timerRunning,
    remainingSeconds,
    timerText,
    timerStatusText,
    adjustDuration,
    startTimer,
    pauseTimer,
    togglePause,
    resetTimer,
    tick,
  }
}
