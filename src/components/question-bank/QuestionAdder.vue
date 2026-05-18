<script setup lang="ts">
import { ref } from 'vue'
import { useQuestionBankStore } from '@/stores/questionBank'
import { useAiConfigStore } from '@/stores/aiConfig'
import { parseQuestionText, type ParsedQuestion } from '@/services/questionParseService'

const store = useQuestionBankStore()
const aiConfig = useAiConfigStore()

const isExpanded = ref(false)
const rawInput = ref('')
const isLoading = ref(false)
const errorMsg = ref('')
const parsedResult = ref<ParsedQuestion | null>(null)
const aiOutput = ref('')
let abortController: AbortController | null = null

async function handleParse() {
  if (!rawInput.value.trim()) return

  if (!aiConfig.apiUrl || !aiConfig.apiToken) {
    errorMsg.value = '请先在设置中配置 AI API'
    return
  }

  isLoading.value = true
  errorMsg.value = ''
  parsedResult.value = null
  aiOutput.value = ''

  abortController = new AbortController()

  await parseQuestionText(
    rawInput.value,
    {
      onChunk: (text) => {
        aiOutput.value = text
      },
      onDone: (result) => {
        parsedResult.value = result
        isLoading.value = false
      },
      onError: (err) => {
        errorMsg.value = err
        isLoading.value = false
      },
    },
    abortController.signal,
  )
}

function handleCancel() {
  abortController?.abort()
  isLoading.value = false
}

function handleConfirm() {
  if (!parsedResult.value) return

  store.addQuestion({
    chapterId: parsedResult.value.chapterId,
    title: parsedResult.value.title,
    difficulty: parsedResult.value.difficulty,
    labels: parsedResult.value.labels,
    answer: parsedResult.value.answer,
  })

  // Reset
  isExpanded.value = false
  rawInput.value = ''
  parsedResult.value = null
  aiOutput.value = ''
  errorMsg.value = ''
}

function handleDiscard() {
  isExpanded.value = false
  rawInput.value = ''
  parsedResult.value = null
  aiOutput.value = ''
  errorMsg.value = ''
}

const difficultyMap: Record<string, string> = {
  basic: '基础',
  intermediate: '中等',
  advanced: '高级',
}
</script>

<template>
  <div class="question-adder">
    <button v-if="!isExpanded" class="add-btn" @click="isExpanded = true">
      <span class="add-icon">+</span>
      添加题目
    </button>

    <div v-else class="adder-panel">
      <div class="adder-header">
        <h3 class="adder-title">添加新题目</h3>
        <button class="close-btn" @click="handleDiscard">×</button>
      </div>

      <div class="input-section">
        <label class="input-label">粘贴题目内容</label>
        <textarea
          v-model="rawInput"
          class="raw-input"
          placeholder="粘贴题目描述，例如：&#10;线程池的核心参数有哪些？&#10;核心线程数和最大线程数分别是多少？&#10;拒绝策略什么时候触发？"
          rows="5"
          :disabled="isLoading"
        ></textarea>
      </div>

      <div class="action-row">
        <button
          v-if="!isLoading"
          class="parse-btn"
          :disabled="!rawInput.trim()"
          @click="handleParse"
        >
          AI 解析
        </button>
        <button v-else class="cancel-btn" @click="handleCancel">
          取消
        </button>
      </div>

      <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>

      <div v-if="isLoading && aiOutput" class="ai-preview">
        <div class="preview-label">AI 解析中...</div>
        <pre class="preview-content">{{ aiOutput }}</pre>
      </div>

      <div v-if="parsedResult" class="parsed-preview">
        <div class="preview-label">解析结果</div>
        <div class="parsed-fields">
          <div class="field-row">
            <span class="field-key">章节：</span>
            <span class="field-val">{{ parsedResult.chapterName }}</span>
          </div>
          <div class="field-row">
            <span class="field-key">难度：</span>
            <span class="field-val">{{ difficultyMap[parsedResult.difficulty] }}</span>
          </div>
          <div class="field-row">
            <span class="field-key">标签：</span>
            <span class="field-val">{{ parsedResult.labels.join(', ') || '无' }}</span>
          </div>
          <div class="field-row">
            <span class="field-key">题目：</span>
            <span class="field-val">{{ parsedResult.title }}</span>
          </div>
        </div>
        <div class="preview-answer">
          <div class="field-key">答案：</div>
          <pre class="preview-content">{{ parsedResult.answer.content }}</pre>
        </div>
        <div v-if="parsedResult.answer.followUp.length" class="preview-followup">
          <div class="field-key">追问：</div>
          <ul>
            <li v-for="(q, i) in parsedResult.answer.followUp" :key="i">{{ q }}</li>
          </ul>
        </div>
        <div class="confirm-row">
          <button class="confirm-btn" @click="handleConfirm">确认添加</button>
          <button class="discard-btn" @click="handleDiscard">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.question-adder {
  padding: 12px 14px;
  border-bottom: 1px solid #e8e0d5;
  background: #faf8f5;
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px dashed #d97745;
  border-radius: 8px;
  background: transparent;
  color: #d97745;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  width: 100%;
  transition: all 0.15s;
}

.add-btn:hover {
  background: #fff8f5;
  border-style: solid;
}

.add-icon {
  font-size: 16px;
  font-weight: 700;
}

.adder-panel {
  background: #fff;
  border: 1px solid #e8e0d5;
  border-radius: 10px;
  padding: 14px;
}

.adder-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.adder-title {
  font-size: 14px;
  font-weight: 700;
  color: #2d2521;
  margin: 0;
}

.close-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: #f0ebe5;
  border-radius: 50%;
  font-size: 16px;
  color: #7b6a5b;
  cursor: pointer;
  line-height: 1;
}

.close-btn:hover {
  background: #e0d5c8;
}

.input-section {
  margin-bottom: 10px;
}

.input-label {
  display: block;
  font-size: 12px;
  color: #7b6a5b;
  margin-bottom: 6px;
}

.raw-input {
  width: 100%;
  padding: 10px;
  border: 1px solid #e0d2c1;
  border-radius: 8px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
}

.raw-input:focus {
  border-color: #d97745;
}

.raw-input:disabled {
  background: #f8f5f0;
}

.action-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.parse-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 8px;
  background: #d97745;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.parse-btn:hover:not(:disabled) {
  background: #c96a3b;
}

.parse-btn:disabled {
  background: #e0d2c1;
  cursor: not-allowed;
}

.cancel-btn {
  padding: 8px 20px;
  border: 1px solid #e0d2c1;
  border-radius: 8px;
  background: #fff;
  color: #7b6a5b;
  font-size: 13px;
  cursor: pointer;
}

.error-msg {
  padding: 8px 12px;
  background: #fff5f5;
  border: 1px solid #fecaca;
  border-radius: 6px;
  color: #dc2626;
  font-size: 12px;
  margin-bottom: 10px;
}

.ai-preview,
.parsed-preview {
  margin-top: 10px;
  padding: 12px;
  background: #f8f8f8;
  border-radius: 8px;
  border: 1px solid #e8e0d5;
}

.preview-label {
  font-size: 11px;
  color: #8a7461;
  font-weight: 600;
  margin-bottom: 8px;
}

.preview-content {
  font-size: 12px;
  color: #3a3028;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  font-family: inherit;
}

.parsed-fields {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}

.field-row {
  display: flex;
  gap: 6px;
  font-size: 13px;
}

.field-key {
  color: #7b6a5b;
  font-weight: 600;
  flex-shrink: 0;
}

.field-val {
  color: #2d2521;
}

.preview-answer {
  margin-top: 8px;
}

.preview-followup {
  margin-top: 8px;
}

.preview-followup ul {
  margin: 4px 0 0;
  padding-left: 20px;
}

.preview-followup li {
  font-size: 12px;
  color: #3a3028;
  margin-bottom: 4px;
}

.confirm-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.confirm-btn {
  flex: 1;
  padding: 8px;
  border: none;
  border-radius: 8px;
  background: #22c55e;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.confirm-btn:hover {
  background: #16a34a;
}

.discard-btn {
  flex: 1;
  padding: 8px;
  border: 1px solid #e0d2c1;
  border-radius: 8px;
  background: #fff;
  color: #7b6a5b;
  font-size: 13px;
  cursor: pointer;
}
</style>
