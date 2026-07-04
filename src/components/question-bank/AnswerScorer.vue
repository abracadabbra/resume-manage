<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAiConfigStore } from '@/stores/aiConfig'
import { useQuestionBankStore } from '@/stores/questionBank'
import {
  scoreInterviewAnswer,
  getAnswerScoreLevel,
  type AnswerScoreResult,
} from '@/services/answerScoreService'

const aiConfig = useAiConfigStore()
const questionBankStore = useQuestionBankStore()

const isExpanded = ref(false)
const isLoading = ref(false)
const errorMsg = ref('')
const successMsg = ref('')
const aiOutput = ref('')
const result = ref<AnswerScoreResult | null>(null)
let abortController: AbortController | null = null

const questionInput = ref('')
const answerInput = ref('')

const currentQuestionTitle = computed(() => {
  const q = questionBankStore.selectedQuestionId
    ? questionBankStore.questions.find((item) => item.id === questionBankStore.selectedQuestionId)
    : null
  return q?.title ?? ''
})

function handleUseCurrentQuestion() {
  if (!currentQuestionTitle.value) return
  questionInput.value = currentQuestionTitle.value
}

function resetState() {
  result.value = null
  errorMsg.value = ''
  successMsg.value = ''
  aiOutput.value = ''
}

async function handleScore() {
  if (isLoading.value) return
  if (!questionInput.value.trim()) {
    errorMsg.value = '请输入要评分的面试题目。'
    return
  }
  if (!answerInput.value.trim()) {
    errorMsg.value = '请输入你的回答。'
    return
  }
  if (!aiConfig.isConfigured) {
    errorMsg.value = '请先在 AI 设置里配置模型与密钥。'
    return
  }

  isLoading.value = true
  errorMsg.value = ''
  successMsg.value = ''
  result.value = null
  aiOutput.value = ''
  abortController = new AbortController()

  await scoreInterviewAnswer(
    {
      question: questionInput.value,
      answer: answerInput.value,
    },
    {
      onChunk(text) {
        aiOutput.value = text
      },
      onDone(scored) {
        result.value = scored
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
  abortController?.abort()
  abortController = null
  isLoading.value = false
  isExpanded.value = false
  resetState()
}

function handleReset() {
  resetState()
  questionInput.value = ''
  answerInput.value = ''
}

const overallLevel = computed(() =>
  result.value ? getAnswerScoreLevel(result.value.overallScore) : 'none',
)
</script>

<template>
  <div class="answer-scorer">
    <button
      v-if="!isExpanded"
      class="trigger-btn"
      type="button"
      @click="isExpanded = true"
    >
      <span class="trigger-icon">评</span>
      AI 答题评分
    </button>

    <div v-else class="scorer-panel">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">AI 答题评分</h3>
          <p class="panel-desc">输入面试题目和你的回答，AI 按 5 个维度打分并给出改进建议。</p>
        </div>
        <button class="close-btn" type="button" @click="handleDiscard">×</button>
      </div>

      <div class="input-area">
        <div class="field">
          <div class="field-head">
            <label class="field-label">面试题目</label>
            <button
              v-if="currentQuestionTitle && !questionInput"
              class="fill-btn"
              type="button"
              @click="handleUseCurrentQuestion"
            >
              使用当前选中题
            </button>
          </div>
          <textarea
            v-model="questionInput"
            class="field-input"
            rows="3"
            placeholder="例如：请介绍你在项目中如何使用 Redis 解决缓存穿透问题。"
          />
        </div>

        <div class="field">
          <label class="field-label">你的回答</label>
          <textarea
            v-model="answerInput"
            class="field-input"
            rows="8"
            placeholder="在这里写下你的回答，越详细评分越准确。支持纯文本。"
          />
        </div>

        <div class="actions">
          <button v-if="!isLoading" class="run-btn" type="button" @click="handleScore">
            开始评分
          </button>
          <button v-else class="cancel-btn" type="button" @click="handleCancel">取消评分</button>
          <button class="reset-btn" type="button" @click="handleReset">清空</button>
        </div>
      </div>

      <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>
      <div v-if="successMsg" class="success-msg">{{ successMsg }}</div>

      <div v-if="isLoading && aiOutput" class="preview-card">
        <div class="preview-label">AI 评分中...</div>
        <pre class="preview-content">{{ aiOutput }}</pre>
      </div>

      <div v-if="result" class="result-card">
        <div class="score-row">
          <div class="score-block" :class="`level-${overallLevel}`">
            <div class="score-value">{{ result.overallScore }}</div>
            <div class="score-unit">/ 100</div>
          </div>
          <div class="score-meta">
            <div class="score-level" :class="`level-${overallLevel}`">{{ result.level }}</div>
            <p class="score-summary">{{ result.summary }}</p>
          </div>
        </div>

        <div class="dimensions">
          <div
            v-for="(dim, idx) in result.dimensions"
            :key="`dim-${idx}`"
            class="dim-item"
          >
            <div class="dim-head">
              <span class="dim-name">{{ dim.name }}</span>
              <span class="dim-score">{{ dim.score }} / 20</span>
            </div>
            <div class="dim-bar">
              <div class="dim-bar-fill" :style="{ width: `${(dim.score / 20) * 100}%` }" />
            </div>
            <p class="dim-comment">{{ dim.comment }}</p>
          </div>
        </div>

        <div v-if="result.strengths.length" class="block block-strength">
          <div class="block-label">回答亮点</div>
          <ul class="block-list">
            <li v-for="(item, idx) in result.strengths" :key="`s-${idx}`">{{ item }}</li>
          </ul>
        </div>

        <div v-if="result.weaknesses.length" class="block block-weakness">
          <div class="block-label">待改进</div>
          <ul class="block-list">
            <li v-for="(item, idx) in result.weaknesses" :key="`w-${idx}`">{{ item }}</li>
          </ul>
        </div>

        <div v-if="result.improvedAnswer" class="block block-improved">
          <div class="block-label">参考答案（基于你的回答优化）</div>
          <pre class="improved-answer">{{ result.improvedAnswer }}</pre>
        </div>

        <div class="confirm-row">
          <button class="regenerate-btn" type="button" @click="handleScore">重新评分</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.answer-scorer {
  flex: 1;
  display: flex;
  min-width: 0;
}

.trigger-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid #ddcfbf;
  border-radius: 8px;
  background: #fff;
  color: #2d2521;
  font-size: 13px;
  font-weight: 600;
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
  color: #d97745;
  font-size: 11px;
  font-weight: 700;
}

.scorer-panel {
  flex: 1;
  border: 1px solid #e8e0d5;
  border-radius: 10px;
  background: #fff;
  padding: 14px;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.panel-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #2d2521;
}

.panel-desc {
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

.input-area {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: #6a5748;
}

.fill-btn {
  border: 1px solid #ddcfbf;
  border-radius: 4px;
  background: #faf8f5;
  color: #7b6a5b;
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
}

.fill-btn:hover {
  border-color: #d97745;
  color: #d97745;
}

.field-input {
  width: 100%;
  border: 1px solid #e1d7ca;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.55;
  color: #2d2521;
  background: #faf8f5;
  resize: vertical;
  font-family: inherit;
  box-sizing: border-box;
}

.field-input:focus {
  outline: none;
  border-color: #d97745;
  background: #fff;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.run-btn,
.cancel-btn,
.reset-btn,
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

.cancel-btn {
  background: #f4eee8;
  color: #6a5748;
}

.reset-btn {
  background: transparent;
  color: #8a7461;
  border: 1px solid #e1d7ca;
}

.regenerate-btn {
  background: #f4eee8;
  color: #6a5748;
}

.error-msg,
.success-msg {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.error-msg {
  border: 1px solid #f0d2c8;
  background: #fff1ec;
  color: #b74a30;
}

.success-msg {
  border: 1px solid #c8e6cf;
  background: #eef8f1;
  color: #2b7a45;
}

.preview-card,
.result-card {
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

.score-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #eadfd2;
}

.score-block {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding: 8px 16px;
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

.score-level {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 4px;
}

.score-level.level-excellent,
.score-level.level-good {
  color: #2b7a45;
}

.score-level.level-fair {
  color: #b27d12;
}

.score-level.level-weak,
.score-level.level-poor {
  color: #b74a30;
}

.score-summary {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: #40362d;
}

.dimensions {
  margin-top: 14px;
  display: grid;
  gap: 8px;
}

.dim-item {
  border: 1px solid #eadfd2;
  border-radius: 8px;
  background: #fff;
  padding: 10px 12px;
}

.dim-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.dim-name {
  font-size: 12px;
  font-weight: 600;
  color: #2d2521;
}

.dim-score {
  font-size: 11px;
  font-weight: 700;
  color: #6a5748;
}

.dim-bar {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: #f2ece6;
  overflow: hidden;
  margin-bottom: 6px;
}

.dim-bar-fill {
  height: 100%;
  background: #d97745;
  border-radius: 2px;
  transition: width 0.3s;
}

.dim-comment {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: #6a5748;
}

.block {
  margin-top: 14px;
  border-radius: 8px;
  padding: 10px 12px;
  border: 1px solid #eadfd2;
  background: #fff;
}

.block-strength {
  border-color: #c8e6cf;
  background: #eef8f1;
}

.block-weakness {
  border-color: #f0d2c8;
  background: #fff1ec;
}

.block-improved {
  border-color: #e1d7ca;
  background: #faf8f5;
}

.block-label {
  font-size: 12px;
  font-weight: 700;
  color: #2d2521;
  margin-bottom: 8px;
}

.block-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.6;
  color: #40362d;
}

.block-strength .block-list {
  color: #2b7a45;
}

.block-weakness .block-list {
  color: #b74a30;
}

.improved-answer {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.6;
  color: #40362d;
  font-family: inherit;
}

.confirm-row {
  margin-top: 14px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
