<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import AiConfigDialog from '@/components/ai/AiConfigDialog.vue'
import InterviewSimulationPanel from '@/components/ai/interview/InterviewSimulationPanel.vue'
import ResumePreviewOverlay from '@/components/ai/interview/ResumePreviewOverlay.vue'
import { useAiConfigStore } from '@/stores/aiConfig'
import { useResumeStore } from '@/stores/resume'
import {
  requestInterviewTurn,
  type FinalEvaluation,
  type InterviewHistoryItem,
  type InterviewMode,
  type InterviewTurnScore,
  type ResumeSnapshot,
} from '@/services/interviewService'
import type { ChatMessage } from '@/components/ai/interview/types'

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onstart: (() => void) | null
  onresult: ((event: unknown) => void) | null
  onerror: ((event: unknown) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

const resumeStore = useResumeStore()
const aiConfig = useAiConfigStore()

const mode = ref<InterviewMode>('candidate')
const durationMinutes = ref(60)
const elapsedSeconds = ref(0)
const sessionStarted = ref(false)
const timerRunning = ref(false)
const isLoading = ref(false)
const isListening = ref(false)
const showAiConfig = ref(false)
const showResumePreview = ref(false)
const errorMsg = ref('')
const inputText = ref('')
const finalEvaluation = ref<FinalEvaluation | null>(null)
const messages = ref<ChatMessage[]>([])
const memorySummary = ref('')
const streamingAssistantMessageId = ref<string | null>(null)

const totalSeconds = computed(() => Math.max(durationMinutes.value, 1) * 60)
const remainingSeconds = computed(() => Math.max(totalSeconds.value - elapsedSeconds.value, 0))
const timerText = computed(() => {
  const minutes = Math.floor(remainingSeconds.value / 60)
  const seconds = remainingSeconds.value % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})
const timerStatusText = computed(() => {
  if (!sessionStarted.value) return '未开始'
  if (remainingSeconds.value === 0) return '已结束'
  return timerRunning.value ? '进行中' : '已暂停'
})
const assistantTurns = computed(() => messages.value.filter((item) => item.role === 'assistant').length)
const userTurns = computed(() => messages.value.filter((item) => item.role === 'user').length)
const currentRound = computed(() => Math.max(assistantTurns.value, userTurns.value))
const canSend = computed(() => sessionStarted.value && inputText.value.trim() !== '' && !isLoading.value)
const canStart = computed(() => !sessionStarted.value && !isLoading.value)
const canFinish = computed(() => sessionStarted.value && !isLoading.value && messages.value.length > 0)

const resumeSnapshot = computed<ResumeSnapshot>(() => ({
  basicInfo: resumeStore.basicInfo,
  skillsText: resumeStore.skills,
  workList: resumeStore.workList,
  projectList: resumeStore.projectList,
  educationList: resumeStore.educationList,
  selfIntro: resumeStore.selfIntro,
}))

let ticker: ReturnType<typeof setInterval> | null = null
let speechRecognition: SpeechRecognitionLike | null = null
let speechSeed = ''
let speechFinalBuffer = ''
let speechLastResultIndex = 0
let speechManuallyStopped = false
let speechAutoRestart = false
let speechRestartTimer: ReturnType<typeof setTimeout> | null = null
let speechLastEventAt = 0
const SPEECH_STALL_RESTART_MS = 12_000

function clearSpeechRestartTimer() {
  if (speechRestartTimer) {
    clearTimeout(speechRestartTimer)
    speechRestartTimer = null
  }
}

function resetSpeechState() {
  clearSpeechRestartTimer()
  speechSeed = ''
  speechFinalBuffer = ''
  speechLastResultIndex = 0
  speechManuallyStopped = false
  speechAutoRestart = false
  speechLastEventAt = 0
}

function newMessageId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function appendMessage(role: 'assistant' | 'user', content: string, score: InterviewTurnScore | null = null) {
  messages.value.push({
    id: newMessageId(),
    role,
    content: content.trim(),
    score,
  })
}

function createAssistantDraftMessage(): string {
  const id = newMessageId()
  messages.value.push({
    id,
    role: 'assistant',
    content: '正在思考中...',
    score: null,
  })
  return id
}

function updateAssistantMessageById(id: string, content: string, score: InterviewTurnScore | null = null) {
  const target = messages.value.find((item) => item.id === id)
  if (!target) return
  target.content = content
  target.score = score
}

function removeMessageById(id: string) {
  const index = messages.value.findIndex((item) => item.id === id)
  if (index >= 0) messages.value.splice(index, 1)
}

function resetSession() {
  if (speechRecognition) {
    speechManuallyStopped = true
    speechRecognition.stop()
  }
  messages.value = []
  finalEvaluation.value = null
  memorySummary.value = ''
  errorMsg.value = ''
  elapsedSeconds.value = 0
  sessionStarted.value = false
  timerRunning.value = false
  streamingAssistantMessageId.value = null
  inputText.value = ''
  isListening.value = false
  resetSpeechState()
}

function buildHistory(excludeLastUser = false): InterviewHistoryItem[] {
  const source = excludeLastUser ? messages.value.slice(0, -1) : messages.value
  return source.map((item) => ({
    role: item.role,
    content: item.content,
  }))
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error ?? '未知错误')
}

async function runInterview(command: 'start' | 'continue' | 'finish', userInput?: string) {
  if (!aiConfig.isConfigured) {
    showAiConfig.value = true
    return
  }
  if (isLoading.value) return

  isLoading.value = true
  errorMsg.value = ''
  const draftMessageId = createAssistantDraftMessage()
  streamingAssistantMessageId.value = draftMessageId

  try {
    const response = await requestInterviewTurn({
      config: {
        apiUrl: aiConfig.apiUrl,
        apiToken: aiConfig.apiToken,
        modelName: aiConfig.modelName,
      },
      mode: mode.value,
      command,
      userInput,
      history: buildHistory(command === 'continue'),
      resumeSnapshot: resumeSnapshot.value,
      durationMinutes: durationMinutes.value,
      elapsedSeconds: elapsedSeconds.value,
      memorySummary: memorySummary.value,
    }, undefined, {
      onAssistantReplyChunk(text) {
        updateAssistantMessageById(draftMessageId, text)
      },
    })

    updateAssistantMessageById(draftMessageId, response.assistantReply, response.turnScore)
    if (response.memorySummary) memorySummary.value = response.memorySummary
    if (response.finalEvaluation) finalEvaluation.value = response.finalEvaluation
    if (response.nextAction === 'finish' || command === 'finish') timerRunning.value = false
  } catch (error: unknown) {
    const draft = messages.value.find((item) => item.id === draftMessageId)
    if (draft && (!draft.content || draft.content.trim() === '' || draft.content === '正在思考中...')) {
      removeMessageById(draftMessageId)
    }
    errorMsg.value = formatErrorMessage(error)
  } finally {
    if (streamingAssistantMessageId.value === draftMessageId) {
      streamingAssistantMessageId.value = null
    }
    isLoading.value = false
  }
}

function handleModeSwitch(nextMode: InterviewMode) {
  if (mode.value === nextMode) return
  mode.value = nextMode
  resetSession()
}

function adjustDuration(delta: number) {
  const next = Math.max(15, Math.min(120, durationMinutes.value + delta))
  if (next === durationMinutes.value) return
  durationMinutes.value = next
  if (!sessionStarted.value) {
    elapsedSeconds.value = 0
  } else {
    elapsedSeconds.value = Math.max(0, Math.min(elapsedSeconds.value, totalSeconds.value - 1))
  }
}

function handleStart() {
  if (!canStart.value) return
  sessionStarted.value = true
  timerRunning.value = true
  void runInterview('start')
}

function handleTogglePause() {
  if (!sessionStarted.value || remainingSeconds.value === 0 || isLoading.value) return
  timerRunning.value = !timerRunning.value
}

function handleFinish() {
  if (!canFinish.value) return
  timerRunning.value = false
  void runInterview('finish')
}

function handleReset() {
  resetSession()
}

function handleSend() {
  const text = inputText.value.trim()
  if (!canSend.value || !text) return
  if (isListening.value && speechRecognition) {
    speechManuallyStopped = true
    isListening.value = false
    speechRecognition.stop()
  }
  appendMessage('user', text)
  inputText.value = ''
  resetSpeechState()
  void runInterview('continue', text)
}

function getSpeechCtor(): SpeechRecognitionCtor | null {
  const speechWindow = window as Window & {
    webkitSpeechRecognition?: SpeechRecognitionCtor
    SpeechRecognition?: SpeechRecognitionCtor
  }
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
}

function ensureSpeechRecognition(): SpeechRecognitionLike | null {
  if (speechRecognition) return speechRecognition
  const Ctor = getSpeechCtor()
  if (!Ctor) return null

  const instance = new Ctor()
  instance.continuous = true
  instance.interimResults = true
  instance.lang = 'zh-CN'
  instance.onstart = () => {
    if (speechAutoRestart) {
      isListening.value = true
      speechLastEventAt = Date.now()
    }
  }

  instance.onresult = (rawEvent: unknown) => {
    if (!isListening.value) return

    const event = rawEvent as {
      resultIndex?: number
      results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>
    }
    if (!event?.results || typeof event.results.length !== 'number' || event.results.length === 0) return

    speechLastEventAt = Date.now()
    const maxIndex = Math.max(event.results.length - 1, 0)
    const sourceIndex = typeof event.resultIndex === 'number' ? event.resultIndex : speechLastResultIndex
    const startIndex =
      event.results.length > 0 ? Math.max(0, Math.min(sourceIndex, maxIndex)) : 0

    let finalText = ''
    let interimText = ''
    for (let i = startIndex; i < event.results.length; i++) {
      const result = event.results[i]
      if (!result) continue
      const transcript = result[0]?.transcript?.trim() || ''
      if (!transcript) continue
      if (result.isFinal) {
        finalText += `${finalText ? ' ' : ''}${transcript}`
      } else {
        interimText += `${interimText ? ' ' : ''}${transcript}`
      }
    }

    if (finalText) {
      speechFinalBuffer = [speechFinalBuffer, finalText].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    }
    speechLastResultIndex = event.results.length
    inputText.value = [speechSeed, speechFinalBuffer, interimText]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  instance.onerror = (rawEvent: unknown) => {
    speechLastEventAt = Date.now()
    const event = rawEvent as { error?: string }
    if (speechManuallyStopped || event.error === 'aborted') {
      speechManuallyStopped = false
      isListening.value = false
      speechAutoRestart = false
      return
    }
    if (event.error === 'no-speech') {
      return
    }
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'audio-capture') {
      isListening.value = false
      speechAutoRestart = false
      errorMsg.value = '无法访问麦克风，请检查浏览器权限后重试。'
      return
    }
    if (event.error !== 'no-speech') {
      errorMsg.value = '语音识别失败，请检查麦克风权限后重试。'
    }
  }
  instance.onend = () => {
    clearSpeechRestartTimer()
    if (
      !speechAutoRestart ||
      speechManuallyStopped ||
      !sessionStarted.value ||
      isLoading.value
    ) {
      isListening.value = false
      speechManuallyStopped = false
      return
    }

    speechRestartTimer = setTimeout(() => {
      if (
        !speechRecognition ||
        !speechAutoRestart ||
        speechManuallyStopped ||
        !sessionStarted.value ||
        isLoading.value
      ) {
        return
      }
      try {
        speechRecognition.start()
        isListening.value = true
        speechLastEventAt = Date.now()
      } catch {
        isListening.value = false
        speechAutoRestart = false
        errorMsg.value = '语音识别中断，请点击“语音”重新开始。'
      }
    }, 160)

    speechManuallyStopped = false
  }

  speechRecognition = instance
  return speechRecognition
}

function handleToggleVoice() {
  const instance = ensureSpeechRecognition()
  if (!instance) {
    errorMsg.value = '当前浏览器不支持语音识别，请改用手动输入。'
    return
  }
  if (!sessionStarted.value || isLoading.value) return

  if (isListening.value) {
    speechManuallyStopped = true
    speechAutoRestart = false
    isListening.value = false
    instance.stop()
    return
  }

  speechSeed = inputText.value.trim()
  speechFinalBuffer = ''
  speechLastResultIndex = 0
  speechManuallyStopped = false
  speechAutoRestart = true
  speechLastEventAt = Date.now()
  errorMsg.value = ''
  isListening.value = true
  try {
    instance.start()
  } catch {
    isListening.value = false
    speechAutoRestart = false
    errorMsg.value = '语音识别启动失败，请稍后重试。'
  }
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (!event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return
  if (event.key.toLowerCase() !== 'i') return
  event.preventDefault()
  handleToggleVoice()
}

watch(remainingSeconds, (value) => {
  if (!sessionStarted.value) return
  if (value !== 0) return
  timerRunning.value = false
  if (!finalEvaluation.value && !isLoading.value && aiConfig.isConfigured) {
    void runInterview('finish')
  }
})

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
  ticker = setInterval(() => {
    if (!sessionStarted.value || !timerRunning.value) return
    if (remainingSeconds.value <= 0) return
    elapsedSeconds.value += 1

    if (
      isListening.value &&
      speechAutoRestart &&
      !isLoading.value &&
      speechRecognition &&
      speechLastEventAt > 0 &&
      Date.now() - speechLastEventAt > SPEECH_STALL_RESTART_MS
    ) {
      speechLastEventAt = Date.now()
      try {
        speechRecognition.stop()
      } catch {
        try {
          speechRecognition.start()
        } catch {
          isListening.value = false
          speechAutoRestart = false
          errorMsg.value = '语音识别卡住，请点击“语音”重新开始。'
        }
      }
    }
  }, 1000)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  if (ticker) {
    clearInterval(ticker)
    ticker = null
  }
  clearSpeechRestartTimer()
  if (speechRecognition) {
    speechAutoRestart = false
    speechManuallyStopped = true
    speechRecognition.stop()
    speechRecognition = null
  }
})
</script>

<template>
  <section class="ai-interviewer-panel">
    <header class="topbar">
      <div class="role-switch">
        <button
          type="button"
          class="mode-btn"
          :class="{ active: mode === 'candidate' }"
          @click="handleModeSwitch('candidate')"
        >
          你是面试者
        </button>
        <button
          type="button"
          class="mode-btn"
          :class="{ active: mode === 'interviewer' }"
          @click="handleModeSwitch('interviewer')"
        >
          你是面试官
        </button>
      </div>

      <div class="top-actions">
        <button
          class="interview-config-btn"
          type="button"
          :data-model-tooltip="aiConfig.isConfigured ? aiConfig.modelName : '配置模型'"
          @click="showAiConfig = true"
        >
          <svg class="config-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            />
          </svg>
          <span class="interview-config-btn-text">{{ aiConfig.isConfigured ? aiConfig.modelName : '配置模型' }}</span>
        </button>
        <button class="top-btn" type="button" @click="showResumePreview = !showResumePreview">
          {{ showResumePreview ? '收起简历' : '查看简历' }}
        </button>
      </div>
    </header>

    <div v-if="finalEvaluation" class="final-banner" :class="{ pass: finalEvaluation.passed, fail: !finalEvaluation.passed }">
      综合评分 {{ finalEvaluation.totalScore }} · {{ finalEvaluation.passed ? '通过' : '未通过' }} · 项目
      {{ finalEvaluation.projectScore }} / 技能 {{ finalEvaluation.skillScore }} / 工作
      {{ finalEvaluation.workScore }} / 教育 {{ finalEvaluation.educationScore }}
    </div>

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

.topbar {
  border: 1px solid #e4d8cb;
  border-radius: 12px;
  background: #fff;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.role-switch {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mode-btn {
  border-radius: 8px;
  border: 1px solid #dfd2c2;
  background: #f7f3ee;
  color: #625649;
  font-size: 12px;
  font-weight: 700;
  padding: 7px 12px;
  cursor: pointer;
}

.mode-btn.active {
  border-color: #1f1c17;
  background: #1f1c17;
  color: #fff;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.interview-config-btn {
  position: relative;
  height: 30px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid #ddd2c6;
  background: #fff;
  color: #5c4f44;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  max-width: 260px;
  overflow: visible;
}

.interview-config-btn-text {
  flex: 1;
  min-width: 0;
  display: inline-block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.interview-config-btn::before,
.interview-config-btn::after {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.interview-config-btn::before {
  content: '';
  position: absolute;
  left: 50%;
  top: calc(100% + 3px);
  transform: translate(-50%, -6px);
  border: 5px solid transparent;
  border-bottom-color: #2d2521;
  z-index: 80;
}

.interview-config-btn::after {
  content: attr(data-model-tooltip);
  position: absolute;
  left: 50%;
  top: calc(100% + 8px);
  transform: translate(-50%, -6px);
  width: max-content;
  max-width: min(760px, 90vw);
  padding: 6px 8px;
  border-radius: 6px;
  background: #2d2521;
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  white-space: nowrap;
  word-break: normal;
  overflow-wrap: anywhere;
  z-index: 81;
}

.interview-config-btn:hover::before,
.interview-config-btn:hover::after,
.interview-config-btn:focus-visible::before,
.interview-config-btn:focus-visible::after {
  opacity: 1;
  transform: translate(-50%, 0);
}

.interview-config-btn:hover {
  border-color: #d97745;
  color: #d97745;
}

.config-icon {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}

.top-btn {
  border: 1px solid #dfd2c2;
  border-radius: 8px;
  background: #f7f3ee;
  color: #5f5448;
  font-size: 12px;
  font-weight: 700;
  padding: 7px 10px;
  cursor: pointer;
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

@media (max-width: 860px) {
  .topbar {
    flex-direction: column;
    align-items: stretch;
  }

  .role-switch,
  .top-actions {
    width: 100%;
  }

  .mode-btn,
  .interview-config-btn,
  .top-btn {
    flex: 1;
    text-align: center;
  }
}
</style>
