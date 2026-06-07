<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAiConfigStore } from '@/stores/aiConfig'
import { useQuestionBankStore } from '@/stores/questionBank'
import { useResumeStore } from '@/stores/resume'
import {
  buildQuestionSearchText,
  extractTechStacksFromText,
  matchProjectNamesInText,
} from '@/services/questionMetaService'
import {
  generateResumeQuestions,
  type GeneratedResumeQuestionBatch,
} from '@/services/questionParseService'

const questionBankStore = useQuestionBankStore()
const resumeStore = useResumeStore()
const aiConfig = useAiConfigStore()

const isExpanded = ref(false)
const isLoading = ref(false)
const errorMsg = ref('')
const successMsg = ref('')
const aiOutput = ref('')
const generatedResult = ref<GeneratedResumeQuestionBatch | null>(null)
let abortController: AbortController | null = null

const resumeSnapshot = computed(() => ({
  basicInfo: resumeStore.basicInfo,
  skillsText: resumeStore.skills,
  workList: resumeStore.workList,
  projectList: resumeStore.projectList,
  educationList: resumeStore.educationList,
  selfIntro: resumeStore.selfIntro,
}))

const hasResumeContent = computed(() => {
  const { basicInfo, skillsText, workList, projectList, educationList, selfIntro } = resumeSnapshot.value
  const basicFields = [
    basicInfo.name,
    basicInfo.jobTitle,
    basicInfo.workYears,
    basicInfo.educationLevel,
    basicInfo.currentCity,
  ]
  const workFilled = workList.some(
    (item) => item.company.trim() || item.position.trim() || item.description.trim(),
  )
  const projectFilled = projectList.some(
    (item) => item.name.trim() || item.role.trim() || item.introduction.trim() || item.mainWork.trim(),
  )
  const educationFilled = educationList.some(
    (item) => item.school.trim() || item.major.trim() || item.degree.trim() || item.description.trim(),
  )

  return (
    basicFields.some((item) => item.trim()) ||
    skillsText.trim() !== '' ||
    selfIntro.trim() !== '' ||
    workFilled ||
    projectFilled ||
    educationFilled
  )
})

const resumeProjectNames = computed(() =>
  resumeStore.projectList
    .map((item) => item.name.trim())
    .filter(Boolean),
)

function resetState() {
  generatedResult.value = null
  errorMsg.value = ''
  successMsg.value = ''
  aiOutput.value = ''
}

async function handleGenerate() {
  if (isLoading.value) return
  if (!hasResumeContent.value) {
    errorMsg.value = '请先填写一些简历内容，再生成面试题。'
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

  await generateResumeQuestions(
    resumeSnapshot.value,
    {
      onChunk(text) {
        aiOutput.value = text
      },
      onDone(result) {
        generatedResult.value = result
        isLoading.value = false
      },
      onError(error) {
        errorMsg.value = error
        isLoading.value = false
      },
    },
    abortController.signal,
  )
}

function handleCancel() {
  abortController?.abort()
  isLoading.value = false
}

function handleImport() {
  if (!generatedResult.value) return
  const imported = questionBankStore.addQuestions(
    generatedResult.value.questions.map((item) => {
      const searchText = buildQuestionSearchText(item)
      return {
        chapterId: item.chapterId,
        title: item.title,
        difficulty: item.difficulty,
        labels: item.labels,
        source: 'resume-generated' as const,
        projectNames: matchProjectNamesInText(searchText, resumeProjectNames.value),
        techStacks: extractTechStacksFromText(searchText),
        answer: item.answer,
      }
    }),
  )

  if (imported[0]) {
    questionBankStore.selectChapter(null)
    questionBankStore.selectQuestion(imported[0].id)
  }

  successMsg.value = `已导入 ${imported.length} 道简历定制题目`
  errorMsg.value = ''
  isExpanded.value = false
  generatedResult.value = null
  aiOutput.value = ''
}

function handleDiscard() {
  abortController?.abort()
  isLoading.value = false
  isExpanded.value = false
  resetState()
}
</script>

<template>
  <div class="resume-generator">
    <button class="generator-btn" :class="{ active: isExpanded }" @click="isExpanded = true">
      <span class="generator-icon">AI</span>
      根据当前简历生成面试题
    </button>

    <Teleport to="body">
      <div v-if="isExpanded" class="generator-modal" @click.self="handleDiscard">
        <div class="generator-panel">
          <div class="generator-header">
            <div>
              <h3 class="generator-title">根据当前简历生成面试题</h3>
              <p class="generator-desc">一次生成 18-28 道高价值问题，覆盖项目深挖、技术栈、设计与开放题。</p>
            </div>
            <button class="close-btn" @click="handleDiscard">×</button>
          </div>

          <div class="generator-actions">
            <button
              v-if="!isLoading"
              class="generate-btn"
              :disabled="!hasResumeContent"
              @click="handleGenerate"
            >
              开始生成
            </button>
            <button v-else class="cancel-btn" @click="handleCancel">取消生成</button>
            <span class="hint-text">{{ hasResumeContent ? '会读取当前简历内容，不需要手动复制。' : '当前简历内容还比较空。' }}</span>
          </div>

          <div v-if="successMsg" class="success-msg">{{ successMsg }}</div>
          <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>

          <div v-if="isLoading && aiOutput" class="preview-card">
            <div class="preview-label">AI 生成中...</div>
            <pre class="preview-content">{{ aiOutput }}</pre>
          </div>

          <div v-if="generatedResult" class="result-card">
            <div class="result-summary">
              <div class="summary-label">覆盖总结</div>
              <p class="summary-text">{{ generatedResult.summary }}</p>
              <div class="summary-meta">共 {{ generatedResult.questions.length }} 道题</div>
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
                  <span class="preview-difficulty">{{ item.difficulty === 'basic' ? '基础' : item.difficulty === 'intermediate' ? '中等' : '高级' }}</span>
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
.resume-generator {
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
  border: 1px solid #d0c2f3;
  border-radius: 8px;
  background: #fff;
  color: #46346f;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}

.generator-btn:hover {
  border-color: #b49be8;
  box-shadow: 0 6px 16px rgba(100, 76, 156, 0.08);
}

.generator-btn.active {
  border-color: #8f6ee8;
  background: #fbf8ff;
}

.generator-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: #f1ebff;
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
  background: #5a3ec8;
  color: #fff;
}

.generate-btn:hover:not(:disabled),
.regenerate-btn:hover {
  background: #4b33a7;
}

.generate-btn:disabled {
  background: #d9d2ea;
  cursor: not-allowed;
}

.cancel-btn,
.regenerate-btn {
  border: 1px solid #ddd2f8;
  background: #fff;
  color: #5a3ec8;
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
  background: #faf9ff;
  padding: 12px;
}

.preview-label,
.summary-label {
  margin-bottom: 8px;
  font-size: 11px;
  font-weight: 700;
  color: #7a5ac7;
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
  border-bottom: 1px solid #eadffb;
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
  border: 1px solid #ede4ff;
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
  color: #7a5ac7;
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
