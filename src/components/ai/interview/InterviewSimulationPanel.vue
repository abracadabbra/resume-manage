<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import type { InterviewMode } from '@/services/interviewService'
import type { ChatMessage } from '@/components/ai/interview/types'

const props = defineProps<{
  mode: InterviewMode
  messages: ChatMessage[]
  isLoading: boolean
  errorMsg: string
  inputText: string
  canSend: boolean
  isListening: boolean
  streamingAssistantMessageId: string | null
  sessionStarted: boolean
  timerText: string
  timerStatusText: string
  currentRound: number
  userTurns: number
  assistantTurns: number
  canStart: boolean
  canFinish: boolean
  timerRunning: boolean
}>()

const emit = defineEmits<{
  (e: 'update:inputText', value: string): void
  (e: 'start'): void
  (e: 'togglePause'): void
  (e: 'finish'): void
  (e: 'reset'): void
  (e: 'adjustDuration', delta: number): void
  (e: 'send'): void
  (e: 'toggleVoice'): void
}>()

const chatListRef = ref<HTMLElement | null>(null)
const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
})

const assistantName = computed(() => (props.mode === 'candidate' ? 'AI面试官' : 'AI候选人'))
const pauseButtonLabel = computed(() => (props.timerRunning ? '暂停' : '继续'))
const isStreamingReply = computed(() => Boolean(props.streamingAssistantMessageId))

function normalizeAssistantContent(content: string): string {
  const text = content?.trim() || ''
  if (!text) return ''

  try {
    const jsonText = (() => {
      if (text.startsWith('{') && text.endsWith('}')) return text
      const first = text.indexOf('{')
      const last = text.lastIndexOf('}')
      if (first >= 0 && last > first) return text.slice(first, last + 1)
      return ''
    })()

    if (!jsonText) return text
    const parsed = JSON.parse(jsonText) as { assistantReply?: unknown }
    if (typeof parsed.assistantReply === 'string' && parsed.assistantReply.trim()) {
      return parsed.assistantReply
    }
  } catch {
    // Keep raw content when it is not valid JSON.
  }

  return text
}

function renderMarkdown(content: string): string {
  return markdown.render(normalizeAssistantContent(content))
}

function handleInputKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter') return
  if ((event as KeyboardEvent & { isComposing?: boolean }).isComposing) return

  if (event.ctrlKey) {
    return
  }

  event.preventDefault()
  if (props.canSend) emit('send')
}

function scrollToBottom() {
  if (!chatListRef.value) return
  chatListRef.value.scrollTop = chatListRef.value.scrollHeight
}

watch(
  () => [props.messages.length, props.isLoading],
  async () => {
    await nextTick()
    scrollToBottom()
  }
)
</script>

<template>
  <section class="simulation-panel">
    <section class="card controls-card">
      <div class="controls-top">
        <div>
          <p class="card-title">面试控制台</p>
          <p class="card-helper">你可以调整时长并控制会话状态</p>
        </div>
        <span class="status-pill" :class="{ active: timerRunning }">
          {{ timerStatusText }}
        </span>
      </div>

      <div class="timer-row">
        <span class="timer-label">时长</span>
        <button type="button" class="mini-btn" @click="emit('adjustDuration', -5)">-5m</button>
        <span class="timer-value">{{ timerText }}</span>
        <button type="button" class="mini-btn" @click="emit('adjustDuration', 5)">+5m</button>

        <button
          v-if="canStart"
          type="button"
          class="action-btn primary"
          :disabled="isLoading"
          @click="emit('start')"
        >
          开始
        </button>
        <button
          v-else
          type="button"
          class="action-btn"
          :disabled="isLoading"
          @click="emit('togglePause')"
        >
          {{ pauseButtonLabel }}
        </button>

        <button type="button" class="action-btn danger" :disabled="!canFinish" @click="emit('finish')">
          结束并评分
        </button>
        <button type="button" class="action-btn ghost" :disabled="isLoading" @click="emit('reset')">
          重置
        </button>
      </div>
    </section>

    <section class="card qa-card">
      <div class="qa-header">
        <p class="card-title">模拟面试问答</p>
        <p class="qa-meta">轮次 {{ currentRound }} · 你 {{ userTurns }} 条 · AI {{ assistantTurns }} 条</p>
      </div>

      <p v-if="errorMsg" class="error-text">{{ errorMsg }}</p>

      <div ref="chatListRef" class="chat-list">
        <p v-if="messages.length === 0" class="chat-empty">
          点击“开始”后，系统会基于简历生成第一轮问题或候选人开场回答。
        </p>

        <article
          v-for="item in messages"
          :key="item.id"
          class="chat-item"
          :class="item.role === 'assistant' ? 'assistant' : 'user'"
        >
          <p class="chat-role">{{ item.role === 'assistant' ? assistantName : '你' }}</p>
          <template v-if="item.role === 'assistant'">
            <div class="chat-markdown markdown-content" v-html="renderMarkdown(item.content)" />
            <span
              v-if="props.streamingAssistantMessageId === item.id"
              class="stream-cursor"
              aria-hidden="true"
            >
              ▌
            </span>
          </template>
          <p v-else class="chat-content">{{ item.content }}</p>
          <p v-if="item.score" class="score-tip">本轮评分 {{ item.score.score }} · {{ item.score.comment }}</p>
        </article>

        <article v-if="isLoading && !isStreamingReply" class="chat-item assistant loading-card">
          <p class="chat-role">{{ assistantName }}</p>
          <p class="chat-content">正在思考中...</p>
        </article>
      </div>

      <form class="composer" @submit.prevent="emit('send')">
        <p class="composer-hint">输入你的回答（Enter 发送，Ctrl+Enter 换行，Ctrl+I 语音开关）</p>
        <div class="composer-main">
          <textarea
            :value="inputText"
            class="answer-input"
            rows="5"
            placeholder=""
            :disabled="isLoading"
            @input="emit('update:inputText', ($event.target as HTMLTextAreaElement).value)"
            @keydown="handleInputKeydown"
          />
          <div class="composer-actions">
            <button
              type="button"
              class="voice-btn"
              :class="{ active: isListening }"
              :disabled="!sessionStarted || isLoading"
              @click="emit('toggleVoice')"
            >
              {{ isListening ? '停止语音' : '语音' }}
            </button>
            <button type="submit" class="send-btn" :disabled="!canSend">发送</button>
          </div>
        </div>
      </form>
    </section>
  </section>
</template>

<style scoped>
.simulation-panel {
  flex: 1;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card {
  border-radius: 12px;
  border: 1px solid #e4d8cb;
  background: #fff;
  padding: 12px;
}

.controls-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.controls-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.card-title {
  color: #2d2521;
  font-size: 14px;
  font-weight: 700;
}

.card-helper {
  margin-top: 4px;
  color: #8a7461;
  font-size: 12px;
}

.status-pill {
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  background: #f0ece6;
  color: #7f7162;
}

.status-pill.active {
  background: #eaf7ed;
  color: #2b7a45;
}

.timer-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.timer-label {
  color: #7c7062;
  font-size: 12px;
  font-weight: 600;
}

.timer-value {
  min-width: 56px;
  text-align: center;
  border: 1px solid #dfd2c2;
  border-radius: 8px;
  background: #fff;
  color: #2d2521;
  font-size: 12px;
  font-weight: 700;
  padding: 7px 8px;
}

.mini-btn {
  border: 1px solid #dfd2c2;
  border-radius: 8px;
  background: #f7f3ee;
  color: #5f5448;
  font-size: 12px;
  font-weight: 700;
  padding: 7px 10px;
  cursor: pointer;
}

.action-btn {
  border: 1px solid #dfd2c2;
  border-radius: 8px;
  background: #fff;
  color: #5f5448;
  font-size: 12px;
  font-weight: 700;
  padding: 7px 10px;
  cursor: pointer;
}

.action-btn.primary {
  border-color: #2d2521;
  background: #2d2521;
  color: #fff;
}

.action-btn.danger {
  border-color: #d97745;
  background: #d97745;
  color: #fff;
}

.action-btn.ghost {
  background: #f7f3ee;
}

.action-btn:disabled,
.mini-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.qa-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}

.qa-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.qa-meta {
  color: #8a7461;
  font-size: 12px;
  font-weight: 600;
}

.error-text {
  border: 1px solid #f0c7c7;
  border-radius: 8px;
  background: #fff1f1;
  color: #bf2f2f;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 10px;
}

.chat-list {
  flex: 1;
  min-height: 0;
  border: 1px solid #eadfd1;
  border-radius: 10px;
  background: #fcfaf7;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}

.chat-empty {
  color: #8a7461;
  font-size: 12px;
  text-align: center;
  margin: auto 0;
}

.chat-item {
  border-radius: 10px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chat-item.assistant {
  background: #f5efe7;
  border: 1px solid #e6dacc;
}

.chat-item.user {
  background: #fff;
  border: 1px solid #e8ddd0;
}

.chat-role {
  color: #8a7461;
  font-size: 12px;
  font-weight: 700;
}

.chat-content {
  color: #2d2521;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-markdown {
  color: #2d2521;
  font-size: 13px;
  word-break: break-word;
  line-height: 1.65;
}

.markdown-content :deep(p) {
  margin: 0 0 8px;
}

.markdown-content :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 0 0 8px;
  padding-left: 18px;
}

.markdown-content :deep(li) {
  margin-bottom: 4px;
}

.markdown-content :deep(pre) {
  margin: 8px 0;
  padding: 10px;
  border-radius: 8px;
  background: #1f1c17;
  color: #f8f4ef;
  overflow: auto;
}

.markdown-content :deep(code) {
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
}

.markdown-content :deep(p code),
.markdown-content :deep(li code) {
  background: #efe7de;
  color: #5b4937;
  padding: 2px 6px;
  border-radius: 6px;
}

.markdown-content :deep(blockquote) {
  margin: 8px 0;
  padding: 6px 10px;
  border-left: 3px solid #d6b79e;
  background: #f8f2ea;
  color: #705b47;
}

.markdown-content :deep(a) {
  color: #315f9a;
}

.score-tip {
  color: #315f9a;
  font-size: 12px;
  font-weight: 600;
  background: #eaf2ff;
  border-radius: 8px;
  padding: 6px 8px;
}

.loading-card {
  opacity: 0.85;
}

.stream-cursor {
  display: inline-block;
  color: #d97745;
  font-weight: 700;
  animation: blink 0.9s steps(1, end) infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

.composer {
  flex-shrink: 0;
  border: 1px solid #dfd2c2;
  border-radius: 10px;
  background: #f7f3ed;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.composer-hint {
  color: #7b6f62;
  font-size: 13px;
  font-weight: 500;
}

.composer-main {
  position: relative;
}

.answer-input {
  width: 100%;
  border: 1px solid #dfd2c2;
  border-radius: 8px;
  background: #fff;
  color: #2d2521;
  font-size: 13px;
  line-height: 1.6;
  padding: 12px 112px 12px 12px;
  min-height: 118px;
  resize: vertical;
}

.answer-input:focus {
  outline: none;
  border-color: #d97745;
  box-shadow: 0 0 0 3px rgba(217, 119, 69, 0.12);
}

.composer-actions {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.voice-btn {
  border: 1px solid #dfd2c2;
  border-radius: 8px;
  background: #fff;
  color: #5f5448;
  font-size: 12px;
  font-weight: 700;
  padding: 9px 12px;
  cursor: pointer;
}

.voice-btn.active {
  border-color: #d97745;
  color: #d97745;
}

.send-btn {
  border: none;
  border-radius: 8px;
  background: #1f1c17;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  padding: 10px 14px;
  cursor: pointer;
}

.send-btn:disabled,
.voice-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .qa-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .answer-input {
    min-height: 104px;
    padding-right: 104px;
  }

  .voice-btn,
  .send-btn {
    padding: 8px 10px;
  }
}
</style>
