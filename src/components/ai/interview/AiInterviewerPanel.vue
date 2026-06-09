<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import AiConfigDialog from '@/components/ai/AiConfigDialog.vue'
import InterviewSimulationPanel from '@/components/ai/interview/InterviewSimulationPanel.vue'
import InterviewReviewQuestionPanel from '@/components/ai/interview/InterviewReviewQuestionPanel.vue'
import InterviewTopbar from '@/components/ai/interview/InterviewTopbar.vue'
import ResumePreviewOverlay from '@/components/ai/interview/ResumePreviewOverlay.vue'
import { useInterviewSession } from '@/components/ai/interview/useInterviewSession'
import { useInterviewTimer } from '@/components/ai/interview/useInterviewTimer'
import { useVoiceInput } from '@/components/ai/interview/useVoiceInput'
import {
  buildQuestionSearchText,
  extractTechStacksFromText,
  matchProjectNamesInText,
} from '@/services/questionMetaService'
import {
  generateInterviewReviewQuestions,
  type InterviewReviewQuestionBatch,
} from '@/services/interviewReviewQuestionService'
import { useAiConfigStore } from '@/stores/aiConfig'
import { useQuestionBankStore } from '@/stores/questionBank'
import { useResumeStore } from '@/stores/resume'
import type { InterviewMode, ResumeSnapshot } from '@/services/interviewService'

const resumeStore = useResumeStore()
const aiConfig = useAiConfigStore()
const questionBankStore = useQuestionBankStore()

const showAiConfig = ref(false)
const showResumePreview = ref(false)
const inputText = ref('')
const isReviewQuestionLoading = ref(false)
const reviewQuestionError = ref('')
const reviewQuestionSuccess = ref('')
const reviewQuestionOutput = ref('')
const reviewQuestionResult = ref<InterviewReviewQuestionBatch | null>(null)

const resumeSnapshot = computed<ResumeSnapshot>(() => ({
  basicInfo: resumeStore.basicInfo,
  skillsText: resumeStore.skills,
  workList: resumeStore.workList,
  projectList: resumeStore.projectList,
  educationList: resumeStore.educationList,
  selfIntro: resumeStore.selfIntro,
}))

const resumeProjectNames = computed(() =>
  resumeStore.projectList
    .map((item) => item.name.trim())
    .filter(Boolean),
)

const {
  durationMinutes,
  elapsedSeconds,
  sessionStarted,
  timerRunning,
  remainingSeconds,
  timerText,
  timerStatusText,
  adjustDuration,
  startTimer,
  pauseTimer,
  togglePause,
  resetTimer,
  tick,
} = useInterviewTimer(60)

const {
  mode,
  isLoading,
  errorMsg,
  finalEvaluation,
  messages,
  memorySummary,
  streamingAssistantMessageId,
  assistantTurns,
  userTurns,
  currentRound,
  canSend,
  canStart,
  canFinish,
  appendUserMessage,
  resetInterviewSessionState,
  buildHistory,
  runInterview,
} = useInterviewSession({
  inputText,
  sessionStarted,
  durationMinutes,
  elapsedSeconds,
  resumeSnapshot,
  isAiConfigured: () => aiConfig.isConfigured,
  getAiConfig: () => ({
    apiUrl: aiConfig.apiUrl,
    apiToken: aiConfig.apiToken,
    modelName: aiConfig.modelName,
  }),
  openAiConfig() {
    showAiConfig.value = true
  },
  onInterviewFinished() {
    pauseTimer()
  },
})

const {
  isListening,
  resetVoiceInputState,
  stopVoiceInput,
  handleToggleVoice,
  handleVoiceKeydown,
  checkSpeechStall,
  disposeVoiceInput,
} = useVoiceInput({
  inputText,
  sessionStarted,
  isLoading,
  setErrorMessage(message) {
    errorMsg.value = message
  },
})

let ticker: ReturnType<typeof setInterval> | null = null
let reviewQuestionAbortController: AbortController | null = null

function resetReviewQuestionState() {
  reviewQuestionAbortController?.abort()
  reviewQuestionAbortController = null
  isReviewQuestionLoading.value = false
  reviewQuestionError.value = ''
  reviewQuestionSuccess.value = ''
  reviewQuestionOutput.value = ''
  reviewQuestionResult.value = null
}

function resetSession() {
  stopVoiceInput()
  resetInterviewSessionState()
  resetTimer()
  inputText.value = ''
  resetVoiceInputState()
  resetReviewQuestionState()
}

function handleModeSwitch(nextMode: InterviewMode) {
  if (mode.value === nextMode) return
  mode.value = nextMode
  resetSession()
}

function handleStart() {
  if (!canStart.value) return
  startTimer()
  void runInterview('start')
}

function handleTogglePause() {
  if (!sessionStarted.value || remainingSeconds.value === 0 || isLoading.value) return
  togglePause()
}

function handleFinish() {
  if (!canFinish.value) return
  pauseTimer()
  void runInterview('finish')
}

async function handleGenerateReviewQuestions() {
  if (!finalEvaluation.value || isReviewQuestionLoading.value) return
  if (!aiConfig.isConfigured) {
    showAiConfig.value = true
    return
  }

  isReviewQuestionLoading.value = true
  reviewQuestionError.value = ''
  reviewQuestionSuccess.value = ''
  reviewQuestionResult.value = null
  reviewQuestionOutput.value = ''
  reviewQuestionAbortController = new AbortController()

  await generateInterviewReviewQuestions(
    {
      finalEvaluation: finalEvaluation.value,
      messages: buildHistory(false),
      memorySummary: memorySummary.value,
      resumeSnapshot: resumeSnapshot.value,
    },
    {
      onChunk(text) {
        reviewQuestionOutput.value = text
      },
      onDone(result) {
        reviewQuestionResult.value = result
        isReviewQuestionLoading.value = false
        reviewQuestionAbortController = null
      },
      onError(error) {
        reviewQuestionError.value = error
        isReviewQuestionLoading.value = false
        reviewQuestionAbortController = null
      },
    },
    reviewQuestionAbortController.signal,
  )
}

function handleCancelReviewQuestions() {
  reviewQuestionAbortController?.abort()
  reviewQuestionAbortController = null
  isReviewQuestionLoading.value = false
}

async function handleImportReviewQuestions() {
  if (!reviewQuestionResult.value) return

  await questionBankStore.ensureBundledQuestionsLoaded()
  if (questionBankStore.loadError) {
    reviewQuestionError.value = questionBankStore.loadError
    return
  }

  const imported = questionBankStore.addQuestions(
    reviewQuestionResult.value.questions.map((item) => {
      const searchText = buildQuestionSearchText(item)
      return {
        chapterId: item.chapterId,
        title: item.title,
        difficulty: item.difficulty,
        labels: item.labels,
        source: 'interview-review' as const,
        projectNames: matchProjectNamesInText(searchText, resumeProjectNames.value),
        techStacks: extractTechStacksFromText(searchText),
        answer: item.answer,
      }
    }),
  )

  imported.forEach((item) => {
    questionBankStore.setPracticeMastery(item.id, 'weak')
  })

  questionBankStore.selectChapter(null)
  questionBankStore.setViewFilter('review')
  if (imported[0]) {
    questionBankStore.selectQuestion(imported[0].id)
  }

  reviewQuestionSuccess.value = `已导入 ${imported.length} 道待复习题，打开题库即可继续练习。`
  reviewQuestionError.value = ''
  reviewQuestionOutput.value = ''
  reviewQuestionResult.value = null
}

function handleReset() {
  resetSession()
}

function handleSend() {
  const text = inputText.value.trim()
  if (!canSend.value || !text) return
  stopVoiceInput()
  appendUserMessage(text)
  inputText.value = ''
  resetVoiceInputState()
  void runInterview('continue', text)
}

watch(remainingSeconds, (value) => {
  if (!sessionStarted.value) return
  if (value !== 0) return
  pauseTimer()
  if (!finalEvaluation.value && !isLoading.value && aiConfig.isConfigured) {
    void runInterview('finish')
  }
})

onMounted(() => {
  window.addEventListener('keydown', handleVoiceKeydown)
  ticker = setInterval(() => {
    if (!sessionStarted.value || !timerRunning.value) return
    if (remainingSeconds.value <= 0) return
    tick()
    checkSpeechStall()
  }, 1000)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleVoiceKeydown)
  if (ticker) {
    clearInterval(ticker)
    ticker = null
  }
  disposeVoiceInput()
  reviewQuestionAbortController?.abort()
  reviewQuestionAbortController = null
})
</script>

<template>
  <section class="ai-interviewer-panel">
    <InterviewTopbar
      :mode="mode"
      :is-ai-configured="aiConfig.isConfigured"
      :model-name="aiConfig.modelName"
      :show-resume-preview="showResumePreview"
      @switch-mode="handleModeSwitch"
      @open-config="showAiConfig = true"
      @toggle-resume-preview="showResumePreview = !showResumePreview"
    />

    <div v-if="finalEvaluation" class="final-banner" :class="{ pass: finalEvaluation.passed, fail: !finalEvaluation.passed }">
      综合评分 {{ finalEvaluation.totalScore }} · {{ finalEvaluation.passed ? '通过' : '未通过' }} · 项目
      {{ finalEvaluation.projectScore }} / 技能 {{ finalEvaluation.skillScore }} / 工作
      {{ finalEvaluation.workScore }} / 教育 {{ finalEvaluation.educationScore }}
    </div>

    <InterviewReviewQuestionPanel
      v-if="finalEvaluation"
      :is-loading="isReviewQuestionLoading"
      :success="reviewQuestionSuccess"
      :error="reviewQuestionError"
      :output="reviewQuestionOutput"
      :result="reviewQuestionResult"
      @generate="handleGenerateReviewQuestions"
      @cancel="handleCancelReviewQuestions"
      @import="handleImportReviewQuestions"
    />

    <div class="workspace">
      <InterviewSimulationPanel
        :mode="mode"
        :messages="messages"
        :is-loading="isLoading"
        :error-msg="errorMsg"
        :input-text="inputText"
        :can-send="canSend"
        :is-listening="isListening"
        :streaming-assistant-message-id="streamingAssistantMessageId"
        :session-started="sessionStarted"
        :timer-text="timerText"
        :timer-status-text="timerStatusText"
        :current-round="currentRound"
        :user-turns="userTurns"
        :assistant-turns="assistantTurns"
        :can-start="canStart"
        :can-finish="canFinish"
        :timer-running="timerRunning"
        @update:input-text="inputText = $event"
        @start="handleStart"
        @toggle-pause="handleTogglePause"
        @finish="handleFinish"
        @reset="handleReset"
        @adjust-duration="adjustDuration"
        @send="handleSend"
        @toggle-voice="handleToggleVoice"
      />

      <ResumePreviewOverlay v-if="showResumePreview" @close="showResumePreview = false" />
    </div>

    <AiConfigDialog v-if="showAiConfig" @close="showAiConfig = false" />
  </section>
</template>

<style scoped>
.ai-interviewer-panel {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: linear-gradient(145deg, #f7f2ec 0%, #f1e5d8 100%);
}

.final-banner {
  border-radius: 9px;
  border: 1px solid #d8d0c4;
  background: #f7f3ed;
  color: #5f5448;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 10px;
}

.final-banner.pass {
  border-color: #c8e6cf;
  background: #eef8f1;
  color: #2b7a45;
}

.final-banner.fail {
  border-color: #f0d2c8;
  background: #fff1ec;
  color: #b74a30;
}

.workspace {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
}

.workspace > :first-child {
  flex: 1;
  min-height: 0;
}
</style>
