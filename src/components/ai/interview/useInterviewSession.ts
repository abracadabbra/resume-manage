import { computed, ref, type Ref } from 'vue'
import {
  requestInterviewTurn,
  type FinalEvaluation,
  type InterviewHistoryItem,
  type InterviewMode,
  type InterviewTurnScore,
  type ResumeSnapshot,
} from '@/services/interviewService'
import type { ChatMessage } from '@/components/ai/interview/types'

interface AiConfigSnapshot {
  apiUrl: string
  apiToken: string
  modelName: string
}

interface UseInterviewSessionOptions {
  inputText: Ref<string>
  sessionStarted: Ref<boolean>
  durationMinutes: Ref<number>
  elapsedSeconds: Ref<number>
  resumeSnapshot: Ref<ResumeSnapshot>
  isAiConfigured: () => boolean
  getAiConfig: () => AiConfigSnapshot
  openAiConfig: () => void
  onInterviewFinished: () => void
}

function newMessageId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error ?? '未知错误')
}

export function useInterviewSession(options: UseInterviewSessionOptions) {
  const mode = ref<InterviewMode>('candidate')
  const isLoading = ref(false)
  const errorMsg = ref('')
  const finalEvaluation = ref<FinalEvaluation | null>(null)
  const messages = ref<ChatMessage[]>([])
  const memorySummary = ref('')
  const streamingAssistantMessageId = ref<string | null>(null)

  const assistantTurns = computed(() => messages.value.filter((item) => item.role === 'assistant').length)
  const userTurns = computed(() => messages.value.filter((item) => item.role === 'user').length)
  const currentRound = computed(() => Math.max(assistantTurns.value, userTurns.value))
  const canSend = computed(() => options.sessionStarted.value && options.inputText.value.trim() !== '' && !isLoading.value)
  const canStart = computed(() => !options.sessionStarted.value && !isLoading.value)
  const canFinish = computed(() => options.sessionStarted.value && !isLoading.value && messages.value.length > 0)

  function appendMessage(role: 'assistant' | 'user', content: string, score: InterviewTurnScore | null = null) {
    messages.value.push({
      id: newMessageId(),
      role,
      content: content.trim(),
      score,
    })
  }

  function appendUserMessage(content: string) {
    appendMessage('user', content)
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

  function resetInterviewSessionState() {
    messages.value = []
    finalEvaluation.value = null
    memorySummary.value = ''
    errorMsg.value = ''
    streamingAssistantMessageId.value = null
  }

  function buildHistory(excludeLastUser = false): InterviewHistoryItem[] {
    const source = excludeLastUser ? messages.value.slice(0, -1) : messages.value
    return source.map((item) => ({
      role: item.role,
      content: item.content,
    }))
  }

  async function runInterview(command: 'start' | 'continue' | 'finish', userInput?: string) {
    if (!options.isAiConfigured()) {
      options.openAiConfig()
      return
    }
    if (isLoading.value) return

    isLoading.value = true
    errorMsg.value = ''
    const draftMessageId = createAssistantDraftMessage()
    streamingAssistantMessageId.value = draftMessageId

    try {
      const response = await requestInterviewTurn({
        config: options.getAiConfig(),
        mode: mode.value,
        command,
        userInput,
        history: buildHistory(command === 'continue'),
        resumeSnapshot: options.resumeSnapshot.value,
        durationMinutes: options.durationMinutes.value,
        elapsedSeconds: options.elapsedSeconds.value,
        memorySummary: memorySummary.value,
      }, undefined, {
        onAssistantReplyChunk(text) {
          updateAssistantMessageById(draftMessageId, text)
        },
      })

      updateAssistantMessageById(draftMessageId, response.assistantReply, response.turnScore)
      if (response.memorySummary) memorySummary.value = response.memorySummary
      if (response.finalEvaluation) finalEvaluation.value = response.finalEvaluation
      if (response.nextAction === 'finish' || command === 'finish') {
        options.onInterviewFinished()
      }
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

  return {
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
  }
}
