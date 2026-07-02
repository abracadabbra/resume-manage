<script setup lang="ts">
import { computed } from 'vue'
import { useTechInterviewQuestionsStore } from '@/stores/techInterviewQuestions'

const store = useTechInterviewQuestionsStore()

const emit = defineEmits<{
  (e: 'open-conflicts'): void
}>()

const conflictCount = computed(() => Object.keys(store.cloudConflicts).length)

const statusText = computed(() => {
  const s = store.cloudSyncStatus
  switch (s.kind) {
    case 'idle': return '尚未同步'
    case 'pulling': return '拉取云端数据中...'
    case 'pushing': return `推送中（${s.queueSize} 项）...`
    case 'ok': return `已同步（${formatTime(s.lastSyncedAt)}）`
    case 'partial': return `部分同步失败（${s.failedCount} 项）`
    case 'offline': return s.lastSyncedAt ? `离线（上次同步 ${formatTime(s.lastSyncedAt)}）` : '离线'
    case 'error': return `同步失败：${s.message}`
    default: return ''
  }
})

const isSyncing = computed(() => {
  const s = store.cloudSyncStatus
  return s.kind === 'pulling' || s.kind === 'pushing'
})

function formatTime(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  const now = Date.now()
  const diff = now - ms
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return d.toLocaleDateString()
}

async function handleSync() {
  await store.cloud.pullThenPush()
}
</script>

<template>
  <div v-if="store.syncState.state.enabled" class="cloud-sync-banner">
    <div class="status">
      <span class="dot" :class="store.cloudSyncStatus.kind" />
      <span class="text">{{ statusText }}</span>
    </div>
    <div class="actions">
      <button
        v-if="conflictCount > 0"
        class="btn btn-warn"
        @click="emit('open-conflicts')"
      >
        检测到 {{ conflictCount }} 道题有冲突 →
      </button>
      <button class="btn" :disabled="isSyncing" @click="handleSync">
        立即同步
      </button>
    </div>
  </div>
</template>

<style scoped>
.cloud-sync-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: #fff7ed;
  border-bottom: 1px solid #f5d9b3;
  font-size: 13px;
  gap: 12px;
}

.status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #8a7461;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #c5b8a8;
  flex-shrink: 0;
}

.dot.pulling, .dot.pushing { background: #d97745; animation: pulse 1.2s infinite; }
.dot.ok { background: #4a9d6f; }
.dot.partial, .dot.error { background: #c14a3a; }
.dot.offline { background: #b0a08f; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn {
  padding: 4px 12px;
  border: 1px solid #d4c4b0;
  background: #fff;
  color: #5a4a3a;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s ease;
}
.btn:hover:not(:disabled) {
  border-color: #d97745;
  color: #d97745;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-warn {
  background: #fff2e0;
  border-color: #f5a873;
  color: #c14a3a;
}
.btn-warn:hover { background: #ffe4c4; }
</style>