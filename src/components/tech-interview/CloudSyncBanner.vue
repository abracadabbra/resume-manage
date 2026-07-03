<script setup lang="ts">
import { computed } from 'vue'
import { useTechInterviewQuestionsStore } from '@/stores/techInterviewQuestions'
import { useAuthStore } from '@/stores/auth'

const store = useTechInterviewQuestionsStore()
const auth = useAuthStore()

const emit = defineEmits<{
  (e: 'open-conflicts'): void
  (e: 'open-auth'): void
}>()

const conflictCount = computed(() => Object.keys(store.cloudConflicts).length)

const isLoggedIn = computed(() => Boolean(auth.userId))
const isSupabaseConfigured = computed(() => auth.isConfigured)

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

async function handleSignOut() {
  await auth.signOut()
  // 登出后清理同步状态（下次登录时重新初始化）
  localStorage.removeItem('tech-interview-sync-state.json')
}
</script>

<template>
  <!-- 未配置 Supabase：不展示横幅（离线能力已可用） -->
  <div v-if="!isSupabaseConfigured" class="cloud-sync-banner banner-disabled" />

  <!-- 已配置但未登录：提示登录以启用云同步 -->
  <div v-else-if="!isLoggedIn" class="cloud-sync-banner banner-info">
    <div class="status">
      <span class="dot" />
      <span class="text">登录后可在多设备同步练习记录与 AI 追问对话</span>
    </div>
    <div class="actions">
      <button class="btn btn-primary" @click="emit('open-auth')">登录 / 注册</button>
    </div>
  </div>

  <!-- 已登录且启用云同步：原云同步横幅 -->
  <div v-else-if="store.syncState.state.enabled" class="cloud-sync-banner">
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
      <button class="btn btn-link" @click="handleSignOut">登出</button>
    </div>
  </div>

  <!-- 已登录但未启用 syncState：提示「启用云同步」 -->
  <div v-else class="cloud-sync-banner banner-info">
    <div class="status">
      <span class="dot" />
      <span class="text">已登录（{{ auth.email }}），尚未启用云同步</span>
    </div>
    <div class="actions">
      <button class="btn btn-primary" @click="store.syncState.enable()">启用云同步</button>
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

.btn-primary {
  background: #7c6af0;
  border-color: #7c6af0;
  color: #fff;
}
.btn-primary:hover {
  background: #6a59d6;
  color: #fff;
  border-color: #6a59d6;
}

.btn-link {
  border: none;
  background: none;
  color: #7c6af0;
  text-decoration: underline;
  padding: 4px 8px;
}
.btn-link:hover { background: #f5f0ff; }

.banner-disabled {
  visibility: hidden;
  height: 0;
  padding: 0;
  border: none;
}

.banner-info {
  background: #f5f0ff;
  border-bottom-color: #d4cef5;
}
</style>