<script setup lang="ts">
import { computed, ref } from 'vue'
import { useResumeStore } from '@/stores/resume'
import { useAiConfigStore } from '@/stores/aiConfig'
import {
  runResumeHealthCheck,
  getHealthModuleLabel,
  getHealthScoreLevel,
  getHealthScoreLabel,
  type ResumeHealthCheckResult,
} from '@/services/resumeHealthCheckService'

const resumeStore = useResumeStore()
const aiConfig = useAiConfigStore()

const isExpanded = ref(false)
const isLoading = ref(false)
const errorMsg = ref('')
const aiOutput = ref('')
const result = ref<ResumeHealthCheckResult | null>(null)
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

const overallLevel = computed(() =>
  result.value ? getHealthScoreLevel(result.value.overallScore) : 'none',
)

const overallLabel = computed(() =>
  result.value ? getHealthScoreLabel(result.value.overallScore) : '',
)

const sortedIssues = computed(() => {
  if (!result.value) return []
  const order = { high: 0, medium: 1, low: 2 }
  return [...result.value.issues].sort((a, b) => order[a.severity] - order[b.severity])
})

function moduleLevel(score: number): string {
  return getHealthScoreLevel(score)
}

function resetState() {
  result.value = null
  errorMsg.value = ''
  aiOutput.value = ''
}

async function handleRun() {
  if (isLoading.value) return
  if (!hasResumeContent.value) {
    errorMsg.value = '请先填写一些简历内容，再做体检。'
    return
  }
  if (!aiConfig.isConfigured) {
    errorMsg.value = '请先在 AI 设置里配置模型与密钥。'
    return
  }

  isLoading.value = true
  errorMsg.value = ''
  result.value = null
  aiOutput.value = ''
  abortController = new AbortController()

  await runResumeHealthCheck(
    resumeSnapshot.value,
    {
      onChunk(text) {
        aiOutput.value = text
      },
      onDone(report) {
        result.value = report
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

function handleDiscard() {
  handleCancel()
  isExpanded.value = false
  resetState()
}
</script>

<template>
  <div class="health-check">
    <button
      v-if="!isExpanded"
      class="trigger-btn"
      type="button"
      @click="isExpanded = true"
    >
      <span class="trigger-icon">检</span>
      AI 简历体检
    </button>

    <div v-else class="health-panel">
      <div class="health-header">
        <div>
          <h3 class="health-title">AI 简历体检</h3>
          <p class="health-desc">从 HR 视角扫描整份简历，找出影响通过率的问题并给出改进建议。</p>
        </div>
        <button class="close-btn" type="button" @click="handleDiscard">×</button>
      </div>

      <div class="health-actions">
        <button
          v-if="!isLoading"
          class="run-btn"
          type="button"
          :disabled="!hasResumeContent"
          @click="handleRun"
        >
          开始体检
        </button>
        <button v-else class="cancel-btn" type="button" @click="handleCancel">取消体检</button>
        <span class="hint-text">
          {{ hasResumeContent ? '会读取当前简历全部内容。' : '当前简历内容还比较空。' }}
        </span>
      </div>

      <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>

      <div v-if="isLoading && aiOutput" class="preview-card">
        <div class="preview-label">AI 生成中...</div>
        <pre class="preview-content">{{ aiOutput }}</pre>
      </div>

      <div v-if="result" class="result-card">
        <div class="score-row">
          <div class="score-block" :class="`level-${overallLevel}`">
            <div class="score-value">{{ result.overallScore }}</div>
            <div class="score-unit">/ 100</div>
          </div>
          <div class="score-meta">
            <div class="score-label" :class="`level-${overallLevel}`">{{ overallLabel }}</div>
            <p class="score-summary">{{ result.summary }}</p>
          </div>
        </div>

        <div v-if="result.moduleScores.length" class="section">
          <div class="section-title">模块评分</div>
          <div class="module-list">
            <div
              v-for="item in result.moduleScores"
              :key="`module-${item.module}`"
              class="module-item"
            >
              <div class="module-head">
                <span class="module-name">{{ getHealthModuleLabel(item.module) }}</span>
                <span class="module-score" :class="`level-${moduleLevel(item.score)}`">{{ item.score }}</span>
              </div>
              <p v-if="item.advice" class="module-advice">{{ item.advice }}</p>
            </div>
          </div>
        </div>

        <div v-if="sortedIssues.length" class="section">
          <div class="section-title issue">问题清单</div>
          <div class="issue-list">
            <div
              v-for="(item, index) in sortedIssues"
              :key="`issue-${index}`"
              class="issue-item"
              :class="`severity-${item.severity}`"
            >
              <div class="issue-head">
                <span class="severity-tag" :class="`severity-${item.severity}`">
                  {{ item.severity === 'high' ? '高' : item.severity === 'medium' ? '中' : '低' }}
                </span>
                <span class="issue-module">{{ getHealthModuleLabel(item.module) }}</span>
              </div>
              <p class="issue-problem">{{ item.problem }}</p>
              <p class="issue-suggestion">建议：{{ item.suggestion }}</p>
            </div>
          </div>
        </div>

        <div v-if="result.highlights.length" class="section">
          <div class="section-title highlight">简历亮点</div>
          <div class="highlight-list">
            <div
              v-for="(item, index) in result.highlights"
              :key="`highlight-${index}`"
              class="highlight-item"
            >
              <p class="highlight-content">{{ item.content }}</p>
              <p class="highlight-reason">{{ item.reason }}</p>
            </div>
          </div>
        </div>

        <div class="confirm-row">
          <button class="regenerate-btn" type="button" @click="handleRun">重新体检</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.health-check {
  display: flex;
}

.trigger-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid #f0c7b0;
  border-radius: 8px;
  background: #fff;
  color: #9a4f2f;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.trigger-btn:hover {
  border-color: #d97745;
  box-shadow: 0 6px 16px rgba(217, 119, 69, 0.08);
}

.trigger-icon {
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

.health-panel {
  flex: 1;
  border: 1px solid #e8e0d5;
  border-radius: 10px;
  background: #fff;
  padding: 14px;
}

.health-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.health-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #2d2521;
}

.health-desc {
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
  flex-shrink: 0;
}

.health-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.run-btn,
.cancel-btn,
.regenerate-btn {
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  padding: 9px 14px;
  cursor: pointer;
}

.run-btn {
  background: #d97745;
  color: #fff;
}

.cancel-btn,
.regenerate-btn {
  background: #f4eee8;
  color: #6a5748;
}

.run-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hint-text {
  font-size: 12px;
  color: #8a7461;
}

.error-msg {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid #f0d2c8;
  border-radius: 8px;
  background: #fff1ec;
  color: #b74a30;
  font-size: 12px;
  line-height: 1.5;
}

.preview-card {
  margin-top: 12px;
  border: 1px solid #eadfd2;
  border-radius: 10px;
  background: #faf8f5;
  padding: 12px;
}

.preview-label {
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
  margin-top: 12px;
  border: 1px solid #eadfd2;
  border-radius: 10px;
  background: #faf8f5;
  padding: 12px;
}

.score-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #eadfd2;
}

.score-block {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding: 6px 14px;
  border-radius: 8px;
  min-width: 96px;
  justify-content: center;
}

.score-value {
  font-size: 32px;
  font-weight: 700;
  line-height: 1;
}

.score-unit {
  font-size: 12px;
  color: #8a7258;
}

.score-block.level-excellent,
.score-block.level-good {
  background: #eef8f1;
  color: #2b7a45;
}

.score-block.level-fair {
  background: #fff7e6;
  color: #b27d12;
}

.score-block.level-weak,
.score-block.level-poor {
  background: #fff1ec;
  color: #b74a30;
}

.score-meta {
  flex: 1;
  min-width: 0;
}

.score-label {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 4px;
}

.score-label.level-excellent,
.score-label.level-good {
  color: #2b7a45;
}

.score-label.level-fair {
  color: #b27d12;
}

.score-label.level-weak,
.score-label.level-poor {
  color: #b74a30;
}

.score-summary {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: #40362d;
}

.section {
  margin-top: 14px;
}

.section-title {
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 8px;
  padding-left: 8px;
  border-left: 3px solid #d97745;
  color: #5f5448;
}

.section-title.issue {
  border-color: #b74a30;
  color: #b74a30;
}

.section-title.highlight {
  border-color: #2b7a45;
  color: #2b7a45;
}

.module-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}

.module-item {
  border: 1px solid #eadfd2;
  border-radius: 8px;
  background: #fff;
  padding: 8px 10px;
}

.module-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.module-name {
  font-size: 12px;
  font-weight: 600;
  color: #2d2521;
}

.module-score {
  font-size: 14px;
  font-weight: 700;
}

.module-score.level-excellent,
.module-score.level-good {
  color: #2b7a45;
}

.module-score.level-fair {
  color: #b27d12;
}

.module-score.level-weak,
.module-score.level-poor {
  color: #b74a30;
}

.module-advice {
  margin: 4px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: #6a5748;
}

.issue-list {
  display: grid;
  gap: 8px;
}

.issue-item {
  border: 1px solid #eadfd2;
  border-radius: 8px;
  background: #fff;
  padding: 10px 12px;
}

.issue-item.severity-high {
  border-color: #f0d2c8;
  background: #fff5f1;
}

.issue-item.severity-medium {
  border-color: #f0e0c8;
  background: #fffaef;
}

.issue-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.severity-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
}

.severity-tag.severity-high {
  background: #b74a30;
}

.severity-tag.severity-medium {
  background: #b27d12;
}

.severity-tag.severity-low {
  background: #8a7461;
}

.issue-module {
  font-size: 11px;
  font-weight: 600;
  color: #7b6a5b;
}

.issue-problem {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: #2d2521;
  font-weight: 500;
}

.issue-suggestion {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: #6a5748;
}

.highlight-list {
  display: grid;
  gap: 8px;
}

.highlight-item {
  border: 1px solid #c8e6cf;
  border-radius: 8px;
  background: #f5fbf7;
  padding: 10px 12px;
}

.highlight-content {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: #2d2521;
  font-weight: 500;
}

.highlight-reason {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: #2b7a45;
}

.confirm-row {
  margin-top: 12px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
