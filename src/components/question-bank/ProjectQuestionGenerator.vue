<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAiConfigStore } from '@/stores/aiConfig'
import { useQuestionBankStore } from '@/stores/questionBank'
import { useResumeStore, type ProjectEntry } from '@/stores/resume'
import {
  buildQuestionSearchText,
  extractTechStacksFromText,
} from '@/services/questionMetaService'
import {
  generateProjectQuestions,
  type GeneratedProjectQuestionBatch,
} from '@/services/questionParseService'

const questionBankStore = useQuestionBankStore()
const resumeStore = useResumeStore()
const aiConfig = useAiConfigStore()

const isExpanded = ref(false)
const selectedProjectId = ref('')
const isLoading = ref(false)
const errorMsg = ref('')
const successMsg = ref('')
const aiOutput = ref('')
const generatedResult = ref<GeneratedProjectQuestionBatch | null>(null)
let abortController: AbortController | null = null

const resumeSnapshot = computed(() => ({
  basicInfo: resumeStore.basicInfo,
  skillsText: resumeStore.skills,
  workList: resumeStore.workList,
  projectList: resumeStore.projectList,
  educationList: resumeStore.educationList,
  selfIntro: resumeStore.selfIntro,
}))

const projectOptions = computed(() =>
  resumeStore.projectList
    .filter((item) => item.name.trim() || item.role.trim() || item.introduction.trim() || item.mainWork.trim())
    .map((item, index) => ({
      id: item.id,
      label: item.name.trim() || `项目经历 ${index + 1}`,
      project: item,
    })),
)

const selectedProject = computed<ProjectEntry | null>(() =>
  projectOptions.value.find((item) => item.id === selectedProjectId.value)?.project ?? null,
)

watch(
  projectOptions,
  (options) => {
    if (options.length === 0) {
      selectedProjectId.value = ''
      return
    }
    const stillExists = options.some((item) => item.id === selectedProjectId.value)
    if (!stillExists) {
      selectedProjectId.value = options[0]?.id ?? ''
    }
  },
  { immediate: true },
)

function resetState() {
  generatedResult.value = null
  errorMsg.value = ''
  successMsg.value = ''
  aiOutput.value = ''
}

async function handleGenerate() {
  if (isLoading.value) return
  if (!selectedProject.value) {
    errorMsg.value = '请先在简历里补充一个项目经历，再生成项目深挖题。'
    return
  }
  if (!aiConfig.isConfigured) {
    errorMsg.value = '请先在 AI 设置里配置模型与密钥。'
    return
  }

  isLoading.value = true
  errorMsg.value = ''
  successMsg.value = ''
  generatedResult.value = null
  aiOutput.value = ''
  abortController = new AbortController()

  await generateProjectQuestions(
    resumeSnapshot.value,
    selectedProject.value,
    {
      onChunk(text) {
        aiOutput.value = text
      },
      onDone(result) {
        generatedResult.value = result
        isLoading.value = false
        abortController = null
      },
      onError(error) {
        errorMsg.value = error
        isLoading.value = false
        abortController = null
      },
    },
    abortController.signal,
  )
}

function handleCancel() {
  abortController?.abort()
  abortController = null
  isLoading.value = false
}

function handleImport() {
  if (!generatedResult.value || !selectedProject.value) return
  const selectedProjectName = selectedProject.value.name.trim()
  const projectContext = [
    selectedProject.value.name,
    selectedProject.value.role,
    selectedProject.value.introduction,
    selectedProject.value.mainWork,
  ].join('\n')
  const imported = questionBankStore.addQuestions(
    generatedResult.value.questions.map((item) => {
      const searchText = `${projectContext}\n${buildQuestionSearchText(item)}`.trim()
      return {
        chapterId: item.chapterId,
        title: item.title,
        difficulty: item.difficulty,
        labels: item.labels,
        source: 'project-generated' as const,
        projectNames: selectedProjectName ? [selectedProjectName] : [],
        techStacks: extractTechStacksFromText(searchText),
        answer: item.answer,
      }
    }),
  )

  if (imported[0]) {
    questionBankStore.selectChapter(null)
    questionBankStore.selectQuestion(imported[0].id)
  }

  successMsg.value = `已为“${generatedResult.value.projectName}”导入 ${imported.length} 道项目深挖题`
  errorMsg.value = ''
  isExpanded.value = false
  generatedResult.value = null
  aiOutput.value = ''
}

function handleDiscard() {
  abortController?.abort()
  abortController = null
  isLoading.value = false
  isExpanded.value = false
  resetState()
}
</script>

<template>
  <div class="project-generator">
    <button
      class="generator-btn"
      :class="{ active: isExpanded }"
      :disabled="projectOptions.length === 0"
      @click="isExpanded = true"
    >
      <span class="generator-icon">AI</span>
      按项目经历生成面试题
    </button>

    <Teleport to="body">
      <div v-if="isExpanded" class="generator-modal" @click.self="handleDiscard">
        <div class="generator-panel">
          <div class="generator-header">
            <div>
              <h3 class="generator-title">按项目经历生成面试题</h3>
              <p class="generator-desc">只围绕一个项目深挖，适合专项突击准备面试追问。</p>
            </div>
            <button class="close-btn" @click="handleDiscard">×</button>
          </div>

          <div class="selector-block">
            <label class="selector-label" for="project-question-generator-select">选择项目</label>
            <select
              id="project-question-generator-select"
              v-model="selectedProjectId"
              class="selector-input"
              :disabled="isLoading || projectOptions.length === 0"
            >
              <option v-for="option in projectOptions" :key="option.id" :value="option.id">
                {{ option.label }}
              </option>
            </select>
          </div>

          <div class="generator-actions">
            <button
              v-if="!isLoading"
              class="generate-btn"
              :disabled="!selectedProject"
              @click="handleGenerate"
            >
              开始生成
            </button>
            <button v-else class="cancel-btn" @click="handleCancel">取消生成</button>
            <span class="hint-text">
              {{ selectedProject ? '会读取当前项目及必要简历上下文。' : '请先在简历里填写项目经历。' }}
            </span>
          </div>

          <div v-if="successMsg" class="success-msg">{{ successMsg }}</div>
          <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>

          <div v-if="isLoading && aiOutput" class="preview-card">
            <div class="preview-label">AI 生成中...</div>
            <pre class="preview-content">{{ aiOutput }}</pre>
          </div>

          <div v-if="generatedResult" class="result-card">
            <div class="result-summary">
              <div class="summary-label">项目重点</div>
              <p class="summary-text">{{ generatedResult.summary }}</p>
              <div class="summary-meta">{{ generatedResult.projectName }} · 共 {{ generatedResult.questions.length }} 道题</div>
            </div>

            <div class="question-preview">
              <div
                v-for="(item, index) in generatedResult.questions"
                :key="`${item.chapterId}-${index}-${item.title}`"
                class="preview-item"
              >
                <div class="preview-item-head">
                  <span class="preview-index">Q{{ index + 1 }}</span>
                  <span class="preview-chapter">{{ item.chapterName }}</span>
                  <span class="preview-difficulty">
                    {{ item.difficulty === 'basic' ? '基础' : item.difficulty === 'intermediate' ? '中等' : '高级' }}
                  </span>
                </div>
                <p class="preview-title">{{ item.title }}</p>
              </div>
            </div>

            <div class="confirm-row">
              <button class="confirm-btn" @click="handleImport">导入题库</button>
              <button class="regenerate-btn" @click="handleGenerate">重新生成</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.project-generator {
  flex: 1;
  min-width: 220px;
  padding: 0;
  border-bottom: none;
  background: transparent;
}

.generator-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 36px;
  padding: 10px 14px;
  border: 1px solid #cfd8ea;
  border-radius: 8px;
  background: #fff;
  color: #2f4a76;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}

.generator-btn:hover:not(:disabled) {
  border-color: #7a97c8;
  box-shadow: 0 6px 16px rgba(82, 111, 166, 0.08);
}

.generator-btn.active {
  border-color: #456ca8;
  background: #f8fbff;
}

.generator-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.generator-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: #eef4ff;
  font-size: 11px;
  font-weight: 700;
}

.generator-modal {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(45, 37, 33, 0.42);
}

.generator-panel {
  border: 1px solid #e8e0d5;
  border-radius: 10px;
  background: #fff;
  padding: 14px;
  width: min(760px, 100%);
  max-height: min(82vh, 720px);
  overflow-y: auto;
  box-shadow: 0 20px 52px rgba(45, 37, 33, 0.22);
}

.generator-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.generator-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 700;
  color: #2d2521;
}

.generator-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: #7b6a5b;
}

.close-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background: #f0ebe5;
  color: #7b6a5b;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.close-btn:hover {
  background: #e0d5c8;
}

.selector-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}

.selector-label {
  font-size: 12px;
  color: #7b6a5b;
}

.selector-input {
  padding: 9px 12px;
  border: 1px solid #d7ddea;
  border-radius: 8px;
  background: #fff;
  color: #2d2521;
  font-size: 13px;
  outline: none;
}

.selector-input:focus {
  border-color: #7a97c8;
}

.generator-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.generate-btn,
.cancel-btn,
.confirm-btn,
.regenerate-btn {
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.generate-btn {
  border: none;
  background: #456ca8;
  color: #fff;
}

.generate-btn:hover:not(:disabled),
.regenerate-btn:hover {
  background: #38598d;
}

.generate-btn:disabled {
  background: #d7dfef;
  cursor: not-allowed;
}

.cancel-btn,
.regenerate-btn {
  border: 1px solid #d9e1ef;
  background: #fff;
  color: #456ca8;
}

.hint-text {
  font-size: 12px;
  color: #8a7461;
}

.error-msg,
.success-msg {
  margin-bottom: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
}

.error-msg {
  background: #fff5f5;
  border: 1px solid #fecaca;
  color: #dc2626;
}

.success-msg {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #15803d;
}

.preview-card,
.result-card {
  border: 1px solid #e8e0d5;
  border-radius: 8px;
  background: #f8fbff;
  padding: 12px;
}

.preview-label,
.summary-label {
  margin-bottom: 8px;
  font-size: 11px;
  font-weight: 700;
  color: #456ca8;
}

.preview-content {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: #3a3028;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
}

.result-summary {
  padding-bottom: 12px;
  border-bottom: 1px solid #deebfb;
}

.summary-text {
  margin: 0 0 6px;
  font-size: 13px;
  line-height: 1.6;
  color: #2d2521;
}

.summary-meta {
  font-size: 12px;
  color: #7b6a5b;
}

.question-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  max-height: 320px;
  overflow-y: auto;
}

.preview-item {
  border: 1px solid #e0e9f8;
  border-radius: 8px;
  background: #fff;
  padding: 10px;
}

.preview-item-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 6px;
}

.preview-index {
  font-size: 11px;
  font-weight: 700;
  color: #456ca8;
}

.preview-chapter,
.preview-difficulty {
  font-size: 11px;
  color: #7b6a5b;
}

.preview-title {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: #2d2521;
}

.confirm-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.confirm-btn {
  flex: 1;
  border: none;
  background: #22c55e;
  color: #fff;
}

.confirm-btn:hover {
  background: #16a34a;
}

.regenerate-btn {
  flex: 1;
}

@media (max-width: 720px) {
  .generator-modal {
    padding: 12px;
    align-items: stretch;
  }

  .generator-actions,
  .confirm-row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
