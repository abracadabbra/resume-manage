<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useTechInterviewQuestionsStore, type TechInterviewQuestion } from '@/stores/techInterviewQuestions'
import { useAiConfigStore } from '@/stores/aiConfig'
import { generateTechInterviewAnswer } from '@/services/techInterviewAnswerGenerationService'
import type { ChatMessage } from '@/services/aiClient'
import TechInterviewAiAnswer from './TechInterviewAiAnswer.vue'

const store = useTechInterviewQuestionsStore()
const aiConfig = useAiConfigStore()

const isGeneratingAiAnswer = ref(false)
const aiAnswerError = ref('')
const aiAnswerStreamingText = ref('')
const currentAiConversations = ref<ChatMessage[]>([])
let aiAnswerAbortController: AbortController | null = null

const currentAiAnswerData = computed(() => {
  if (!store.selectedQuestionId) return null
  return store.getAiAnswerData(store.selectedQuestionId)
})

function toQuestionInput(q: TechInterviewQuestion) {
  return {
    q: q.q,
    company: q.c?.[0],
    position: q.position,
    round: q.round,
    techField: q.techField,
    noteTitle: q.noteTitle,
  }
}

// Sync conversations when switching to a question that already has cached data
watch(
  () => store.selectedQuestionId,
  (id) => {
    if (id) {
      const cached = store.getAiAnswerData(id)
      currentAiConversations.value = cached?.conversations ?? []
    } else {
      currentAiConversations.value = []
    }
  },
)

function resetAiAnswerState() {
  aiAnswerAbortController?.abort()
  aiAnswerAbortController = null
  isGeneratingAiAnswer.value = false
  aiAnswerError.value = ''
  aiAnswerStreamingText.value = ''
}

watch(
  () => store.selectedQuestionId,
  () => {
    resetAiAnswerState()
  },
)

function cancelAiAnswerGeneration() {
  aiAnswerAbortController?.abort()
  resetAiAnswerState()
}

async function handleGenerateAiAnswer() {
  if (!store.selectedQuestion || !store.selectedQuestionId) return

  isGeneratingAiAnswer.value = true
  aiAnswerError.value = ''
  aiAnswerStreamingText.value = ''
  aiAnswerAbortController = new AbortController()

  await generateTechInterviewAnswer(
    {
      question: toQuestionInput(store.selectedQuestion),
      conversation: currentAiConversations.value,
    },
    {
      onChunk(text) {
        aiAnswerStreamingText.value = text
      },
      onDone(answer) {
        const conversations = [
          ...currentAiConversations.value,
          { role: 'assistant' as const, content: answer },
        ]
        store.saveAiAnswerData(store.selectedQuestionId!, {
          answer,
          conversations,
          updatedAt: Date.now(),
        })
        isGeneratingAiAnswer.value = false
        aiAnswerAbortController = null
      },
      onError(error) {
        aiAnswerError.value = error
        isGeneratingAiAnswer.value = false
        aiAnswerAbortController = null
      },
    },
    aiAnswerAbortController.signal,
  )
}

async function handleAiFollowUp(text: string) {
  if (!store.selectedQuestion || !store.selectedQuestionId) return

  const userMsg = { role: 'user' as const, content: text }
  const updatedConversations = [...currentAiConversations.value, userMsg]

  isGeneratingAiAnswer.value = true
  aiAnswerError.value = ''
  aiAnswerStreamingText.value = ''
  aiAnswerAbortController = new AbortController()

  await generateTechInterviewAnswer(
    {
      question: toQuestionInput(store.selectedQuestion),
      conversation: updatedConversations,
    },
    {
      onChunk(text) {
        aiAnswerStreamingText.value = text
      },
      onDone(answer) {
        const aiMsg = { role: 'assistant' as const, content: answer }
        const finalConversations = [...updatedConversations, aiMsg]
        store.saveAiAnswerData(store.selectedQuestionId!, {
          answer,
          conversations: finalConversations,
          updatedAt: Date.now(),
        })
        currentAiConversations.value = finalConversations
        isGeneratingAiAnswer.value = false
        aiAnswerAbortController = null
      },
      onError(error) {
        aiAnswerError.value = error
        isGeneratingAiAnswer.value = false
        aiAnswerAbortController = null
      },
    },
    aiAnswerAbortController.signal,
  )
}

function handleRegenerateAiAnswer() {
  if (!store.selectedQuestionId) return
  store.clearAiAnswerData(store.selectedQuestionId)
  currentAiConversations.value = []
  handleGenerateAiAnswer()
}

function handlePasteAnswer(text: string) {
  if (!store.selectedQuestionId) return
  store.saveAiAnswerData(store.selectedQuestionId, {
    answer: text,
    conversations: [],
    updatedAt: Date.now(),
  })
}

function handleEditAnswer(text: string) {
  if (!store.selectedQuestionId) return
  const existing = store.getAiAnswerData(store.selectedQuestionId)
  store.saveAiAnswerData(store.selectedQuestionId, {
    answer: text,
    conversations: existing?.conversations ?? [],
    updatedAt: Date.now(),
  })
}
</script>

<template>
  <div class="question-detail">
    <template v-if="store.selectedQuestion">
      <!-- 顶部 chip 栏：分类、公司、岗位、领域、发布时间 -->
      <div class="chip-bar">
        <span
          class="chip chip-category"
        >
          {{ store.categories.find((c) => c.id === store.activeCategoryId)?.name ?? '全部分类' }}
        </span>
        <span
          v-for="company in store.selectedQuestion.c"
          :key="company"
          class="chip chip-company"
        >
          {{ company }}
        </span>
        <span
          v-if="store.selectedQuestion.position || store.selectedQuestion.round"
          class="chip chip-position"
        >
          {{ [store.selectedQuestion.position, store.selectedQuestion.round].filter(Boolean).join(' / ') }}
        </span>
        <span
          v-if="store.selectedQuestion.techField"
          class="chip chip-tech"
        >
          {{ store.selectedQuestion.techField }}
        </span>
        <span
          v-if="store.selectedQuestion.publishedAt"
          class="chip chip-time"
        >
          {{ store.selectedQuestion.publishedAt }}
        </span>
        <span class="chip chip-freq" :class="{ hot: store.selectedQuestion.f >= 5 }">
          {{ store.selectedQuestion.f }} 次提及
        </span>
      </div>

      <!-- 题目正文（视觉重心） -->
      <div class="detail-header">
        <h2 class="question-text">{{ store.selectedQuestion.q }}</h2>
      </div>

      <!-- 笔记溯源（一行小字） -->
      <div v-if="store.selectedQuestion.link || store.selectedQuestion.noteId" class="source-line">
        <a
          v-if="store.selectedQuestion.link"
          :href="store.selectedQuestion.link"
          target="_blank"
          rel="noopener noreferrer"
          class="note-link"
        >
          📎 查看原始笔记
        </a>
        <span v-if="store.selectedQuestion.noteId" class="note-id">
          ID: {{ store.selectedQuestion.noteId }}
        </span>
      </div>

      <TechInterviewAiAnswer
        v-if="store.selectedQuestion"
        :question-id="store.selectedQuestionId ?? ''"
        :question="store.selectedQuestion"
        :ai-answer-data="currentAiAnswerData"
        :is-ai-configured="aiConfig.isConfigured"
        :streaming-text="aiAnswerStreamingText"
        @generate="handleGenerateAiAnswer"
        @follow-up="handleAiFollowUp"
        @regenerate="handleRegenerateAiAnswer"
        @cancel="cancelAiAnswerGeneration"
        @paste-answer="handlePasteAnswer"
        @edit-answer="handleEditAnswer"
      />
    </template>

    <template v-else>
      <div class="empty-detail">
        <p class="empty-icon">📋</p>
        <p class="empty-text">选择一道题目查看详情</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.question-detail {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 24px;
  background: #fff;
}

/* 顶部 chip 栏（一行多 chip） */
.chip-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 20px;
  align-items: center;
}

.chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 14px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
}

.chip-category {
  background: #f3eef9;
  color: #6b46c1;
}

.chip-company {
  background: #eef4ff;
  color: #48699d;
}

.chip-position {
  background: #fef3e7;
  color: #b06d1a;
}

.chip-tech {
  background: #e6f5ee;
  color: #1e7a4d;
}

.chip-time {
  background: #f4f1ed;
  color: #7b6a5b;
  font-weight: 500;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.chip-freq {
  background: #fff4e5;
  color: #d97745;
}

.chip-freq.hot {
  background: #fde8e8;
  color: #c62828;
}

/* 题目正文（视觉重心） */
.detail-header {
  margin-bottom: 16px;
}

.question-text {
  font-size: 22px;
  font-weight: 700;
  color: #1a1410;
  line-height: 1.6;
  margin: 0;
  letter-spacing: -0.01em;
}

/* 笔记溯源（一行小字） */
.source-line {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid #f0ebe3;
  font-size: 11px;
  color: #9b8a7c;
}

.note-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #7c6af0;
  text-decoration: none;
  transition: opacity 0.2s;
}

.note-link:hover {
  opacity: 0.75;
  text-decoration: underline;
}

.note-id {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: #9b8a7c;
}

.empty-detail {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin: 0 0 12px;
}

.empty-text {
  font-size: 14px;
  color: #9b8a7c;
  margin: 0;
}
</style>
