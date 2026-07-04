<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAiConfigStore } from '@/stores/aiConfig'
import { useJdProfileStore } from '@/stores/jdProfile'
import { useResumeStore } from '@/stores/resume'
import {
  analyzeJdMatch,
  type JdMatchResult,
} from '@/services/jdMatchService'

const jdStore = useJdProfileStore()
const resumeStore = useResumeStore()
const aiConfig = useAiConfigStore()

const isExpanded = ref(false)
const isLoading = ref(false)
const errorMsg = ref('')
const aiOutput = ref('')
const result = ref<JdMatchResult | null>(null)
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

const scoreLevel = computed(() => {
  if (!result.value) return 'none'
  const score = result.value.overallScore
  if (score >= 90) return 'excellent'
  if (score >= 75) return 'good'
  if (score >= 60) return 'fair'
  if (score >= 40) return 'weak'
  return 'poor'
})

const scoreLabel = computed(() => {
  switch (scoreLevel.value) {
    case 'excellent':
      return '几乎完美匹配'
    case 'good':
      return '较好匹配'
    case 'fair':
      return '基本匹配'
    case 'weak':
      return '匹配较弱'
    case 'poor':
      return '严重不匹配'
    default:
      return ''
  }
})

function resetState() {
  result.value = null
  errorMsg.value = ''
  aiOutput.value = ''
}

async function handleAnalyze() {
  if (isLoading.value || !jdStore.activeProfile) return
  if (!activeProfileReady.value) {
    errorMsg.value = '请先选择一个 JD，并补充 JD 名称或原文。'
    return
  }
  if (!hasResumeContent.value) {
    errorMsg.value = '请先填写一些简历内容，再做匹配度评分。'
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

  await analyzeJdMatch(
    {
      jdName: jdStore.activeProfile.name,
      jdText: jdStore.activeProfile.rawText,
      resumeSnapshot: resumeSnapshot.value,
    },
    {
      onChunk(text) {
        aiOutput.value = text
      },
      onDone(matched) {
        result.value = matched
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
  <div class="jd-match-scorer">
    <button
      v-if="!isExpanded"
      class="scorer-btn"
      :disabled="!jdStore.activeProfileId"
      @click="isExpanded = true"
    >
      <span class="scorer-icon">分</span>
      简历-JD 匹配度评分
    </button>

    <div v-else class="scorer-panel">
      <div class="scorer-header">
        <div>
          <h3 class="scorer-title">简历-JD 匹配度评分</h3>
          <p class="scorer-desc">基于当前简历和选中的 JD，给出匹配度分数、优势项、缺失项和改进建议。</p>
        </div>
        <button class="close-btn" @click="handleDiscard">×</button>
      </div>

      <div class="scorer-actions">
        <button
          v-if="!isLoading"
          class="generate-btn"
          :disabled="!jdStore.activeProfileId || !hasResumeContent"
          @click="handleAnalyze"
        >
          开始评分
        </button>
        <button v-else class="cancel-btn" @click="handleCancel">取消评分</button>
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

      <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>

      <div v-if="isLoading && aiOutput" class="preview-card">
        <div class="preview-label">AI 生成中...</div>
        <pre class="preview-content">{{ aiOutput }}</pre>
      </div>

      <div v-if="result" class="result-card">
        <div class="score-row">
          <div class="score-block" :class="`level-${scoreLevel}`">
            <div class="score-value">{{ result.overallScore }}</div>
            <div class="score-unit">/ 100</div>
          </div>
          <div class="score-meta">
            <div class="score-label" :class="`level-${scoreLevel}`">{{ scoreLabel }}</div>
            <p class="score-summary">{{ result.summary }}</p>
          </div>
        </div>

        <div v-if="result.strongAreas.length" class="section">
          <div class="section-title strong">优势项</div>
          <div class="section-list">
            <div
              v-for="(item, index) in result.strongAreas"
              :key="`strong-${index}`"
              class="section-item strong"
            >
              <div class="item-head">{{ item.area }}</div>
              <p class="item-body">{{ item.evidence }}</p>
            </div>
          </div>
        </div>

        <div v-if="result.matchedKeywords.length" class="section">
          <div class="section-title matched">已覆盖关键词</div>
          <div class="keyword-list">
            <div
              v-for="(item, index) in result.matchedKeywords"
              :key="`matched-${index}`"
              class="keyword-item matched"
            >
              <div class="keyword-name">{{ item.keyword }}</div>
              <p class="keyword-evidence">{{ item.evidence }}</p>
            </div>
          </div>
        </div>

        <div v-if="result.missingKeywords.length" class="section">
          <div class="section-title missing">缺失关键词</div>
          <div class="keyword-list">
            <div
              v-for="(item, index) in result.missingKeywords"
              :key="`missing-${index}`"
              class="keyword-item missing"
            >
              <div class="keyword-name">{{ item.keyword }}</div>
              <p class="keyword-evidence">{{ item.suggestion }}</p>
            </div>
          </div>
        </div>

        <div v-if="result.weakAreas.length" class="section">
          <div class="section-title weak">匹配缺口与建议</div>
          <div class="section-list">
            <div
              v-for="(item, index) in result.weakAreas"
              :key="`weak-${index}`"
              class="section-item weak"
            >
              <div class="item-head">{{ item.area }}</div>
              <p class="item-body reason">{{ item.reason }}</p>
              <p class="item-body advice">建议：{{ item.advice }}</p>
            </div>
          </div>
        </div>

        <div class="confirm-row">
          <button class="regenerate-btn" @click="handleAnalyze">重新评分</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.jd-match-scorer {
  padding: 0 14px 12px;
  border-bottom: 1px solid #e8e0d5;
  background: #faf8f5;
}

.scorer-btn {
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

.scorer-btn:hover:not(:disabled) {
  border-color: #d97745;
  box-shadow: 0 6px 16px rgba(217, 119, 69, 0.08);
}

.scorer-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.scorer-icon {
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

.scorer-panel {
  border: 1px solid #e8e0d5;
  border-radius: 10px;
  background: #fff;
  padding: 14px;
}

.scorer-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.scorer-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #2d2521;
}

.scorer-desc {
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

.scorer-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.generate-btn,
.cancel-btn,
.regenerate-btn {
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  padding: 9px 14px;
  cursor: pointer;
}

.generate-btn {
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
  border-left: 3px solid transparent;
}

.section-title.strong {
  color: #2b7a45;
  border-color: #2b7a45;
}

.section-title.matched {
  color: #2b7a45;
  border-color: #2b7a45;
}

.section-title.missing {
  color: #b74a30;
  border-color: #b74a30;
}

.section-title.weak {
  color: #b27d12;
  border-color: #b27d12;
}

.section-list {
  display: grid;
  gap: 8px;
}

.section-item {
  border: 1px solid #eadfd2;
  border-radius: 8px;
  background: #fff;
  padding: 10px 12px;
}

.section-item.strong {
  border-color: #c8e6cf;
  background: #f5fbf7;
}

.section-item.weak {
  border-color: #f0e0c8;
  background: #fffaef;
}

.item-head {
  font-size: 13px;
  font-weight: 600;
  color: #2d2521;
}

.item-body {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: #40362d;
}

.item-body.reason {
  color: #7b6a5b;
}

.item-body.advice {
  color: #6a5748;
  margin-top: 4px;
}

.keyword-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}

.keyword-item {
  border: 1px solid #eadfd2;
  border-radius: 8px;
  background: #fff;
  padding: 8px 10px;
}

.keyword-item.matched {
  border-color: #c8e6cf;
  background: #f5fbf7;
}

.keyword-item.missing {
  border-color: #f0d2c8;
  background: #fff5f1;
}

.keyword-name {
  font-size: 12px;
  font-weight: 700;
  color: #2d2521;
}

.keyword-evidence {
  margin: 4px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: #6a5748;
}

.confirm-row {
  margin-top: 12px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
