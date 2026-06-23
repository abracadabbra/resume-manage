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
</script>

<template>
  <div class="question-detail">
    <template v-if="store.selectedQuestion">
      <div class="detail-header">
        <div class="freq-badge" :class="{ hot: store.selectedQuestion.f >= 5 }">
          {{ store.selectedQuestion.f }} 次提及
        </div>
        <h3 class="question-text">{{ store.selectedQuestion.q }}</h3>
      </div>

      <div class="detail-meta">
        <div v-if="store.selectedQuestion.c.length" class="meta-section">
          <span class="meta-label">涉及公司</span>
          <div class="company-tags">
            <span
              v-for="company in store.selectedQuestion.c"
              :key="company"
              class="company-tag"
            >
              {{ company }}
            </span>
          </div>
        </div>

        <div class="meta-section">
          <span class="meta-label">当前分类</span>
          <span class="category-name-text">
            {{ store.categories.find((c) => c.id === store.activeCategoryId)?.name ?? '全部分类' }}
          </span>
        </div>

        <div v-if="store.selectedQuestion.position || store.selectedQuestion.round" class="meta-section">
          <span class="meta-label">岗位 / 轮次</span>
          <span class="meta-value">
            {{ [store.selectedQuestion.position, store.selectedQuestion.round].filter(Boolean).join(' / ') }}
          </span>
        </div>

        <div v-if="store.selectedQuestion.techField" class="meta-section">
          <span class="meta-label">技术领域</span>
          <span class="meta-value">{{ store.selectedQuestion.techField }}</span>
        </div>

        <div v-if="store.selectedQuestion.publishedAt" class="meta-section">
          <span class="meta-label">发布时间</span>
          <span class="meta-value">{{ store.selectedQuestion.publishedAt }}</span>
        </div>

        <div v-if="store.selectedQuestion.link" class="meta-section">
          <a
            :href="store.selectedQuestion.link"
            target="_blank"
            rel="noopener noreferrer"
            class="note-link"
          >
            📎 查看原始笔记
          </a>
        </div>

        <div v-if="store.selectedQuestion.noteId" class="meta-section">
          <span class="meta-label">笔记 ID</span>
          <span class="meta-value note-id">{{ store.selectedQuestion.noteId }}</span>
        </div>
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

.detail-header {
  margin-bottom: 24px;
}

.freq-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  background: #fff4e5;
  color: #d97745;
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 12px;
}

.freq-badge.hot {
  background: #fde8e8;
  color: #c62828;
}

.question-text {
  font-size: 18px;
  font-weight: 600;
  color: #2d2521;
  line-height: 1.6;
  margin: 0;
}

.detail-meta {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  background: #faf8f5;
  border-radius: 12px;
  border: 1px solid #e8e0d5;
  max-width: 100%;
}

.meta-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.meta-label {
  font-size: 11px;
  font-weight: 600;
  color: #9b8a7c;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.meta-value {
  font-size: 13px;
  color: #4a4035;
  font-weight: 500;
}

.note-id {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: #7c6af0;
  word-break: break-all;
}

.note-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #7c6af0;
  text-decoration: none;
  transition: opacity 0.2s;
}

.note-link:hover {
  opacity: 0.75;
  text-decoration: underline;
}

.company-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.company-tag {
  padding: 4px 10px;
  border-radius: 6px;
  background: #eef4ff;
  color: #48699d;
  font-size: 12px;
  font-weight: 600;
}

.category-name-text {
  font-size: 13px;
  color: #4a4035;
  font-weight: 600;
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
