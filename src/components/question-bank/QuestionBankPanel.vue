<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useQuestionBankStore } from '@/stores/questionBank'
import { useResumeStore } from '@/stores/resume'
import { downloadMarkdown } from '@/services/exportMarkdown'
import {
  downloadInterviewPrepPdf,
  filterPreparedQuestions,
  generateInterviewPrepMarkdown,
} from '@/services/exportInterviewPrep'
import QuestionChapterNav from './QuestionChapterNav.vue'
import QuestionList from './QuestionList.vue'
import QuestionDetail from './QuestionDetail.vue'
import QuestionAdder from './QuestionAdder.vue'
import ProjectQuestionGenerator from './ProjectQuestionGenerator.vue'
import QuestionReviewInsights from './QuestionReviewInsights.vue'
import ResumeQuestionGenerator from './ResumeQuestionGenerator.vue'

const store = useQuestionBankStore()
const resumeStore = useResumeStore()
const isExportingPdf = ref(false)
const cloudSyncMessage = ref('')

const exportQuestions = computed(() =>
  filterPreparedQuestions(store.filteredQuestions, store.practiceRecords),
)

const exportScopeLabel = computed(() => {
  const hasFilters =
    store.viewFilter !== 'all'
    || Boolean(store.searchQuery.trim())
    || Boolean(store.activeChapterId)
    || Boolean(store.difficultyFilter)
    || store.sourceFilter !== 'all'
    || store.masteryFilter !== 'all'
    || Boolean(store.labelFilter)
    || Boolean(store.projectNameFilter)
    || Boolean(store.techStackFilter)

  return hasFilters ? '当前筛选下的已准备题' : '已准备题'
})

const shortcutHint = '快捷键：J/K 切题 · 1/2/3/4 改状态'

const isCloudSyncing = computed(() => store.cloudSyncStatus !== 'idle')

const cloudConflictText = computed(() => {
  const conflict = store.cloudConflict
  if (!conflict) return ''
  return `本地 ${formatSyncTime(conflict.localUpdatedAt)} / 云端 ${formatSyncTime(conflict.cloudUpdatedAt)} 均有更新`
})

const cloudSyncMeta = computed(() => {
  if (store.cloudConflict) return cloudConflictText.value
  if (!resumeStore.isLoggedIn) return '登录后可跨设备同步题库和练习记录'
  if (store.cloudLastSyncedAt) {
    return `上次同步：${formatSyncTime(store.cloudLastSyncedAt)}`
  }
  return '已登录，可手动上传或拉取云端题库'
})

function formatSyncTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function handlePullFromCloud() {
  if (!resumeStore.userId || isCloudSyncing.value) return
  cloudSyncMessage.value = ''

  try {
    const record = await store.pullFromCloud(resumeStore.userId)
    cloudSyncMessage.value = record ? '已合并云端题库' : '云端暂无题库数据'
  } catch {
    cloudSyncMessage.value = ''
  }
}

async function handlePushToCloud() {
  if (!resumeStore.userId || isCloudSyncing.value) return
  cloudSyncMessage.value = ''

  try {
    await store.pushToCloud(resumeStore.userId)
    cloudSyncMessage.value = '题库已上传到云端'
  } catch {
    cloudSyncMessage.value = ''
  }
}

async function handleUseCloudVersion() {
  if (!resumeStore.userId || isCloudSyncing.value) return
  cloudSyncMessage.value = ''

  try {
    const record = await store.resolveConflictWithCloud(resumeStore.userId)
    cloudSyncMessage.value = record ? '已使用云端题库' : '云端暂无题库数据'
  } catch {
    cloudSyncMessage.value = ''
  }
}

async function handleKeepLocalVersion() {
  if (!resumeStore.userId || isCloudSyncing.value) return
  cloudSyncMessage.value = ''

  try {
    await store.resolveConflictWithLocal(resumeStore.userId)
    cloudSyncMessage.value = '已保留本地题库并上传'
  } catch {
    cloudSyncMessage.value = ''
  }
}

function handleExportInterviewPrep() {
  if (exportQuestions.value.length === 0) return

  const content = buildInterviewPrepContent()

  const name = resumeStore.basicInfo.name?.trim() || '候选人'
  downloadMarkdown(`${name}_面试准备包.md`, content)
}

function buildInterviewPrepContent() {
  return generateInterviewPrepMarkdown({
    displayName: resumeStore.basicInfo.name?.trim() || '候选人',
    scopeLabel: exportScopeLabel.value,
    questions: exportQuestions.value,
    chapters: store.chapters,
    practiceRecords: store.practiceRecords,
  })
}

async function handleExportInterviewPrepPdf() {
  if (exportQuestions.value.length === 0 || isExportingPdf.value) return

  isExportingPdf.value = true
  const name = resumeStore.basicInfo.name?.trim() || '候选人'
  const title = `${name}｜面试准备包`
  const content = buildInterviewPrepContent()

  try {
    await downloadInterviewPrepPdf(`${name}_面试准备包.pdf`, content, title)
  } finally {
    isExportingPdf.value = false
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || isEditableTarget(event.target)) return
  if (event.metaKey || event.ctrlKey || event.altKey) return
  if ((event as KeyboardEvent & { isComposing?: boolean }).isComposing) return

  const key = event.key.toLowerCase()
  if (key === 'j') {
    event.preventDefault()
    store.selectNextQuestion()
    return
  }
  if (key === 'k') {
    event.preventDefault()
    store.selectPreviousQuestion()
    return
  }
  if (!store.selectedQuestionId) return

  const masteryByShortcut = {
    '1': 'unpracticed',
    '2': 'practicing',
    '3': 'mastered',
    '4': 'weak',
  } as const

  const mastery = masteryByShortcut[key as keyof typeof masteryByShortcut]
  if (!mastery) return
  event.preventDefault()
  store.setPracticeMastery(store.selectedQuestionId, mastery)
}

onMounted(() => {
  void store.ensureBundledQuestionsLoaded()
  window.addEventListener('keydown', handleWindowKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
})
</script>

<template>
  <div class="question-bank-panel">
    <div v-if="store.isLoading && !store.isLoaded" class="panel-state">
      <div class="state-card">
        <p class="state-title">题库加载中...</p>
        <p class="state-desc">正在准备面试题数据</p>
      </div>
    </div>

    <div v-else-if="store.loadError && !store.isLoaded" class="panel-state">
      <div class="state-card">
        <p class="state-title">题库加载失败</p>
        <p class="state-desc">{{ store.loadError }}</p>
        <button class="retry-btn" @click="store.ensureBundledQuestionsLoaded()">重试</button>
      </div>
    </div>

    <div v-else class="bank-ready">
      <div class="bank-toolbar">
        <div class="toolbar-copy">
          <span class="toolbar-title">面试准备包</span>
          <span class="toolbar-desc">
            {{ exportQuestions.length > 0 ? `当前可导出 ${exportQuestions.length} 道已准备题` : '先练几道题，再导出你的准备包' }}
          </span>
          <span class="toolbar-shortcut">{{ shortcutHint }}</span>
        </div>
        <div class="toolbar-actions">
          <div class="cloud-sync-card">
            <div class="cloud-copy">
              <span class="cloud-title">云同步</span>
              <span class="cloud-meta" :class="{ conflict: Boolean(store.cloudConflict) }">
                {{ cloudSyncMessage || store.cloudSyncError || cloudSyncMeta }}
              </span>
            </div>
            <div v-if="store.cloudConflict" class="cloud-actions">
              <button
                type="button"
                class="sync-btn"
                :disabled="!resumeStore.isLoggedIn || isCloudSyncing"
                @click="handleUseCloudVersion"
              >
                {{ store.cloudSyncStatus === 'pulling' ? '处理中...' : '使用云端' }}
              </button>
              <button
                type="button"
                class="sync-btn primary"
                :disabled="!resumeStore.isLoggedIn || isCloudSyncing"
                @click="handleKeepLocalVersion"
              >
                {{ store.cloudSyncStatus === 'pushing' ? '处理中...' : '保留本地' }}
              </button>
            </div>
            <div v-else class="cloud-actions">
              <button
                type="button"
                class="sync-btn"
                :disabled="!resumeStore.isLoggedIn || isCloudSyncing"
                @click="handlePullFromCloud"
              >
                {{ store.cloudSyncStatus === 'pulling' ? '拉取中...' : '拉取' }}
              </button>
              <button
                type="button"
                class="sync-btn primary"
                :disabled="!resumeStore.isLoggedIn || isCloudSyncing"
                @click="handlePushToCloud"
              >
                {{ store.cloudSyncStatus === 'pushing' ? '上传中...' : '上传' }}
              </button>
            </div>
          </div>
          <div class="export-actions">
            <button
              type="button"
              class="export-btn"
              :disabled="exportQuestions.length === 0 || isExportingPdf"
              @click="handleExportInterviewPrep"
            >
              导出 Markdown
            </button>
            <button
              type="button"
              class="export-btn primary"
              :disabled="exportQuestions.length === 0 || isExportingPdf"
              @click="handleExportInterviewPrepPdf"
            >
              {{ isExportingPdf ? '导出 PDF 中...' : '导出 PDF' }}
            </button>
          </div>
        </div>
      </div>
      <div class="generator-dock">
        <ResumeQuestionGenerator />
        <ProjectQuestionGenerator />
      </div>
      <QuestionAdder />
      <QuestionReviewInsights />
      <div class="bank-body">
        <QuestionChapterNav />
        <QuestionList />
        <QuestionDetail />
      </div>
    </div>
  </div>
</template>

<style scoped>
.question-bank-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  min-width: 0;
}

.bank-ready {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.bank-toolbar {
  padding: 12px 14px;
  border-bottom: 1px solid #e8e0d5;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.toolbar-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.toolbar-title {
  font-size: 13px;
  font-weight: 700;
  color: #2d2521;
}

.toolbar-desc {
  font-size: 12px;
  color: #7b6a5b;
  line-height: 1.5;
}

.toolbar-shortcut {
  font-size: 11px;
  color: #9b8a7c;
  line-height: 1.4;
}

.generator-dock {
  display: flex;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid #e8e0d5;
  background: #faf8f5;
  flex-shrink: 0;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.cloud-sync-card {
  min-height: 42px;
  padding: 6px 8px;
  border: 1px solid #e1d7ca;
  border-radius: 8px;
  background: #faf8f5;
  display: flex;
  align-items: center;
  gap: 10px;
}

.cloud-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 150px;
}

.cloud-title {
  font-size: 12px;
  font-weight: 700;
  color: #2d2521;
}

.cloud-meta {
  max-width: 260px;
  font-size: 11px;
  color: #7b6a5b;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cloud-meta.conflict {
  color: #a45a22;
}

.cloud-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sync-btn {
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid #cbd8e8;
  border-radius: 7px;
  background: #f3f7fc;
  color: #2a5caa;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
}

.sync-btn.primary {
  border-color: #2a5caa;
  background: #2a5caa;
  color: #fff;
}

.export-btn {
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid #d6c9b8;
  border-radius: 8px;
  background: #fff8f2;
  color: #b35d33;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
}

.export-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.export-btn.primary {
  border-color: #d97745;
  background: #d97745;
  color: #fff;
}

.export-btn:disabled,
.sync-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  background: #f8f5f1;
  color: #9b8a7c;
}

.bank-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-width: 0;
}

.panel-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: #fff;
}

.state-card {
  width: min(360px, 100%);
  padding: 24px;
  border: 1px solid #e8e0d5;
  border-radius: 12px;
  background: #faf8f5;
  text-align: center;
}

.state-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 700;
  color: #2d2521;
}

.state-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #7b6a5b;
}

.retry-btn {
  margin-top: 16px;
  padding: 9px 16px;
  border: none;
  border-radius: 8px;
  background: #2d2521;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

@media (max-width: 960px) {
  .bank-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .toolbar-actions,
  .cloud-sync-card {
    width: 100%;
    justify-content: space-between;
  }

  .cloud-copy {
    min-width: 0;
  }

  .generator-dock {
    flex-direction: column;
  }
}
</style>
