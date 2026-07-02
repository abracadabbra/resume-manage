<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import type { TechInterviewQuestion } from '@/stores/techInterviewQuestions'
import type { ChatMessage } from '@/services/aiClient'

const props = defineProps<{
  questionId: string
  question: TechInterviewQuestion
  /** 公共 AI 答案文本（来自 tech_interview_ai_answers） */
  answer: string
  /** 个人追问对话（来自 tech_user_ai_conversations） */
  conversations: ChatMessage[]
  isAiConfigured: boolean
  streamingText?: string
}>()

const emit = defineEmits<{
  (e: 'generate'): void
  (e: 'follow-up', text: string): void
  (e: 'regenerate'): void
  (e: 'cancel'): void
  (e: 'paste-answer', text: string): void
  (e: 'edit-answer', text: string): void
}>()

const markdown = new MarkdownIt({ breaks: true, linkify: true })

type State = 'idle' | 'generating' | 'done'

const state = computed<State>(() => {
  if (props.answer) return 'done'
  if (props.streamingText) return 'generating'
  return 'idle'
})

const currentAnswer = computed(() => props.answer || props.streamingText || '')

const followUpInput = ref('')
const showPasteDialog = ref(false)
const pastedAnswer = ref('')
const isEditing = ref(false)
const editingText = ref('')

/** 追问历史容器 ref：用于在追加新消息后自动滚到底部 */
const followUpHistoryRef = ref<HTMLElement | null>(null)

/** 追问条数变化时滚动到底（涵盖切题、追加用户/AI 消息、初始加载） */
watch(
  () => props.conversations.length,
  async () => {
    await nextTick()
    const el = followUpHistoryRef.value
    if (!el) return
    el.scrollTop = el.scrollHeight
  },
  { immediate: true },
)

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

function handlePasteClick() {
  showPasteDialog.value = true
  pastedAnswer.value = ''
}

function handleConfirmPaste() {
  const text = pastedAnswer.value.trim()
  if (!text) return
  emit('paste-answer', text)
  showPasteDialog.value = false
  pastedAnswer.value = ''
}

function handleCancelPaste() {
  showPasteDialog.value = false
  pastedAnswer.value = ''
}

function startEdit() {
  editingText.value = currentAnswer.value
  isEditing.value = true
}

function cancelEdit() {
  isEditing.value = false
  editingText.value = ''
}

function saveEdit() {
  const text = editingText.value.trim()
  if (!text) return
  emit('edit-answer', text)
  isEditing.value = false
}
</script>

<template>
  <section class="ai-answer-section">
    <h2 class="section-title">AI 参考答案</h2>

    <!-- Idle: show generate + paste buttons -->
    <div v-if="state === 'idle'" class="idle-state">
      <div class="button-row">
        <button
          class="generate-btn"
          :disabled="!isAiConfigured"
          @click="handleGenerate"
        >
          🤖 AI 生成答案
        </button>
        <button
          class="paste-btn"
          @click="handlePasteClick"
        >
          📋 粘贴参考答案
        </button>
      </div>
      <p v-if="!isAiConfigured" class="ai-hint">
        AI 未配置时可用粘贴方式手动添加答案
      </p>
    </div>

    <!-- Generating: show streaming text + cancel -->
    <div v-else-if="state === 'generating'" class="generating-state">
      <div class="answer-body" v-safe-html="markdown.render(props.streamingText ?? '')"></div>
      <button class="cancel-btn" @click="emit('cancel')">取消生成</button>
    </div>

    <!-- Done: show answer + follow-up UI -->
    <div v-else-if="state === 'done'" class="done-state">
      <div v-if="!isEditing" class="answer-view">
        <div class="answer-body" v-safe-html="markdown.render(currentAnswer)"></div>
        <div class="answer-toolbar">
          <button class="toolbar-btn" @click="startEdit">✏️ 编辑答案</button>
        </div>
      </div>

      <div v-else class="answer-edit">
        <textarea
          v-model="editingText"
          class="edit-textarea"
          rows="40"
        />
        <div class="edit-actions">
          <button class="cancel-btn" @click="cancelEdit">取消</button>
          <button class="save-btn" :disabled="!editingText.trim()" @click="saveEdit">保存</button>
        </div>
      </div>

      <div v-if="!isEditing" class="follow-up-area">
        <div ref="followUpHistoryRef" class="follow-up-history" v-if="conversations.length > 0">
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

        <div v-if="!isAiConfigured" class="followup-hint">
          AI 未配置，无法使用快捷追问。可点击「✏️ 编辑答案」手动修改。
        </div>
        <div v-else class="quick-follow-ups">
          <button
            v-for="q in QUICK_FOLLOW_UPS"
            :key="q.label"
            class="quick-btn"
            @click="handleQuickFollowUp(q.text)"
          >
            {{ q.label }}
          </button>
        </div>

        <div v-if="isAiConfigured" class="follow-up-input-row">
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

        <div class="done-actions">
          <button class="paste-btn-small" @click="handlePasteClick">
            📋 粘贴新答案（覆盖）
          </button>
          <button class="regenerate-btn" @click="handleRegenerate">
            🔄 重新生成
          </button>
        </div>
      </div>
    </div>

    <!-- Paste Dialog -->
    <div v-if="showPasteDialog" class="paste-dialog-overlay" @click.self="handleCancelPaste">
      <div class="paste-dialog">
        <h3 class="dialog-title">粘贴参考答案</h3>
        <textarea
          v-model="pastedAnswer"
          class="paste-textarea"
          placeholder="将参考答案粘贴到此处..."
          rows="10"
        ></textarea>
        <div class="dialog-actions">
          <button class="cancel-btn" @click="handleCancelPaste">取消</button>
          <button class="confirm-btn" :disabled="!pastedAnswer.trim()" @click="handleConfirmPaste">
            确认保存
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ai-answer-section {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid #e8e0d5;
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
  gap: 8px;
}

.button-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
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

.paste-btn {
  padding: 10px 20px;
  background: #fff;
  color: #7c6af0;
  border: 1.5px solid #7c6af0;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.paste-btn:hover {
  background: #f5f0ff;
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
  transition: all 0.2s;
}

.cancel-btn:hover {
  color: #666;
  border-color: #bbb;
}

.done-state {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.answer-view {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.answer-toolbar {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
}

.toolbar-btn {
  padding: 4px 12px;
  background: transparent;
  color: #7b6a5b;
  border: 1px solid #e8e0d5;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.toolbar-btn:hover {
  background: #faf8f5;
  color: #d97745;
  border-color: #d97745;
}

.answer-edit {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: #faf8f5;
  border: 1px solid #e8e0d5;
  border-radius: 8px;
}

.edit-textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e0d2c1;
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  line-height: 1.6;
  background: #fff;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
}

.edit-textarea:focus {
  border-color: #d97745;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.save-btn {
  padding: 6px 16px;
  background: #d97745;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.save-btn:hover:not(:disabled) {
  background: #c66840;
}

.save-btn:disabled {
  background: #e0d2c1;
  color: #fff;
  cursor: not-allowed;
}

.followup-hint {
  padding: 10px 14px;
  background: #fff8eb;
  border: 1px dashed #e8c89a;
  border-radius: 8px;
  font-size: 12px;
  color: #8a6a3a;
  line-height: 1.5;
}

.answer-body {
  font-size: 14px;
  line-height: 1.8;
  color: #3a3028;
  max-width: 100%;
  word-break: break-word;
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
  max-width: 100%;
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

.done-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.paste-btn-small {
  padding: 5px 12px;
  background: #fff;
  color: #7c6af0;
  border: 1px solid #d4cef5;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.paste-btn-small:hover {
  background: #f5f0ff;
}

.regenerate-btn {
  align-self: flex-start;
  padding: 5px 12px;
  background: transparent;
  color: #999;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.regenerate-btn:hover {
  color: #666;
  border-color: #bbb;
}

/* Paste Dialog */
.paste-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.paste-dialog {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  width: 90%;
  max-width: 560px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

.dialog-title {
  font-size: 16px;
  font-weight: 700;
  color: #2d2521;
  margin: 0 0 16px;
}

.paste-textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid #d4cef5;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.7;
  resize: vertical;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.paste-textarea:focus {
  border-color: #7c6af0;
}

.dialog-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
}

.confirm-btn {
  padding: 8px 20px;
  background: #7c6af0;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.confirm-btn:hover:not(:disabled) {
  background: #6a59d6;
}

.confirm-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}
</style>
