<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAiConfigStore } from '@/stores/aiConfig'
import { useJdProfileStore } from '@/stores/jdProfile'
import { useResumeStore } from '@/stores/resume'
import {
  generateJdQuestions,
  type GeneratedJdQuestionBatch,
} from '@/services/jdQuestionGenerationService'

const jdStore = useJdProfileStore()
const resumeStore = useResumeStore()
const aiConfig = useAiConfigStore()

const isExpanded = ref(false)
const isLoading = ref(false)
const errorMsg = ref('')
const successMsg = ref('')
const aiOutput = ref('')
const generatedResult = ref<GeneratedJdQuestionBatch | null>(null)
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

const activeProfileReady = computed(() => {
  const profile = jdStore.activeProfile
  if (!profile) return false
  return profile.name.trim() !== '' || profile.rawText.trim() !== ''
})

function resetState() {
  generatedResult.value = null
  errorMsg.value = ''
  successMsg.value = ''
  aiOutput.value = ''
}

async function handleGenerate() {
  if (isLoading.value || !jdStore.activeProfile) return
  if (!activeProfileReady.value) {
    errorMsg.value = '请先选择一个 JD，并补充 JD 名称或原文。'
    return
  }
  if (!hasResumeContent.value) {
    errorMsg.value = '请先填写一些简历内容，再生成 JD 专项题。'
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

  await generateJdQuestions(
    {
      jdName: jdStore.activeProfile.name,
      jdText: jdStore.activeProfile.rawText,
      resumeSnapshot: resumeSnapshot.value,
    },
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
  if (!generatedResult.value || !jdStore.activeProfileId) return

  const imported = jdStore.addQuestions(
    jdStore.activeProfileId,
    generatedResult.value.questions.map((item) => ({
      title: item.title,
      difficulty: item.difficulty,
      labels: item.labels,
      answer: item.answer,
    })),
  )

  if (imported[0]) {
    jdStore.selectQuestion(imported[0].id)
  }

  successMsg.value = `已导入 ${imported.length} 道 JD 专项题`
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
  <div class="jd-generator">
    <button
      v-if="!isExpanded"
      class="generator-btn"
      :disabled="!jdStore.activeProfileId"
      @click="isExpanded = true"
    >
      <span class="generator-icon">AI</span>
      根据当前 JD 生成专项题
    </button>

    <div v-else class="generator-panel">
      <div class="generator-header">
        <div>
          <h3 class="generator-title">根据当前 JD 生成专项题</h3>
          <p class="generator-desc">结合当前简历和选中的 JD，一次生成更贴近目标岗位的高价值问题。</p>
        </div>
        <button class="close-btn" @click="handleDiscard">×</button>
      </div>

      <div class="generator-actions">
        <button
          v-if="!isLoading"
          class="generate-btn"
          :disabled="!jdStore.activeProfileId || !hasResumeContent"
          @click="handleGenerate"
        >
          开始生成
        </button>
        <button v-else class="cancel-btn" @click="handleCancel">取消生成</button>
        <span class="hint-text">
          {{
            !jdStore.activeProfileId
              ? '请先选择一个 JD。'
              : hasResumeContent
                ? '会同时读取当前简历和当前 JD。'
                : '当前简历内容还比较空。'
          }}
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
          <div class="summary-label">匹配重点</div>
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
              <span class="preview-difficulty">
                {{ item.difficulty === 'basic' ? '基础' : item.difficulty === 'intermediate' ? '中等' : '高级' }}
              </span>
            </div>
            <p class="preview-title">{{ item.title }}</p>
          </div>
        </div>

        <div class="confirm-row">
          <button class="confirm-btn" @click="handleImport">导入当前 JD</button>
          <button class="regenerate-btn" @click="handleGenerate">重新生成</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.jd-generator {
  padding: 0 14px 12px;
  border-bottom: 1px solid #e8e0d5;
  background: #faf8f5;
}

.generator-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #f0c7b0;
  border-radius: 8px;
  background: #fff;
  color: #9a4f2f;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}

.generator-btn:hover:not(:disabled) {
  border-color: #d97745;
  box-shadow: 0 6px 16px rgba(217, 119, 69, 0.08);
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
  background: #fff2eb;
  font-size: 11px;
  font-weight: 700;
}

.generator-panel {
  border: 1px solid #e8e0d5;
  border-radius: 10px;
  background: #fff;
  padding: 14px;
}

.generator-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.generator-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #2d2521;
}

.generator-desc {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: #7b6a5b;
}

.close-btn {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 50%;
  background: #f2ece6;
  color: #7b6a5b;
  font-size: 16px;
  cursor: pointer;
  line-height: 1;
}

.generator-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.generate-btn,
.cancel-btn,
.confirm-btn,
.regenerate-btn {
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  padding: 9px 14px;
  cursor: pointer;
}

.generate-btn,
.confirm-btn {
  background: #d97745;
  color: #fff;
}

.cancel-btn,
.regenerate-btn {
  background: #f4eee8;
  color: #6a5748;
}

.generate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hint-text {
  font-size: 12px;
  color: #8a7461;
}

.success-msg,
.error-msg {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.success-msg {
  border: 1px solid #c8e6cf;
  background: #eef8f1;
  color: #2b7a45;
}

.error-msg {
  border: 1px solid #f0d2c8;
  background: #fff1ec;
  color: #b74a30;
}

.preview-card,
.result-card {
  margin-top: 12px;
  border: 1px solid #eadfd2;
  border-radius: 10px;
  background: #faf8f5;
}

.preview-card {
  padding: 12px;
}

.preview-label,
.summary-label {
  font-size: 11px;
  font-weight: 700;
  color: #8a7258;
}

.preview-content {
  margin: 10px 0 0;
  max-height: 220px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.5;
  color: #40362d;
}

.result-card {
  padding: 12px;
}

.summary-text {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: #40362d;
}

.summary-meta {
  margin-top: 6px;
  font-size: 12px;
  color: #8a7258;
}

.question-preview {
  margin-top: 12px;
  display: grid;
  gap: 8px;
}

.preview-item {
  border: 1px solid #eadfd2;
  border-radius: 8px;
  background: #fff;
  padding: 10px 12px;
}

.preview-item-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 11px;
  color: #8a7258;
}

.preview-index {
  font-weight: 700;
  color: #5f5448;
}

.preview-chapter {
  font-weight: 600;
}

.preview-difficulty {
  padding: 2px 6px;
  border-radius: 999px;
  background: #f3ece5;
  color: #7b6a5b;
}

.preview-title {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: #2d2521;
  font-weight: 600;
}

.confirm-row {
  margin-top: 12px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
