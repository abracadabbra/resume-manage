<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { ResumeRecord } from '@/services/supabase'
import { buildResumeDiff, type ResumeDiffKind } from '@/services/resumeDiffService'
import { useResumeStore } from '@/stores/resume'
import type { ResumeDraftData } from '@/stores/resumePersistence'

type ViewMode = 'manage' | 'compare'

interface CompareOption {
  id: string
  name: string
  meta: string
  updatedLabel: string
  data: Partial<ResumeDraftData>
}

const CURRENT_DRAFT_ID = '__current_draft__'

const store = useResumeStore()
const emit = defineEmits<{
  (e: 'close'): void
}>()

const viewMode = ref<ViewMode>('manage')
const showNewVersionDialog = ref(false)
const newVersionName = ref('')
const loading = ref(false)
const error = ref('')
const compareLeftId = ref('')
const compareRightId = ref(CURRENT_DRAFT_ID)

const compareOptions = computed<CompareOption[]>(() => {
  const currentDraft: CompareOption = {
    id: CURRENT_DRAFT_ID,
    name: '当前草稿',
    meta: '本地编辑中的最新内容',
    updatedLabel: '实时内容',
    data: store.getSnapshot(),
  }

  const cloudVersions = store.resumeVersions.map((resume) => toCompareOption(resume))

  return [currentDraft, ...cloudVersions]
})

const compareLeftOption = computed(() =>
  compareOptions.value.find((option) => option.id === compareLeftId.value) ?? null,
)

const compareRightOption = computed(() =>
  compareOptions.value.find((option) => option.id === compareRightId.value) ?? null,
)

const compareResult = computed(() => {
  if (!compareLeftOption.value || !compareRightOption.value) return null
  if (compareLeftOption.value.id === compareRightOption.value.id) return null

  return buildResumeDiff(compareLeftOption.value.data, compareRightOption.value.data)
})

const cloudConflictText = computed(() => {
  const conflict = store.cloudConflict
  if (!conflict) return ''
  return `本地 ${formatTimestamp(conflict.localUpdatedAt)} / 云端 ${formatTimestamp(conflict.cloudUpdatedAt)} 均有更新`
})

watch(
  compareOptions,
  (options) => {
    const leftExists = options.some((option) => option.id === compareLeftId.value)
    const rightExists = options.some((option) => option.id === compareRightId.value)

    if (!rightExists) {
      compareRightId.value = CURRENT_DRAFT_ID
    }

    if (!leftExists || compareLeftId.value === compareRightId.value) {
      compareLeftId.value = getDefaultCompareLeftId(options)
    }
  },
  { immediate: true },
)

function toCompareOption(resume: ResumeRecord): CompareOption {
  const metaTags = [`v${resume.version}`]
  if (resume.id === store.currentResumeId) {
    metaTags.push('当前云端版本')
  }

  return {
    id: resume.id,
    name: resume.name || `版本 ${resume.version}`,
    meta: metaTags.join(' · '),
    updatedLabel: formatDateTime(resume.updated_at),
    data: (resume.data as Partial<ResumeDraftData>) ?? {},
  }
}

function getDefaultCompareLeftId(options: CompareOption[]): string {
  if (store.currentResumeId) {
    const activeVersion = options.find((option) => option.id === store.currentResumeId)
    if (activeVersion) return activeVersion.id
  }

  const firstCloudVersion = options.find((option) => option.id !== CURRENT_DRAFT_ID)
  return firstCloudVersion?.id ?? CURRENT_DRAFT_ID
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '更新时间未知'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '更新时间未知'

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTimestamp(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '时间未知'

  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getDiffKindLabel(kind: ResumeDiffKind): string {
  if (kind === 'added') return '新增'
  if (kind === 'removed') return '删除'
  return '修改'
}

function formatDiffValue(value: string): string {
  return value.trim() ? value : '（空）'
}

async function handleCreateVersion() {
  if (!newVersionName.value.trim()) return
  error.value = ''
  loading.value = true

  try {
    await store.createNewVersion(newVersionName.value.trim())
    showNewVersionDialog.value = false
    newVersionName.value = ''
    compareLeftId.value = store.currentResumeId ?? getDefaultCompareLeftId(compareOptions.value)
    viewMode.value = 'manage'
    emit('close')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '创建失败'
  } finally {
    loading.value = false
  }
}

// AI Generated Start
async function handleSwitchVersion(resumeId: string) {
  error.value = ''
  loading.value = true

  try {
    await store.switchVersion(resumeId)
    compareLeftId.value = resumeId
    emit('close')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '切换版本失败'
  } finally {
    loading.value = false
  }
}
// AI Generated End

async function handleDeleteVersion(resumeId: string, event: Event) {
  event.stopPropagation()
  if (!confirm('确定删除这个版本吗？')) return
  await store.removeVersion(resumeId)
}

async function handleUseCloudVersion() {
  error.value = ''
  loading.value = true

  try {
    await store.resolveCloudConflictWithCloud()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '使用云端失败'
  } finally {
    loading.value = false
  }
}

async function handleKeepLocalVersion() {
  error.value = ''
  loading.value = true

  try {
    await store.resolveCloudConflictWithLocal('当前简历')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '保留本地失败'
  } finally {
    loading.value = false
  }
}

function openCompareWith(resumeId: string, event: Event) {
  event.stopPropagation()
  compareLeftId.value = resumeId
  compareRightId.value = CURRENT_DRAFT_ID
  viewMode.value = 'compare'
}
</script>

<template>
  <div class="version-overlay" @click.self="emit('close')">
    <div class="version-dialog" :class="{ expanded: viewMode === 'compare' }">
      <div class="version-header">
        <div>
          <h2>简历版本管理</h2>
          <p class="header-subtitle">切版本、建版本，也可以直接把当前草稿和任意云端版本对比。</p>
        </div>
        <button class="close-btn" @click="emit('close')">×</button>
      </div>

      <div class="view-switch">
        <button
          class="view-switch-btn"
          :class="{ active: viewMode === 'manage' }"
          type="button"
          @click="viewMode = 'manage'"
        >
          版本列表
        </button>
        <button
          class="view-switch-btn"
          :class="{ active: viewMode === 'compare' }"
          type="button"
          @click="viewMode = 'compare'"
        >
          版本对比
        </button>
      </div>

      <div v-if="store.cloudConflict" class="conflict-banner">
        <div>
          <strong>检测到云同步冲突</strong>
          <p>{{ cloudConflictText }}，请选择要保留的版本。</p>
        </div>
        <div class="conflict-actions">
          <button type="button" class="secondary-btn" :disabled="loading" @click="handleUseCloudVersion">
            使用云端
          </button>
          <button type="button" class="primary-btn" :disabled="loading" @click="handleKeepLocalVersion">
            保留本地
          </button>
        </div>
      </div>

      <template v-if="viewMode === 'manage'">
        <div v-if="error" class="error-msg manage-error">{{ error }}</div>
        <div class="version-list">
          <div
            v-for="resume in store.resumeVersions"
            :key="resume.id"
            class="version-item"
            :class="{ active: resume.id === store.currentResumeId }"
            @click="handleSwitchVersion(resume.id)"
          >
            <div class="version-main">
              <div class="version-info">
                <span class="version-name">{{ resume.name }}</span>
                <span class="version-meta">v{{ resume.version }}</span>
              </div>
              <span class="version-time">{{ formatDateTime(resume.updated_at) }}</span>
            </div>
            <div class="version-actions-inline">
              <button class="compare-btn" type="button" @click="openCompareWith(resume.id, $event)">
                对比
              </button>
              <button class="delete-btn" type="button" @click="handleDeleteVersion(resume.id, $event)">
                删除
              </button>
            </div>
          </div>

          <div v-if="store.resumeVersions.length === 0" class="no-versions">
            暂无云端版本，先创建一个版本再对比会更有意思。
          </div>
        </div>

        <div class="version-actions">
          <button
            v-if="!showNewVersionDialog"
            class="create-btn"
            type="button"
            @click="showNewVersionDialog = true"
          >
            + 新建版本
          </button>

          <div v-else class="new-version-form">
            <input
              v-model="newVersionName"
              type="text"
              placeholder="版本名称，如：校招版、社招版"
              @keyup.enter="handleCreateVersion"
            />
            <div class="form-actions">
              <button class="cancel-btn" type="button" @click="showNewVersionDialog = false">
                取消
              </button>
              <button
                class="confirm-btn"
                type="button"
                :disabled="loading || !newVersionName.trim()"
                @click="handleCreateVersion"
              >
                {{ loading ? '创建中...' : '创建' }}
              </button>
            </div>
            <div v-if="error" class="error-msg">{{ error }}</div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="compare-toolbar">
          <div class="select-group">
            <label class="select-label" for="compare-left">基线版本</label>
            <select id="compare-left" v-model="compareLeftId" class="compare-select">
              <option v-for="option in compareOptions" :key="option.id" :value="option.id">
                {{ option.name }}｜{{ option.meta }}
              </option>
            </select>
          </div>
          <div class="select-group">
            <label class="select-label" for="compare-right">对比版本</label>
            <select id="compare-right" v-model="compareRightId" class="compare-select">
              <option v-for="option in compareOptions" :key="option.id" :value="option.id">
                {{ option.name }}｜{{ option.meta }}
              </option>
            </select>
          </div>
        </div>

        <div v-if="store.resumeVersions.length === 0" class="compare-empty">
          至少要有一个云端版本，才能和当前草稿做对比。
        </div>
        <div
          v-else-if="compareLeftOption && compareRightOption && compareLeftOption.id === compareRightOption.id"
          class="compare-empty"
        >
          请选择两个不同的版本。
        </div>
        <div v-else-if="compareLeftOption && compareRightOption && compareResult" class="compare-content">
          <div class="compare-targets">
            <div class="target-card">
              <span class="target-caption">基线</span>
              <strong class="target-name">{{ compareLeftOption.name }}</strong>
              <span class="target-meta">{{ compareLeftOption.meta }}</span>
              <span class="target-time">{{ compareLeftOption.updatedLabel }}</span>
            </div>
            <div class="target-arrow" aria-hidden="true">→</div>
            <div class="target-card emphasis">
              <span class="target-caption">对比结果</span>
              <strong class="target-name">{{ compareRightOption.name }}</strong>
              <span class="target-meta">{{ compareRightOption.meta }}</span>
              <span class="target-time">{{ compareRightOption.updatedLabel }}</span>
            </div>
          </div>

          <div class="compare-summary">
            <div class="summary-item">
              <span class="summary-label">变化模块</span>
              <strong class="summary-value">{{ compareResult.summary.sectionCount }}</strong>
            </div>
            <div class="summary-item">
              <span class="summary-label">字段改动</span>
              <strong class="summary-value">{{ compareResult.summary.fieldChangeCount }}</strong>
            </div>
            <div class="summary-item">
              <span class="summary-label">新增条目</span>
              <strong class="summary-value">{{ compareResult.summary.addedEntryCount }}</strong>
            </div>
            <div class="summary-item">
              <span class="summary-label">删除条目</span>
              <strong class="summary-value">{{ compareResult.summary.removedEntryCount }}</strong>
            </div>
            <div class="summary-item">
              <span class="summary-label">修改条目</span>
              <strong class="summary-value">{{ compareResult.summary.updatedEntryCount }}</strong>
            </div>
          </div>

          <div v-if="!compareResult.hasChanges" class="compare-empty">
            这两个版本内容一致，没有差异。
          </div>
          <div v-else class="diff-sections">
            <section v-for="section in compareResult.sections" :key="section.key" class="diff-section">
              <div class="section-header">
                <h3>{{ section.label }}</h3>
                <span class="section-count">{{ section.changeCount }} 处变化</span>
              </div>

              <div v-if="section.fields.length" class="diff-field-list">
                <article v-for="field in section.fields" :key="field.key" class="diff-card">
                  <div class="diff-card-header">
                    <span class="diff-title">{{ field.label }}</span>
                    <span class="diff-badge" :class="field.kind">{{ getDiffKindLabel(field.kind) }}</span>
                  </div>
                  <div class="diff-columns">
                    <div class="diff-column">
                      <span class="column-label">{{ compareLeftOption.name }}</span>
                      <pre class="diff-value">{{ formatDiffValue(field.before) }}</pre>
                    </div>
                    <div class="diff-column">
                      <span class="column-label">{{ compareRightOption.name }}</span>
                      <pre class="diff-value">{{ formatDiffValue(field.after) }}</pre>
                    </div>
                  </div>
                </article>
              </div>

              <div v-if="section.entries.length" class="diff-entry-list">
                <article v-for="entry in section.entries" :key="entry.key" class="entry-card">
                  <div class="diff-card-header">
                    <span class="diff-title">{{ entry.title }}</span>
                    <span class="diff-badge" :class="entry.kind">{{ getDiffKindLabel(entry.kind) }}</span>
                  </div>
                  <div class="entry-fields">
                    <div v-for="field in entry.fields" :key="`${entry.key}-${field.key}`" class="entry-field">
                      <div class="entry-field-title">{{ field.label }}</div>
                      <div class="diff-columns">
                        <div class="diff-column">
                          <span class="column-label">{{ compareLeftOption.name }}</span>
                          <pre class="diff-value">{{ formatDiffValue(field.before) }}</pre>
                        </div>
                        <div class="diff-column">
                          <span class="column-label">{{ compareRightOption.name }}</span>
                          <pre class="diff-value">{{ formatDiffValue(field.after) }}</pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.version-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 24px;
}

.version-dialog {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  width: min(420px, 100%);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.version-dialog.expanded {
  width: min(980px, 100%);
}

.version-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.version-header h2 {
  margin: 0;
  font-size: 18px;
  color: #2d2521;
}

.header-subtitle {
  margin: 6px 0 0;
  color: #7b6a5b;
  font-size: 13px;
  line-height: 1.5;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #7b6a5b;
  line-height: 1;
}

.view-switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  background: #f7f3ee;
  border-radius: 10px;
  margin-bottom: 16px;
  width: fit-content;
}

.view-switch-btn {
  border: none;
  background: transparent;
  color: #7b6a5b;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
}

.view-switch-btn.active {
  background: #2d2521;
  color: #fff;
}

.conflict-banner {
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid #e8c69e;
  border-radius: 8px;
  background: #fff8ee;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.conflict-banner strong {
  display: block;
  font-size: 13px;
  color: #7c3f16;
}

.conflict-banner p {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #8a5a30;
}

.conflict-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.primary-btn,
.secondary-btn {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.primary-btn {
  border: 1px solid #2a5caa;
  background: #2a5caa;
  color: #fff;
}

.secondary-btn {
  border: 1px solid #d6c9b8;
  background: #fff;
  color: #6f5947;
}

.primary-btn:disabled,
.secondary-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.version-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.version-item {
  border: 1px solid #e0d2c1;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.version-item:hover {
  background: #faf6f0;
}

.version-item.active {
  border-color: #2a5caa;
  background: #f0f5ff;
}

.version-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.version-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.version-name {
  font-size: 14px;
  color: #2d2521;
  font-weight: 600;
}

.version-meta,
.version-time {
  font-size: 12px;
  color: #7b6a5b;
}

.version-actions-inline {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

.compare-btn,
.delete-btn {
  border: none;
  background: none;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.compare-btn {
  color: #2a5caa;
}

.delete-btn {
  color: #dc3545;
}

.no-versions,
.compare-empty {
  text-align: center;
  color: #7b6a5b;
  padding: 24px 12px;
  font-size: 14px;
  border: 1px dashed #e0d2c1;
  border-radius: 8px;
  background: #faf8f4;
}

.version-actions {
  border-top: 1px solid #e0d2c1;
  padding-top: 16px;
}

.create-btn {
  width: 100%;
  padding: 10px;
  background: #2d2521;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.new-version-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.new-version-form input,
.compare-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e0d2c1;
  border-radius: 8px;
  font-size: 14px;
  color: #2d2521;
  background: #fff;
}

.form-actions {
  display: flex;
  gap: 8px;
}

.cancel-btn,
.confirm-btn {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.cancel-btn {
  background: #f0f0f0;
  color: #333;
}

.confirm-btn {
  background: #2a5caa;
  color: #fff;
}

.confirm-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-msg {
  color: #dc3545;
  font-size: 13px;
}

.manage-error {
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid #f5c2c7;
  border-radius: 8px;
  background: #fdf2f2;
}

.compare-toolbar {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.select-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.select-label {
  font-size: 12px;
  color: #7b6a5b;
  font-weight: 600;
}

.compare-content {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.compare-targets {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
  margin-bottom: 16px;
}

.target-card {
  border: 1px solid #e0d2c1;
  border-radius: 8px;
  padding: 12px;
  background: #faf8f4;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.target-card.emphasis {
  border-color: #2a5caa;
  background: #f0f5ff;
}

.target-caption,
.target-meta,
.target-time,
.column-label,
.summary-label,
.section-count,
.entry-field-title {
  font-size: 12px;
  color: #7b6a5b;
}

.target-name,
.summary-value,
.diff-title {
  color: #2d2521;
  font-weight: 700;
}

.target-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #7b6a5b;
  font-size: 18px;
}

.compare-summary {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.summary-item {
  border: 1px solid #e0d2c1;
  border-radius: 8px;
  padding: 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.diff-sections {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  padding-right: 4px;
}

.diff-section {
  border: 1px solid #e0d2c1;
  border-radius: 8px;
  padding: 14px;
  background: #fcfaf7;
}

.section-header,
.diff-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-header {
  margin-bottom: 12px;
}

.section-header h3 {
  margin: 0;
  font-size: 15px;
  color: #2d2521;
}

.diff-field-list,
.diff-entry-list,
.entry-fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.diff-card,
.entry-card {
  border: 1px solid #eadfce;
  border-radius: 8px;
  background: #fff;
  padding: 12px;
}

.diff-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 10px;
}

.diff-column {
  border: 1px solid #f0e7da;
  border-radius: 8px;
  padding: 10px;
  background: #fcfaf7;
}

.diff-value {
  margin: 8px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
  color: #2d2521;
}

.entry-field + .entry-field {
  border-top: 1px solid #f0e7da;
  padding-top: 10px;
}

.diff-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.diff-badge.added {
  background: #ebf7ee;
  color: #1f7a38;
}

.diff-badge.removed {
  background: #fdecec;
  color: #c73e3e;
}

.diff-badge.changed {
  background: #eef4ff;
  color: #2a5caa;
}

@media (max-width: 900px) {
  .version-overlay {
    padding: 16px;
  }

  .compare-toolbar,
  .compare-targets,
  .compare-summary,
  .diff-columns {
    grid-template-columns: 1fr;
  }

  .target-arrow {
    display: none;
  }

  .conflict-banner {
    align-items: flex-start;
    flex-direction: column;
  }

  .conflict-actions {
    width: 100%;
  }

  .primary-btn,
  .secondary-btn {
    flex: 1;
  }
}
</style>
