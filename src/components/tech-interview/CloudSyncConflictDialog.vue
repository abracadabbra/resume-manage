<script setup lang="ts">
import { computed } from 'vue'
import { useTechInterviewQuestionsStore } from '@/stores/techInterviewQuestions'

const store = useTechInterviewQuestionsStore()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const conflictEntries = computed(() => {
  return Object.entries(store.cloudConflicts).map(([qid, entry]) => {
    const q = store.allQuestions.find((x) => x.id === qid)
    return { qid, entry, questionText: q?.q ?? qid }
  })
})

async function resolve(qid: string, choice: 'local' | 'cloud' | 'merge') {
  await store.cloud.resolveConflict(qid, choice)
}

function formatTime(ms: number): string {
  if (!ms) return ''
  return new Date(ms).toLocaleString()
}

function isPractice(entry: { kind: 'practice' | 'conversation' }) {
  return entry.kind === 'practice'
}
</script>

<template>
  <div class="conflict-overlay" @click.self="emit('close')">
    <div class="conflict-drawer">
      <header>
        <h2>同步冲突（{{ conflictEntries.length }}）</h2>
        <button class="close-btn" @click="emit('close')">×</button>
      </header>

      <div v-if="conflictEntries.length === 0" class="empty">
        没有待解决的冲突
      </div>

      <div v-else class="conflict-list">
        <article v-for="item in conflictEntries" :key="item.qid" class="conflict-item">
          <h3>{{ item.questionText }}</h3>
          <div class="kind">{{ isPractice(item.entry) ? '练习记录冲突' : '追问对话冲突' }}</div>

          <div class="sides">
            <section class="side">
              <h4>本地</h4>
              <div class="ts">{{ formatTime(item.entry.local.updated_at) }}</div>
              <pre v-if="isPractice(item.entry)">{{ JSON.stringify((item.entry.local as { mastery: string; answer: string; notes: string }), null, 2) }}</pre>
              <pre v-else>{{ JSON.stringify((item.entry.local as { conversations: unknown[] }).conversations, null, 2) }}</pre>
            </section>
            <section class="side">
              <h4>云端</h4>
              <div class="ts">{{ formatTime(item.entry.cloud.updated_at) }}</div>
              <pre v-if="isPractice(item.entry)">{{ JSON.stringify((item.entry.cloud as { mastery: string; answer: string; notes: string }), null, 2) }}</pre>
              <pre v-else>{{ JSON.stringify((item.entry.cloud as { conversations: unknown[] }).conversations, null, 2) }}</pre>
            </section>
          </div>

          <div class="actions">
            <button class="btn" @click="resolve(item.qid, 'local')">使用本地</button>
            <button class="btn" @click="resolve(item.qid, 'cloud')">使用云端</button>
            <button
              v-if="isPractice(item.entry)"
              class="btn btn-merge"
              @click="resolve(item.qid, 'merge')"
            >合并</button>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.conflict-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 100;
  display: flex;
  justify-content: flex-end;
}

.conflict-drawer {
  width: 720px;
  max-width: 90vw;
  background: #faf8f5;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 16px rgba(0, 0, 0, 0.1);
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid #e8e0d5;
  background: #fff;
}
header h2 {
  margin: 0;
  font-size: 16px;
  color: #5a4a3a;
}
.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: #8a7461;
  cursor: pointer;
  width: 32px;
  height: 32px;
  border-radius: 4px;
}
.close-btn:hover { background: #f0e8d8; }

.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8a7461;
}

.conflict-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.conflict-item {
  background: #fff;
  border: 1px solid #e8e0d5;
  border-radius: 8px;
  padding: 16px;
}

.conflict-item h3 {
  margin: 0 0 4px;
  font-size: 14px;
  color: #3a2a1a;
  line-height: 1.4;
}

.kind {
  font-size: 12px;
  color: #c14a3a;
  margin-bottom: 12px;
}

.sides {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

.side {
  background: #faf8f5;
  border: 1px solid #e8e0d5;
  border-radius: 4px;
  padding: 8px 12px;
}

.side h4 {
  margin: 0 0 4px;
  font-size: 12px;
  color: #5a4a3a;
}

.side .ts {
  font-size: 11px;
  color: #b0a08f;
  margin-bottom: 6px;
}

.side pre {
  margin: 0;
  font-size: 11px;
  color: #5a4a3a;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
}

.actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 6px 14px;
  border: 1px solid #d4c4b0;
  background: #fff;
  color: #5a4a3a;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s ease;
}
.btn:hover {
  border-color: #d97745;
  color: #d97745;
}
.btn-merge {
  background: #fff2e0;
  border-color: #f5a873;
  color: #c14a3a;
}
</style>