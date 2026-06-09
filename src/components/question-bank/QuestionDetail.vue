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
import QuestionDrillPanel from './QuestionDrillPanel.vue'
import QuestionFollowUpList from './QuestionFollowUpList.vue'
import QuestionHeader from './QuestionHeader.vue'
import QuestionPracticePanel from './QuestionPracticePanel.vue'
import QuestionReferenceAnswer from './QuestionReferenceAnswer.vue'

const store = useQuestionBankStore()
const aiConfig = useAiConfigStore()

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
      <QuestionHeader :question="store.selectedQuestion" />

      <div class="detail-content">
        <QuestionReferenceAnswer :answer-content="store.selectedQuestion.answer.content" />

        <QuestionPracticePanel
          v-model:answer="myAnswer"
          v-model:notes="practiceNotes"
          :practice-updated-text="practiceUpdatedText"
          :mastery="currentMastery"
          :mastery-options="masteryOptions"
          :mastery-meta="masteryMeta"
          :is-reviewing="isReviewing"
          :can-review-answer="canReviewAnswer"
          :review-error="reviewError"
          :review-raw-output="reviewRawOutput"
          :current-review="currentReview"
          :can-apply-improved-answer="canApplyImprovedAnswer"
          @set-mastery="handleSetMastery"
          @review="handleReviewAnswer"
          @cancel-review="cancelReview"
          @apply-improved-answer="applyImprovedAnswer"
        />

        <QuestionDrillPanel
          v-model:current-drill-answer="currentDrillAnswer"
          :is-ai-configured="aiConfig.isConfigured"
          :is-generating-drill="isGeneratingDrill"
          :drill-error="drillError"
          :drill-raw-output="drillRawOutput"
          :drill-plan="drillPlan"
          :fallback-drill-plan="fallbackDrillPlan"
          :drill-round-index="drillRoundIndex"
          :current-drill-round="currentDrillRound"
          :is-drill-finished="isDrillFinished"
          :completed-drill-rounds="completedDrillRounds"
          :can-use-first-drill-answer="canUseFirstDrillAnswer"
          :drill-hint-text="drillHintText"
          @generate-ai-drill="handleGenerateAiDrill"
          @start-fallback-drill="handleStartFallbackDrill"
          @cancel-drill-generation="cancelDrillGeneration"
          @advance-drill="handleAdvanceDrill"
          @drill-prev="handleDrillPrev"
          @fill-answer-from-drill="fillMyAnswerFromDrill"
          @append-drill-to-notes="appendDrillToNotes"
          @reset-drill="resetDrillState"
        />

        <QuestionFollowUpList :follow-up="store.selectedQuestion.answer.followUp" />
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

.detail-content {
  padding: 24px 28px;
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

</style>
