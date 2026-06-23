<script setup lang="ts">
import { computed, ref } from 'vue'
import MarkdownIt from 'markdown-it'
import type { Question, AiAnswerData } from '@/stores/questionBank'

const props = defineProps<{
  questionId: string
  question: Question
  aiAnswerData: AiAnswerData | null
  isAiConfigured: boolean
  streamingText?: string
}>()

const emit = defineEmits<{
  (e: 'generate'): void
  (e: 'follow-up', text: string): void
  (e: 'regenerate'): void
  (e: 'cancel'): void
}>()

const markdown = new MarkdownIt({ breaks: true, linkify: true })

type State = 'idle' | 'generating' | 'done'

const state = computed<State>(() => {
  if (props.aiAnswerData?.answer) return 'done'
  if (props.streamingText) return 'generating'
  return 'idle'
})

const currentAnswer = computed(() => props.aiAnswerData?.answer ?? props.streamingText ?? '')
const conversations = computed(() => props.aiAnswerData?.conversations ?? [])

const followUpInput = ref('')

const QUICK_FOLLOW_UPS = [
  { label: '展开细节', text: '请展开每个要点，详细解释为什么和怎么做' },
  { label: '举个具体例子', text: '请结合具体的代码示例或实际场景说明' },
  { label: '指出不足', text: '请指出这个答案的不足之处，并给出改进建议' },
  { label: '简化版', text: '请给出一个更简洁、更容易面试口头表达的版本' },
]

function handleGenerate() {
  emit('generate')
}

function handleRegenerate() {
  emit('regenerate')
}

function handleQuickFollowUp(text: string) {
  emit('follow-up', text)
}

function handleFollowUp() {
  const text = followUpInput.value.trim()
  if (!text) return
  emit('follow-up', text)
  followUpInput.value = ''
}
</script>

<template>
  <section class="ai-answer-section">
    <h2 class="section-title">AI 参考答案</h2>

    <!-- Idle: show generate button -->
    <div v-if="state === 'idle'" class="idle-state">
      <button
        class="generate-btn"
        :disabled="!isAiConfigured"
        @click="handleGenerate"
      >
        🤖 AI 生成答案
      </button>
      <p v-if="!isAiConfigured" class="ai-hint">
        请先在 AI 设置中配置模型与密钥
      </p>
    </div>

    <!-- Generating: show streaming text + cancel -->
    <div v-else-if="state === 'generating'" class="generating-state">
      <div class="answer-body" v-safe-html="markdown.render(props.streamingText ?? '')"></div>
      <button class="cancel-btn" @click="emit('cancel')">取消生成</button>
    </div>

    <!-- Done: show answer + follow-up UI -->
    <div v-else-if="state === 'done'" class="done-state">
      <div class="answer-body" v-safe-html="markdown.render(currentAnswer)"></div>

      <div class="follow-up-area">
        <div class="follow-up-history" v-if="conversations.length > 0">
          <div
            v-for="(msg, idx) in conversations"
            :key="idx"
            class="conversation-item"
            :class="msg.role"
          >
            <span class="msg-role">{{ msg.role === 'user' ? '追问' : 'AI' }}</span>
            <div class="msg-content" v-safe-html="markdown.render(msg.content)"></div>
          </div>
        </div>

        <div class="quick-follow-ups">
          <button
            v-for="q in QUICK_FOLLOW_UPS"
            :key="q.label"
            class="quick-btn"
            @click="handleQuickFollowUp(q.text)"
          >
            {{ q.label }}
          </button>
        </div>

        <div class="follow-up-input-row">
          <input
            v-model="followUpInput"
            class="follow-up-input"
            placeholder="输入追问内容..."
            @keydown.enter="handleFollowUp"
          />
          <button class="send-btn" :disabled="!followUpInput.trim()" @click="handleFollowUp">
            发送
          </button>
        </div>

        <button class="regenerate-btn" @click="handleRegenerate">
          🔄 重新生成
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ai-answer-section {
  margin-bottom: 28px;
}

.section-title {
  font-size: 14px;
  font-weight: 700;
  color: #2d2521;
  margin: 0 0 14px;
  padding-bottom: 8px;
  border-bottom: 2px solid #7c6af0;
  display: inline-block;
}

.idle-state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.generate-btn {
  padding: 10px 20px;
  background: #7c6af0;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.generate-btn:hover:not(:disabled) {
  background: #6a59d6;
}

.generate-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.ai-hint {
  font-size: 12px;
  color: #999;
  margin: 0;
}

.generating-state {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cancel-btn {
  align-self: flex-start;
  padding: 6px 14px;
  background: transparent;
  color: #999;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.done-state {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.answer-body {
  font-size: 14px;
  line-height: 1.8;
  color: #3a3028;
}

.answer-body :deep(h1),
.answer-body :deep(h2),
.answer-body :deep(h3) {
  font-size: 15px;
  font-weight: 700;
  margin: 12px 0 6px;
  color: #2d2521;
}

.answer-body :deep(p) {
  margin: 0 0 8px;
}

.answer-body :deep(code) {
  background: #f5f0ff;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 13px;
}

.answer-body :deep(pre) {
  background: #f8f6ff;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
}

.follow-up-area {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-top: 1px solid #eee;
  padding-top: 16px;
}

.follow-up-history {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.conversation-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.conversation-item.user {
  flex-direction: row-reverse;
}

.msg-role {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.user .msg-role {
  background: #7c6af0;
  color: #fff;
}

.assistant .msg-role {
  background: #e8e4f5;
  color: #7c6af0;
}

.msg-content {
  flex: 1;
  font-size: 13px;
  line-height: 1.7;
  color: #3a3028;
  background: #f8f6ff;
  padding: 8px 12px;
  border-radius: 8px;
  max-width: 85%;
}

.user .msg-content {
  background: #7c6af0;
  color: #fff;
}

.quick-follow-ups {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.quick-btn {
  padding: 5px 12px;
  background: #f0eeff;
  color: #7c6af0;
  border: 1px solid #d4cef5;
  border-radius: 16px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.quick-btn:hover {
  background: #e4dff5;
}

.follow-up-input-row {
  display: flex;
  gap: 8px;
}

.follow-up-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #d4cef5;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.follow-up-input:focus {
  border-color: #7c6af0;
}

.send-btn {
  padding: 8px 16px;
  background: #7c6af0;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.send-btn:hover:not(:disabled) {
  background: #6a59d6;
}

.send-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.regenerate-btn {
  align-self: flex-start;
  padding: 6px 14px;
  background: transparent;
  color: #999;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.regenerate-btn:hover {
  color: #666;
  border-color: #bbb;
}
</style>
