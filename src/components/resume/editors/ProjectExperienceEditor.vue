<script setup lang="ts">
import { useResumeStore } from '@/stores/resume'
import { useAiConfigStore } from '@/stores/aiConfig'
import { ref } from 'vue'
import type { ProjectEntry } from '@/stores/resume'
import RichEditor from '@/components/common/RichEditor.vue'
import {
  rewriteProjectByStar,
  type ProjectStarRewriteResult,
} from '@/services/projectStarRewriteService'

const store = useResumeStore()
const aiConfig = useAiConfigStore()
const collapsed = ref(false)

// 每个项目的 STAR 重写状态
interface ProjectRewriteState {
  isLoading: boolean
  errorMsg: string
  aiOutput: string
  result: ProjectStarRewriteResult | null
  // 应用前的快照，用于撤销
  appliedSnapshot: { introduction: string; mainWork: string } | null
  // 已应用的标记（用于显示"已应用"状态）
  isApplied: boolean
  abortController: AbortController | null
}

const rewriteStates = ref<Record<string, ProjectRewriteState>>({})

function getState(projectId: string): ProjectRewriteState {
  if (!rewriteStates.value[projectId]) {
    rewriteStates.value[projectId] = {
      isLoading: false,
      errorMsg: '',
      aiOutput: '',
      result: null,
      appliedSnapshot: null,
      isApplied: false,
      abortController: null,
    }
  }
  return rewriteStates.value[projectId]
}

function hasProjectContent(project: ProjectEntry): boolean {
  return Boolean(
    project.name.trim() ||
      project.role.trim() ||
      project.introduction.trim() ||
      project.mainWork.trim(),
  )
}

async function handleRewrite(project: ProjectEntry) {
  const state = getState(project.id)
  if (state.isLoading) return

  if (!hasProjectContent(project)) {
    state.errorMsg = '请先填写项目名称、角色或主要工作。'
    return
  }
  if (!aiConfig.isConfigured) {
    state.errorMsg = '请先在 AI 设置里配置模型与密钥。'
    return
  }

  state.isLoading = true
  state.errorMsg = ''
  state.result = null
  state.aiOutput = ''
  state.abortController = new AbortController()

  await rewriteProjectByStar(
    { project: { ...project } },
    {
      onChunk(text) {
        state.aiOutput = text
      },
      onDone(result) {
        state.result = result
        state.isLoading = false
        state.abortController = null
      },
      onError(error) {
        state.errorMsg = error
        state.isLoading = false
        state.abortController = null
      },
    },
    state.abortController.signal,
  )
}

function handleCancel(projectId: string) {
  const state = getState(projectId)
  state.abortController?.abort()
  state.abortController = null
  state.isLoading = false
}

function handleApply(project: ProjectEntry) {
  const state = getState(project.id)
  if (!state.result) return

  // 保存快照用于撤销
  if (!state.appliedSnapshot) {
    state.appliedSnapshot = {
      introduction: project.introduction,
      mainWork: project.mainWork,
    }
  }

  project.introduction = state.result.introduction
  project.mainWork = state.result.mainWork
  state.isApplied = true
}

function handleUndo(project: ProjectEntry) {
  const state = getState(project.id)
  if (!state.appliedSnapshot) return

  project.introduction = state.appliedSnapshot.introduction
  project.mainWork = state.appliedSnapshot.mainWork
  state.appliedSnapshot = null
  state.isApplied = false
}

function handleDiscard(projectId: string) {
  const state = getState(projectId)
  handleCancel(projectId)
  state.result = null
  state.errorMsg = ''
  state.aiOutput = ''
  state.isApplied = false
  state.appliedSnapshot = null
}

const EMPTY_PLACEHOLDER = '<p class="star-empty">（空）</p>'

function getResultHtml(projectId: string, field: 'introduction' | 'mainWork'): string {
  const state = getState(projectId)
  if (!state.result) return EMPTY_PLACEHOLDER
  const html = field === 'introduction' ? state.result.introduction : state.result.mainWork
  return html || EMPTY_PLACEHOLDER
}

function getResultSummary(projectId: string): string {
  return getState(projectId).result?.summary ?? ''
}
</script>

<template>
  <section class="editor-section">
    <div class="section-header" @click="collapsed = !collapsed">
      <div class="section-toggle">
        <svg class="chevron" :class="{ rotated: !collapsed }" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <h3>项目经历</h3>
      </div>
    </div>

    <div v-show="!collapsed" class="section-body">
      <div
        v-for="(proj, index) in store.projectList"
        :key="proj.id"
        class="entry-card"
      >
        <div class="entry-header">
          <span class="entry-index">项目经历 {{ index + 1 }}</span>
          <div class="entry-actions">
            <button
              class="btn-move"
              :disabled="!store.canMoveProject(proj.id, 'up')"
              @click="store.moveProject(proj.id, 'up')"
            >
              ↑
            </button>
            <button
              class="btn-move"
              :disabled="!store.canMoveProject(proj.id, 'down')"
              @click="store.moveProject(proj.id, 'down')"
            >
              ↓
            </button>
            <button
              v-if="store.projectList.length > 1"
              class="btn-remove"
              @click="store.removeProject(proj.id)"
            >
              ✕
            </button>
          </div>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">项目名称</label>
            <input v-model="proj.name" type="text" class="form-input" placeholder="请输入项目名称" />
          </div>
          <div class="form-group">
            <label class="form-label">担任角色</label>
            <input v-model="proj.role" type="text" class="form-input" placeholder="例如：后端开发" />
          </div>
          <div class="form-group">
            <label class="form-label">开始时间</label>
            <input v-model="proj.startDate" type="month" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label">结束时间</label>
            <input v-model="proj.endDate" type="month" class="form-input" />
          </div>
          <div class="form-group span-2">
            <label class="form-label">项目链接</label>
            <input v-model="proj.link" type="text" class="form-input" placeholder="例如：https://www.example.com" />
          </div>
        </div>

        <div class="form-group form-group-full">
          <label class="form-label">项目介绍</label>
          <RichEditor
            v-model="proj.introduction"
            :rows="3"
            placeholder="描述项目背景、技术栈、主要功能..."
          />
        </div>
        <div class="form-group form-group-full">
          <div class="label-with-action">
            <label class="form-label">主要工作</label>
            <button
              v-if="!getState(proj.id).result && !getState(proj.id).isLoading"
              class="btn-star"
              type="button"
              :disabled="!hasProjectContent(proj)"
              @click="handleRewrite(proj)"
            >
              AI STAR 化重写
            </button>
            <button
              v-else-if="getState(proj.id).isLoading"
              class="btn-star btn-star-cancel"
              type="button"
              @click="handleCancel(proj.id)"
            >
              取消生成
            </button>
            <button
              v-else-if="getState(proj.id).result"
              class="btn-star btn-star-secondary"
              type="button"
              @click="handleDiscard(proj.id)"
            >
              收起预览
            </button>
          </div>
          <RichEditor
            v-model="proj.mainWork"
            :rows="5"
            placeholder="描述你的职责、技术亮点和成果..."
          />
        </div>

        <div
          v-if="getState(proj.id).errorMsg"
          class="star-error"
        >
          {{ getState(proj.id).errorMsg }}
        </div>

        <div
          v-if="getState(proj.id).isLoading && getState(proj.id).aiOutput"
          class="star-preview"
        >
          <div class="star-preview-label">AI 生成中...</div>
          <pre class="star-preview-content">{{ getState(proj.id).aiOutput }}</pre>
        </div>

        <div
          v-if="getState(proj.id).result && !getState(proj.id).isLoading"
          class="star-result"
        >
          <div class="star-result-header">
            <span class="star-result-title">STAR 化重写预览</span>
            <span class="star-result-summary">{{ getResultSummary(proj.id) }}</span>
          </div>
          <div class="star-diff">
            <div class="star-diff-col">
              <div class="star-diff-label">项目介绍（重写后）</div>
              <div class="star-diff-content" v-html="getResultHtml(proj.id, 'introduction')"></div>
            </div>
            <div class="star-diff-col">
              <div class="star-diff-label">主要工作（重写后）</div>
              <div class="star-diff-content" v-html="getResultHtml(proj.id, 'mainWork')"></div>
            </div>
          </div>
          <div class="star-actions">
            <button
              v-if="!getState(proj.id).isApplied"
              class="btn-star btn-star-apply"
              type="button"
              @click="handleApply(proj)"
            >
              应用到项目
            </button>
            <button
              v-else
              class="btn-star btn-star-undo"
              type="button"
              @click="handleUndo(proj)"
            >
              撤销应用
            </button>
            <button
              class="btn-star btn-star-secondary"
              type="button"
              @click="handleRewrite(proj)"
            >
              重新生成
            </button>
          </div>
        </div>
      </div>

      <button class="btn-add" @click="store.addProject()">
        <span class="btn-add-icon">+</span>
        添加项目经历
      </button>
    </div>
  </section>
</template>

<style scoped>
.editor-section {
  margin-bottom: var(--spacing-lg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: white;
  overflow: hidden;
  transition: box-shadow var(--transition-base);
}

.editor-section:hover {
  box-shadow: var(--shadow-sm);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-lg) var(--spacing-xl);
  cursor: pointer;
  user-select: none;
  transition: background var(--transition-fast);
}

.section-header:hover {
  background: var(--gray-50);
}

.section-toggle {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.section-toggle h3 {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
}

.chevron {
  color: var(--text-secondary);
  transition: transform var(--transition-base);
  transform: rotate(0deg);
}

.chevron.rotated {
  transform: rotate(90deg);
}

.section-body {
  padding: 0 var(--spacing-xl) var(--spacing-xl);
}

.entry-card {
  padding: var(--spacing-lg);
  margin-bottom: var(--spacing-md);
  background: var(--gray-50);
  border-radius: var(--radius-md);
  border: 1px solid var(--gray-100);
}

.entry-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-md);
}

.entry-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.btn-move {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: var(--gray-200);
  color: var(--gray-600);
  border-radius: 50%;
  cursor: pointer;
  font-size: 0.75rem;
  transition: all var(--transition-fast);
}

.btn-move:hover:not(:disabled) {
  background: var(--primary-500);
  color: white;
}

.btn-move:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.entry-index {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--primary-600);
}

.btn-remove {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: var(--gray-200);
  color: var(--gray-500);
  border-radius: 50%;
  cursor: pointer;
  font-size: 0.7rem;
  transition: all var(--transition-fast);
}

.btn-remove:hover {
  background: var(--accent-red);
  color: white;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--spacing-md) var(--spacing-lg);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.form-group-full {
  margin-top: var(--spacing-md);
}

.span-2 {
  grid-column: span 2;
}

.form-label {
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-input {
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 0.88rem;
  color: var(--text-primary);
  background: white;
  transition: all var(--transition-fast);
  outline: none;
}

.form-input:focus {
  border-color: var(--primary-400);
  box-shadow: 0 0 0 3px var(--primary-50);
}

.form-input::placeholder {
  color: var(--gray-400);
}

.label-with-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.btn-star {
  border: 1px solid #f0c7b0;
  border-radius: 6px;
  background: #fff;
  color: #9a4f2f;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.btn-star:hover:not(:disabled) {
  border-color: #d97745;
  color: #d97745;
}

.btn-star:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-star-cancel,
.btn-star-undo {
  border-color: #ddcfbf;
  background: #f4eee8;
  color: #6a5748;
}

.btn-star-secondary {
  border-color: #ddcfbf;
  background: #f4eee8;
  color: #6a5748;
}

.btn-star-apply {
  border: none;
  background: #d97745;
  color: #fff;
}

.btn-star-apply:hover {
  background: #c96a3b;
}

.star-error {
  margin-top: var(--spacing-sm);
  padding: 8px 10px;
  border: 1px solid #f0d2c8;
  border-radius: 6px;
  background: #fff1ec;
  color: #b74a30;
  font-size: 12px;
  line-height: 1.5;
}

.star-preview {
  margin-top: var(--spacing-sm);
  border: 1px solid #eadfd2;
  border-radius: 6px;
  background: #faf8f5;
  padding: 10px;
}

.star-preview-label {
  font-size: 11px;
  font-weight: 600;
  color: #8a7258;
}

.star-preview-content {
  margin: 8px 0 0;
  max-height: 160px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.5;
  color: #40362d;
}

.star-result {
  margin-top: var(--spacing-sm);
  border: 1px solid #eadfd2;
  border-radius: 6px;
  background: #faf8f5;
  padding: 10px;
}

.star-result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.star-result-title {
  font-size: 12px;
  font-weight: 700;
  color: #5f5448;
}

.star-result-summary {
  font-size: 11px;
  color: #8a7258;
}

.star-diff {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.star-diff-col {
  border: 1px solid #eadfd2;
  border-radius: 6px;
  background: #fff;
  padding: 8px 10px;
}

.star-diff-label {
  font-size: 11px;
  font-weight: 600;
  color: #7b6a5b;
  margin-bottom: 6px;
}

.star-diff-content {
  font-size: 12px;
  line-height: 1.55;
  color: #2d2521;
  max-height: 220px;
  overflow-y: auto;
}

.star-diff-content :deep(ul) {
  margin: 0;
  padding-left: 18px;
}

.star-diff-content :deep(li) {
  margin: 2px 0;
}

.star-diff-content :deep(strong) {
  color: #9a4f2f;
  font-weight: 700;
}

.star-empty {
  color: #a08c7b;
  font-style: italic;
}

.star-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: var(--spacing-md);
  border: 2px dashed var(--primary-200);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--primary-600);
  font-size: 0.88rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-add:hover {
  background: var(--primary-50);
  border-color: var(--primary-400);
}

.btn-add-icon {
  font-size: 1.1rem;
  font-weight: 700;
}

@media (max-width: 720px) {
  .star-diff {
    grid-template-columns: 1fr;
  }
}
</style>
