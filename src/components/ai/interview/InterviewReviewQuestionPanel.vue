<script setup lang="ts">
import { ref } from 'vue'
import type { InterviewReviewQuestionBatch } from '@/services/interviewReviewQuestionService'

defineProps<{
  isLoading: boolean
  success: string
  error: string
  output: string
  result: InterviewReviewQuestionBatch | null
}>()

const emit = defineEmits<{
  (e: 'generate'): void
  (e: 'cancel'): void
  (e: 'import'): void
}>()

// 记录每道题的答案展开状态
const expandedAnswers = ref<Record<string, boolean>>({})

function toggleAnswer(index: number) {
  const key = `q-${index}`
  expandedAnswers.value[key] = !expandedAnswers.value[key]
}

function isAnswerExpanded(index: number): boolean {
  return expandedAnswers.value[`q-${index}`] ?? false
}
</script>

<template>
  <section class="review-question-panel">
    <div class="review-question-header">
      <div>
        <p class="review-question-title">面试复盘生成待复习题</p>
        <p class="review-question-desc">把这场模拟面试暴露出来的短板，直接沉淀成题库里的复习清单。</p>
      </div>
      <button
        v-if="!isLoading"
        type="button"
        class="review-question-btn"
        @click="emit('generate')"
      >
        生成复习题
      </button>
      <button
        v-else
        type="button"
        class="review-question-btn cancel"
        @click="emit('cancel')"
      >
        取消
      </button>
    </div>

    <div v-if="success" class="review-question-feedback success">
      {{ success }}
    </div>
    <div v-if="error" class="review-question-feedback error">
      {{ error }}
    </div>

    <div v-if="isLoading && output" class="review-question-stream">
      <div class="review-question-stream-label">AI 复盘中...</div>
      <pre class="review-question-stream-content">{{ output }}</pre>
    </div>

    <div v-if="result" class="review-question-result">
      <div class="review-question-summary">
        <div class="review-question-summary-label">复盘重点</div>
        <p class="review-question-summary-text">{{ result.summary }}</p>
        <div class="review-question-summary-meta">共 {{ result.questions.length }} 道题</div>
      </div>

      <div class="review-question-list">
        <article
          v-for="(item, index) in result.questions"
          :key="`${item.chapterId}-${index}-${item.title}`"
          class="review-question-item"
        >
          <div class="review-question-item-head">
            <span class="review-question-index">Q{{ index + 1 }}</span>
            <span class="review-question-chapter">{{ item.chapterName }}</span>
            <span class="review-question-difficulty">
              {{ item.difficulty === 'basic' ? '基础' : item.difficulty === 'intermediate' ? '中等' : '高级' }}
            </span>
          </div>
          <p class="review-question-item-title">{{ item.title }}</p>

          <!-- 答案展示区（可折叠） -->
          <div v-if="item.answer && item.answer.content?.trim()" class="review-question-answer">
            <button
              type="button"
              class="review-question-answer-toggle"
              @click="toggleAnswer(index)"
            >
              <span class="review-question-answer-toggle-icon">
                {{ isAnswerExpanded(index) ? '▼' : '▶' }}
              </span>
              <span>参考答案</span>
            </button>

            <div v-if="isAnswerExpanded(index)" class="review-question-answer-content">
              <div class="review-question-answer-main">
                <div class="review-question-answer-label">参考答案</div>
                <p class="review-question-answer-text">{{ item.answer.content }}</p>
              </div>

              <div
                v-if="item.answer.followUp && item.answer.followUp.length > 0"
                class="review-question-followup"
              >
                <div class="review-question-followup-label">高频追问</div>
                <div
                  v-for="(followUp, fIndex) in item.answer.followUp"
                  :key="fIndex"
                  class="review-question-followup-item"
                >
                  <div class="review-question-followup-q">
                    <span class="review-question-followup-q-icon">Q</span>
                    <span>{{ followUp.question }}</span>
                  </div>
                  <div class="review-question-followup-a">
                    <span class="review-question-followup-a-icon">A</span>
                    <span>{{ followUp.answer }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="review-question-answer-empty">
            <div class="review-question-answer-empty-text">
              <span>暂无参考答案</span>
              <span class="review-question-answer-empty-hint">AI 复盘未能生成该题答案，可自行补充或搜索相关知识点</span>
            </div>
          </div>
        </article>
      </div>

      <div class="review-question-actions">
        <button type="button" class="review-question-btn import" @click="emit('import')">
          导入待复习
        </button>
        <button type="button" class="review-question-btn secondary" @click="emit('generate')">
          重新生成
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.review-question-panel {
  border: 1px solid #e4d8cb;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.92);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.review-question-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.review-question-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #2d2521;
}

.review-question-desc {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #7b6a5b;
}

.review-question-btn {
  border: 1px solid #d6cabc;
  border-radius: 8px;
  background: #1f1c17;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  padding: 8px 12px;
  cursor: pointer;
  white-space: nowrap;
}

.review-question-btn.secondary,
.review-question-btn.cancel {
  background: #f7f3ee;
  color: #5f5448;
}

.review-question-btn.import {
  background: #b74a30;
  border-color: #b74a30;
}

.review-question-feedback {
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.5;
}

.review-question-feedback.success {
  border: 1px solid #c8e6cf;
  background: #eef8f1;
  color: #2b7a45;
}

.review-question-feedback.error {
  border: 1px solid #f0d2c8;
  background: #fff1ec;
  color: #b74a30;
}

.review-question-stream,
.review-question-result {
  border: 1px solid #eadfd2;
  border-radius: 10px;
  background: #faf8f5;
}

.review-question-stream {
  padding: 12px;
}

.review-question-stream-label,
.review-question-summary-label {
  font-size: 11px;
  font-weight: 700;
  color: #8a7258;
  text-transform: uppercase;
  letter-spacing: 0;
}

.review-question-stream-content {
  margin: 10px 0 0;
  max-height: 220px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.5;
  color: #42372d;
  white-space: pre-wrap;
  word-break: break-word;
}

.review-question-result {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.review-question-summary-text {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: #40362d;
}

.review-question-summary-meta {
  margin-top: 6px;
  font-size: 12px;
  color: #8a7258;
}

.review-question-list {
  display: grid;
  gap: 8px;
}

.review-question-item {
  border: 1px solid #eadfd2;
  border-radius: 8px;
  background: #fff;
  padding: 10px 12px;
}

.review-question-item-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 11px;
  color: #8a7258;
}

.review-question-index {
  font-weight: 700;
  color: #5f5448;
}

.review-question-chapter {
  font-weight: 600;
}

.review-question-difficulty {
  padding: 2px 6px;
  border-radius: 999px;
  background: #f3ece5;
  color: #7b6a5b;
}

.review-question-item-title {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: #2d2521;
  font-weight: 600;
}

/* 答案展示区 */
.review-question-answer {
  margin-top: 10px;
  border-top: 1px dashed #eadfd2;
  padding-top: 10px;
}

.review-question-answer-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  padding: 4px 0;
  font-size: 12px;
  font-weight: 600;
  color: #7b6a5b;
  cursor: pointer;
  transition: color 0.2s, gap 0.2s;
}

.review-question-answer-toggle:hover {
  color: #5f5448;
  gap: 8px;
}

.review-question-answer-toggle-icon {
  font-size: 10px;
  width: 12px;
  text-align: center;
  transition: transform 0.2s;
}

.review-question-answer-content {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  animation: slideDown 0.25s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.review-question-answer-main {
  background: linear-gradient(135deg, #fdfcfb 0%, #f9f6f2 100%);
  border-radius: 8px;
  padding: 12px;
  border-left: 3px solid #c9a87c;
}

.review-question-answer-label,
.review-question-followup-label {
  font-size: 11px;
  font-weight: 700;
  color: #8a7258;
  text-transform: uppercase;
  letter-spacing: 0;
  margin-bottom: 6px;
}

.review-question-answer-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: #40362d;
  white-space: pre-wrap;
  word-break: break-word;
}

.review-question-followup {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.review-question-followup-item {
  background: #fdfcfb;
  border: 1px solid #eadfd2;
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.review-question-followup-q,
.review-question-followup-a {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.review-question-followup-q-icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #f3ece5;
  color: #7b6a5b;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.review-question-followup-a-icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #e8f5e9;
  color: #2b7a45;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.review-question-followup-q span:last-child,
.review-question-followup-a span:last-child {
  color: #40362d;
}

.review-question-answer-empty {
  margin-top: 10px;
  border-top: 1px dashed #eadfd2;
  padding-top: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #a09080;
  font-style: normal;
}

.review-question-answer-empty::before {
  content: '💡';
  font-size: 14px;
}

.review-question-answer-empty-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.review-question-answer-empty-hint {
  font-size: 11px;
  color: #c0b0a0;
}

.review-question-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

@media (max-width: 860px) {
  .review-question-header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
