<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAiConfigStore } from '@/stores/aiConfig'
import {
  useQuestionBankStore,
  type PracticeMastery,
} from '@/stores/questionBank'
import {
  buildFallbackFollowUpDrillPlan,
  generateFollowUpDrillPlan,
  type FollowUpDrillPlan,
} from '@/services/questionFollowUpDrillService'
import { reviewQuestionAnswer } from '@/services/questionAnswerReviewService'

const store = useQuestionBankStore()
const aiConfig = useAiConfigStore()

const difficultyLabel: Record<string, string> = {
  basic: '基础',
  intermediate: '中等',
  advanced: '高级',
}

const masteryOptions: { value: PracticeMastery; label: string }[] = [
  { value: 'unpracticed', label: '未练' },
  { value: 'practicing', label: '练过' },
  { value: 'mastered', label: '熟练' },
  { value: 'weak', label: '薄弱' },
]

const masteryMeta: Record<PracticeMastery, { label: string; className: string }> = {
  unpracticed: { label: '未练', className: 'mastery-unpracticed' },
  practicing: { label: '练过', className: 'mastery-practicing' },
  mastered: { label: '熟练', className: 'mastery-mastered' },
  weak: { label: '薄弱', className: 'mastery-weak' },
}

const isReviewing = ref(false)
const reviewError = ref('')
const reviewRawOutput = ref('')
let reviewAbortController: AbortController | null = null

const isGeneratingDrill = ref(false)
const drillError = ref('')
const drillRawOutput = ref('')
const drillPlan = ref<FollowUpDrillPlan | null>(null)
const drillRoundIndex = ref(0)
const drillAnswers = ref<string[]>([])
let drillAbortController: AbortController | null = null

const currentPracticeRecord = computed(() => {
  if (!store.selectedQuestionId) {
    return {
      answer: '',
      notes: '',
      mastery: 'unpracticed' as const,
      updatedAt: null,
      aiReview: null,
    }
  }
  return store.getPracticeRecord(store.selectedQuestionId)
})

const myAnswer = computed({
  get: () => currentPracticeRecord.value.answer,
  set: (value: string) => {
    if (!store.selectedQuestionId) return
    store.upsertPracticeRecord(store.selectedQuestionId, { answer: value })
  },
})

const practiceNotes = computed({
  get: () => currentPracticeRecord.value.notes,
  set: (value: string) => {
    if (!store.selectedQuestionId) return
    store.upsertPracticeRecord(store.selectedQuestionId, { notes: value })
  },
})

const practiceUpdatedText = computed(() => {
  const updatedAt = currentPracticeRecord.value.updatedAt
  if (!updatedAt) return '自动保存在本地'

  const date = new Date(updatedAt)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `已于 ${hh}:${mm} 自动保存`
})

const currentMastery = computed(() => currentPracticeRecord.value.mastery)
const currentReview = computed(() => currentPracticeRecord.value.aiReview)
const canReviewAnswer = computed(
  () => Boolean(store.selectedQuestion && myAnswer.value.trim()) && !isReviewing.value,
)
const canApplyImprovedAnswer = computed(
  () => Boolean(store.selectedQuestionId && currentReview.value?.improvedAnswer.trim()),
)
const fallbackDrillPlan = computed(() =>
  store.selectedQuestion ? buildFallbackFollowUpDrillPlan(store.selectedQuestion) : null,
)
const currentDrillRound = computed(() => drillPlan.value?.rounds[drillRoundIndex.value] ?? null)
const isDrillFinished = computed(() =>
  Boolean(drillPlan.value) && drillRoundIndex.value >= drillPlan.value!.rounds.length,
)
const currentDrillAnswer = computed({
  get: () => drillAnswers.value[drillRoundIndex.value] ?? '',
  set: (value: string) => {
    drillAnswers.value[drillRoundIndex.value] = value
  },
})
const completedDrillRounds = computed(() =>
  drillPlan.value
    ? drillPlan.value.rounds.map((round, index) => ({
        ...round,
        answer: drillAnswers.value[index] ?? '',
      }))
    : [],
)
const canUseFirstDrillAnswer = computed(() =>
  Boolean(completedDrillRounds.value[0]?.answer.trim()),
)
const drillHintText = computed(() => {
  if (drillPlan.value) return ''
  if (aiConfig.isConfigured && fallbackDrillPlan.value) {
    return '可以直接用题库追问开始，也可以让 AI 按你的薄弱点补成完整 3-5 轮。'
  }
  if (aiConfig.isConfigured) {
    return '当前题目的内置追问不够，AI 会自动补成完整 3-5 轮。'
  }
  if (fallbackDrillPlan.value) {
    return '当前题目内置追问足够，可以直接开始本地追问链训练。'
  }
  return '当前题目的内置追问不足 3 轮，配置 AI 后可自动生成完整追问链。'
})

function handleSetMastery(mastery: PracticeMastery) {
  if (!store.selectedQuestionId) return
  store.setPracticeMastery(store.selectedQuestionId, mastery)
}

function cancelReview() {
  reviewAbortController?.abort()
  isReviewing.value = false
}

function applyImprovedAnswer() {
  if (!canApplyImprovedAnswer.value || !currentReview.value) return
  myAnswer.value = currentReview.value.improvedAnswer
}

function resetDrillState() {
  drillAbortController?.abort()
  drillAbortController = null
  isGeneratingDrill.value = false
  drillError.value = ''
  drillRawOutput.value = ''
  drillPlan.value = null
  drillRoundIndex.value = 0
  drillAnswers.value = []
}

function startDrillPlan(plan: FollowUpDrillPlan) {
  drillError.value = ''
  drillRawOutput.value = ''
  drillPlan.value = plan
  drillRoundIndex.value = 0
  drillAnswers.value = Array.from({ length: plan.rounds.length }, () => '')
}

function handleStartFallbackDrill() {
  if (!fallbackDrillPlan.value) {
    drillError.value = '当前题目的内置追问不足 3 轮，请先配置 AI 生成完整追问链。'
    return
  }
  startDrillPlan(fallbackDrillPlan.value)
}

function cancelDrillGeneration() {
  drillAbortController?.abort()
  drillAbortController = null
  isGeneratingDrill.value = false
}

async function handleGenerateAiDrill() {
  if (!store.selectedQuestion) return

  isGeneratingDrill.value = true
  drillError.value = ''
  drillRawOutput.value = ''
  drillAbortController = new AbortController()

  await generateFollowUpDrillPlan(
    {
      question: store.selectedQuestion,
      answerDraft: myAnswer.value,
      notes: practiceNotes.value,
      mastery: currentMastery.value,
      currentReviewSummary: currentReview.value?.summary,
    },
    {
      onChunk(text) {
        drillRawOutput.value = text
      },
      onDone(plan) {
        startDrillPlan(plan)
        isGeneratingDrill.value = false
        drillAbortController = null
      },
      onError(error) {
        drillError.value = error
        isGeneratingDrill.value = false
        drillAbortController = null
      },
    },
    drillAbortController.signal,
  )
}

function handleAdvanceDrill() {
  if (!currentDrillRound.value || !currentDrillAnswer.value.trim()) return
  if (drillPlan.value && drillRoundIndex.value >= drillPlan.value.rounds.length - 1) {
    drillRoundIndex.value = drillPlan.value.rounds.length
    return
  }
  drillRoundIndex.value += 1
}

function handleDrillPrev() {
  if (drillRoundIndex.value <= 0) return
  drillRoundIndex.value -= 1
}

function fillMyAnswerFromDrill() {
  if (!canUseFirstDrillAnswer.value) return
  myAnswer.value = completedDrillRounds.value[0]!.answer.trim()
}

function appendDrillToNotes() {
  if (completedDrillRounds.value.length === 0) return
  const lines = completedDrillRounds.value.map(
    (round, index) => `第${index + 1}轮 追问：${round.question}\n我的回答：${round.answer.trim() || '（未填写）'}`,
  )
  const block = `追问链训练\n${lines.join('\n\n')}`.trim()
  practiceNotes.value = practiceNotes.value.trim() ? `${practiceNotes.value.trim()}\n\n${block}` : block
}

watch(
  () => store.selectedQuestionId,
  () => {
    resetDrillState()
  },
)

async function handleReviewAnswer() {
  if (!store.selectedQuestion || !store.selectedQuestionId || !myAnswer.value.trim()) return

  isReviewing.value = true
  reviewError.value = ''
  reviewRawOutput.value = ''
  reviewAbortController = new AbortController()

  await reviewQuestionAnswer(
    {
      question: store.selectedQuestion,
      answerDraft: myAnswer.value,
      notes: practiceNotes.value,
      mastery: currentMastery.value,
    },
    {
      onChunk(text) {
        reviewRawOutput.value = text
      },
      onDone(result) {
        store.savePracticeAiReview(store.selectedQuestionId!, result)
        isReviewing.value = false
      },
      onError(error) {
        reviewError.value = error
        isReviewing.value = false
      },
    },
    reviewAbortController.signal,
  )
}
</script>

<template>
  <div class="question-detail">
    <template v-if="store.selectedQuestion">
      <div class="detail-header">
        <div class="header-top">
          <span class="question-number">第 {{ store.selectedQuestion.number }} 题</span>
          <span
            class="difficulty-badge"
            :class="'diff-' + store.selectedQuestion.difficulty"
          >
            {{ difficultyLabel[store.selectedQuestion.difficulty] }}
          </span>
        </div>
        <h1 class="question-title">{{ store.selectedQuestion.title }}</h1>
        <div v-if="store.selectedQuestion.labels.length" class="question-labels">
          <span
            v-for="label in store.selectedQuestion.labels"
            :key="label"
            class="label-tag"
          >{{ label }}</span>
        </div>
      </div>

      <div class="detail-content">
        <section class="answer-section">
          <h2 class="section-title">参考答案</h2>
          <div class="answer-content" v-html="store.selectedQuestion.answer.content.replace(/\n/g, '<br>')"></div>
        </section>

        <section class="practice-section">
          <div class="practice-header">
            <div class="practice-title-group">
              <h2 class="section-title">我的回答</h2>
              <div class="mastery-segments" role="tablist" aria-label="掌握状态">
                <button
                  v-for="option in masteryOptions"
                  :key="option.value"
                  type="button"
                  class="mastery-btn"
                  :class="[
                    masteryMeta[option.value].className,
                    { active: currentMastery === option.value },
                  ]"
                  @click="handleSetMastery(option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
            <span class="practice-status">{{ practiceUpdatedText }}</span>
          </div>
          <textarea
            v-model="myAnswer"
            class="practice-textarea"
            placeholder="在这里写你的口头回答提纲、关键词和完整作答版本。"
            rows="7"
          ></textarea>

          <div class="notes-block">
            <div class="notes-title">练习备注</div>
            <textarea
              v-model="practiceNotes"
              class="practice-textarea notes-textarea"
              placeholder="记录薄弱点、卡壳点、想补的知识点。"
              rows="4"
            ></textarea>
          </div>

          <div class="review-toolbar">
            <button
              v-if="!isReviewing"
              class="review-btn"
              :disabled="!canReviewAnswer"
              @click="handleReviewAnswer"
            >
              {{ currentReview ? '重新 AI 点评' : 'AI 点评我的回答' }}
            </button>
            <button v-else class="review-cancel-btn" @click="cancelReview">取消点评</button>
            <span class="review-tip">
              {{ currentReview ? '点评会结合题目、参考答案、追问和你的草稿。' : '先写出你的回答，再让 AI 帮你挑刺。' }}
            </span>
          </div>

          <div v-if="reviewError" class="review-error">{{ reviewError }}</div>

          <div v-if="isReviewing && reviewRawOutput" class="review-stream-card">
            <div class="review-stream-label">AI 点评中...</div>
            <pre class="review-stream-content">{{ reviewRawOutput }}</pre>
          </div>

          <div v-if="currentReview" class="review-card">
            <div class="review-score-grid">
              <div class="score-item score-main">
                <span class="score-label">综合</span>
                <span class="score-value">{{ currentReview.overallScore }}</span>
              </div>
              <div class="score-item">
                <span class="score-label">完整度</span>
                <span class="score-value">{{ currentReview.completenessScore }}</span>
              </div>
              <div class="score-item">
                <span class="score-label">准确性</span>
                <span class="score-value">{{ currentReview.accuracyScore }}</span>
              </div>
              <div class="score-item">
                <span class="score-label">深度</span>
                <span class="score-value">{{ currentReview.depthScore }}</span>
              </div>
              <div class="score-item">
                <span class="score-label">表达</span>
                <span class="score-value">{{ currentReview.deliveryScore }}</span>
              </div>
            </div>

            <div class="review-section">
              <div class="review-section-title">点评结论</div>
              <p class="review-summary">{{ currentReview.summary }}</p>
            </div>

            <div class="review-columns">
              <div class="review-section">
                <div class="review-section-title">答得好的地方</div>
                <ul class="review-list">
                  <li v-for="item in currentReview.strengths" :key="item">{{ item }}</li>
                </ul>
              </div>
              <div class="review-section">
                <div class="review-section-title">要补的地方</div>
                <ul class="review-list">
                  <li v-for="item in currentReview.improvements" :key="item">{{ item }}</li>
                </ul>
              </div>
            </div>

            <div class="review-section">
              <div class="review-section-title">优化后回答</div>
              <div class="review-improved-answer">{{ currentReview.improvedAnswer }}</div>
              <div class="review-actions">
                <button
                  type="button"
                  class="apply-improved-btn"
                  :disabled="!canApplyImprovedAnswer"
                  @click="applyImprovedAnswer"
                >
                  一键替换到我的回答
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="drill-section">
          <div class="drill-header">
            <h2 class="section-title">追问链训练</h2>
            <span v-if="drillPlan" class="drill-progress">
              {{ isDrillFinished ? '训练完成' : `第 ${drillRoundIndex + 1} / ${drillPlan.rounds.length} 轮` }}
            </span>
          </div>

          <div v-if="!drillPlan" class="drill-intro-card">
            <div class="drill-action-row">
              <button
                v-if="aiConfig.isConfigured && !isGeneratingDrill"
                type="button"
                class="drill-btn primary"
                @click="handleGenerateAiDrill"
              >
                AI 生成 3-5 轮追问
              </button>
              <button
                v-if="fallbackDrillPlan && !isGeneratingDrill"
                type="button"
                class="drill-btn"
                @click="handleStartFallbackDrill"
              >
                直接用题库追问
              </button>
              <button
                v-if="isGeneratingDrill"
                type="button"
                class="drill-cancel-btn"
                @click="cancelDrillGeneration"
              >
                取消生成
              </button>
            </div>
            <p class="drill-tip">{{ drillHintText }}</p>
            <div v-if="drillError" class="drill-error">{{ drillError }}</div>
            <div v-if="isGeneratingDrill && drillRawOutput" class="drill-stream-card">
              <div class="drill-stream-label">AI 追问链生成中...</div>
              <pre class="drill-stream-content">{{ drillRawOutput }}</pre>
            </div>
          </div>

          <template v-else>
            <div class="drill-summary-card">
              <div class="drill-summary-label">训练重点</div>
              <p class="drill-summary-text">{{ drillPlan.summary }}</p>
            </div>

            <div v-if="!isDrillFinished && currentDrillRound" class="drill-round-card">
              <div class="drill-round-head">
                <span class="drill-round-badge">第 {{ drillRoundIndex + 1 }} 轮</span>
                <span class="drill-focus-tag">{{ currentDrillRound.focus }}</span>
              </div>
              <div class="drill-question">{{ currentDrillRound.question }}</div>
              <textarea
                v-model="currentDrillAnswer"
                class="practice-textarea drill-textarea"
                placeholder="按真实面试状态作答，尽量一口气把思路讲完整。"
                rows="5"
              ></textarea>
              <div class="drill-nav">
                <button
                  type="button"
                  class="drill-nav-btn"
                  :disabled="drillRoundIndex === 0"
                  @click="handleDrillPrev"
                >
                  上一轮
                </button>
                <button
                  type="button"
                  class="drill-nav-btn primary"
                  :disabled="!currentDrillAnswer.trim()"
                  @click="handleAdvanceDrill"
                >
                  {{ drillRoundIndex >= drillPlan.rounds.length - 1 ? '完成训练' : '提交并下一轮' }}
                </button>
              </div>
            </div>

            <div v-else class="drill-result-card">
              <div class="drill-result-head">
                <div>
                  <div class="drill-summary-label">训练回看</div>
                  <p class="drill-summary-text">这次追问链已经走完，下面可以对照你的回答和参考要点复盘。</p>
                </div>
                <div class="drill-result-actions">
                  <button type="button" class="drill-btn" :disabled="!canUseFirstDrillAnswer" @click="fillMyAnswerFromDrill">
                    首轮写入我的回答
                  </button>
                  <button type="button" class="drill-btn" @click="appendDrillToNotes">追加到练习备注</button>
                  <button type="button" class="drill-btn primary" @click="resetDrillState">重新开始</button>
                </div>
              </div>

              <div class="drill-review-list">
                <div
                  v-for="(round, index) in completedDrillRounds"
                  :key="`${index}-${round.question}`"
                  class="drill-review-item"
                >
                  <div class="drill-round-head">
                    <span class="drill-round-badge">第 {{ index + 1 }} 轮</span>
                    <span class="drill-focus-tag">{{ round.focus }}</span>
                  </div>
                  <div class="drill-question">{{ round.question }}</div>
                  <div class="drill-review-block">
                    <div class="drill-review-title">我的回答</div>
                    <div class="drill-review-content">{{ round.answer.trim() || '（未填写）' }}</div>
                  </div>
                  <div class="drill-review-block">
                    <div class="drill-review-title">参考要点</div>
                    <div class="drill-review-content reference">{{ round.referenceAnswer }}</div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </section>

        <section v-if="store.selectedQuestion.answer.followUp.length" class="followup-section">
          <h2 class="section-title">高频追问</h2>
          <div class="followup-list">
            <div
              v-for="(item, idx) in store.selectedQuestion.answer.followUp"
              :key="idx"
              class="followup-item"
            >
              <div class="followup-q">{{ item.question }}</div>
              <div class="followup-a">{{ item.answer }}</div>
            </div>
          </div>
        </section>
      </div>
    </template>

    <div v-else class="empty-state">
      <div class="empty-icon">📚</div>
      <p class="empty-text">选择一道题目开始学习</p>
    </div>
  </div>
</template>

<style scoped>
.question-detail {
  flex: 1;
  overflow-y: auto;
  background: #fff;
}

.detail-header {
  padding: 24px 28px 20px;
  border-bottom: 1px solid #e8e0d5;
  background: linear-gradient(to bottom, #faf8f5, #fff);
}

.header-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.question-number {
  font-size: 12px;
  font-weight: 700;
  color: #d97745;
}

.difficulty-badge {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  font-weight: 600;
}

.diff-basic {
  background: #e8f5e9;
  color: #2e7d32;
}

.diff-intermediate {
  background: #fff8e1;
  color: #f57f17;
}

.diff-advanced {
  background: #fce4ec;
  color: #c62828;
}

.question-title {
  font-size: 18px;
  font-weight: 700;
  color: #2d2521;
  margin: 0 0 12px;
  line-height: 1.4;
}

.question-labels {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.label-tag {
  font-size: 11px;
  padding: 3px 8px;
  background: #efe7dc;
  color: #7b6a5b;
  border-radius: 4px;
}

.detail-content {
  padding: 24px 28px;
}

.answer-section,
.practice-section,
.followup-section {
  margin-bottom: 28px;
}

.section-title {
  font-size: 14px;
  font-weight: 700;
  color: #2d2521;
  margin: 0 0 14px;
  padding-bottom: 8px;
  border-bottom: 2px solid #d97745;
  display: inline-block;
}

.practice-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.practice-title-group {
  min-width: 0;
}

.answer-content {
  font-size: 14px;
  line-height: 1.8;
  color: #3a3028;
  white-space: pre-wrap;
}

.practice-status {
  font-size: 12px;
  color: #8a7461;
  flex-shrink: 0;
}

.mastery-segments {
  display: inline-grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-top: 10px;
}

.mastery-btn {
  min-width: 54px;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: #f7f3ef;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
}

.mastery-btn.active {
  border-color: currentColor;
  box-shadow: 0 2px 8px rgba(45, 37, 33, 0.08);
}

.mastery-unpracticed {
  color: #7b6a5b;
}

.mastery-practicing {
  color: #c26d14;
}

.mastery-mastered {
  color: #138a4a;
}

.mastery-weak {
  color: #c43d3d;
}

.practice-textarea {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid #e0d2c1;
  border-radius: 8px;
  background: #fffdfb;
  color: #2d2521;
  font-size: 13px;
  line-height: 1.7;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
}

.practice-textarea:focus {
  border-color: #d97745;
  box-shadow: 0 0 0 3px rgba(217, 119, 69, 0.08);
}

.notes-block {
  margin-top: 12px;
}

.notes-title {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 700;
  color: #6b5a4b;
}

.notes-textarea {
  min-height: 108px;
}

.review-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.review-btn,
.review-cancel-btn {
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.review-btn {
  border: none;
  background: #4631ad;
  color: #fff;
}

.review-btn:hover:not(:disabled) {
  background: #37238f;
}

.review-btn:disabled {
  background: #d8d1ee;
  cursor: not-allowed;
}

.review-cancel-btn {
  border: 1px solid #ddd2f8;
  background: #fff;
  color: #5b40c6;
}

.review-tip {
  font-size: 12px;
  color: #8a7461;
}

.review-error {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fff5f5;
  color: #dc2626;
  font-size: 12px;
}

.review-stream-card,
.review-card {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid #e6ddf8;
  border-radius: 10px;
  background: #faf9ff;
}

.review-stream-label,
.review-section-title {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 700;
  color: #5b40c6;
}

.review-stream-content {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.6;
  color: #3a3028;
  font-family: inherit;
}

.review-score-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 14px;
}

.score-item {
  padding: 10px 8px;
  border-radius: 8px;
  background: #fff;
  text-align: center;
}

.score-main {
  background: #f2eeff;
}

.score-label {
  display: block;
  margin-bottom: 4px;
  font-size: 11px;
  color: #7b6a5b;
}

.score-value {
  font-size: 18px;
  font-weight: 700;
  color: #2d2521;
}

.review-summary {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: #2d2521;
}

.review-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 14px;
}

.review-list {
  margin: 0;
  padding-left: 18px;
  color: #3a3028;
  font-size: 13px;
  line-height: 1.7;
}

.review-improved-answer {
  padding: 12px;
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
  line-height: 1.8;
  color: #2d2521;
  white-space: pre-wrap;
}

.review-actions {
  margin-top: 10px;
}

.apply-improved-btn {
  padding: 8px 14px;
  border: 1px solid #ddd2f8;
  border-radius: 8px;
  background: #fff;
  color: #5b40c6;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.apply-improved-btn:hover:not(:disabled) {
  background: #f5f2ff;
}

.apply-improved-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.drill-section {
  margin-bottom: 28px;
}

.drill-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.drill-progress {
  font-size: 12px;
  font-weight: 600;
  color: #4f46a5;
}

.drill-intro-card,
.drill-summary-card,
.drill-round-card,
.drill-result-card,
.drill-stream-card {
  padding: 14px;
  border: 1px solid #dbe3f7;
  border-radius: 10px;
  background: #f8fbff;
}

.drill-action-row,
.drill-nav,
.drill-result-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.drill-btn,
.drill-cancel-btn,
.drill-nav-btn {
  min-height: 34px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.drill-btn,
.drill-nav-btn,
.drill-cancel-btn {
  border: 1px solid #c8d5f6;
  background: #fff;
  color: #37558f;
}

.drill-btn.primary,
.drill-nav-btn.primary {
  border-color: transparent;
  background: #37558f;
  color: #fff;
}

.drill-tip {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #6b7280;
}

.drill-error {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fff5f5;
  color: #dc2626;
  font-size: 12px;
}

.drill-stream-card {
  margin-top: 12px;
}

.drill-stream-label,
.drill-summary-label,
.drill-review-title {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 700;
  color: #37558f;
}

.drill-stream-content {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.6;
  color: #3a3028;
  font-family: inherit;
}

.drill-summary-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: #2d2521;
}

.drill-round-head,
.drill-result-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.drill-round-badge,
.drill-focus-tag,
.drill-tag {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.drill-round-badge {
  background: #e7efff;
  color: #37558f;
}

.drill-focus-tag {
  background: #edf5ea;
  color: #447d47;
}

.drill-question {
  margin-top: 12px;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.7;
  color: #2d2521;
}

.drill-textarea {
  margin-top: 12px;
}

.drill-nav {
  margin-top: 12px;
  justify-content: flex-end;
}

.drill-review-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 14px;
}

.drill-review-item {
  padding: 12px;
  border: 1px solid #dbe3f7;
  border-radius: 10px;
  background: #fff;
}

.drill-review-block {
  margin-top: 12px;
}

.drill-review-content {
  font-size: 13px;
  line-height: 1.7;
  color: #3a3028;
  white-space: pre-wrap;
}

.drill-review-content.reference {
  color: #4b5563;
}

.followup-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.followup-item {
  background: #faf5ef;
  border-left: 3px solid #d97745;
  border-radius: 0 6px 6px 0;
  padding: 12px 14px;
}

.followup-q {
  font-size: 13px;
  color: #2d2521;
  font-weight: 600;
  margin-bottom: 8px;
}

.followup-a {
  font-size: 12px;
  color: #5a4a3a;
  line-height: 1.6;
  white-space: pre-wrap;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #8a7461;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 14px;
  margin: 0;
}

@media (max-width: 980px) {
  .practice-header,
  .drill-header,
  .drill-result-head,
  .drill-round-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .review-columns {
    grid-template-columns: 1fr;
  }

  .review-score-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
