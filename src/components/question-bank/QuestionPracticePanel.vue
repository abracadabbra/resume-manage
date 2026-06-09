<script setup lang="ts">
import type { PracticeAiReview, PracticeMastery } from '@/stores/questionBank'

interface MasteryOption {
  value: PracticeMastery
  label: string
}

defineProps<{
  answer: string
  notes: string
  practiceUpdatedText: string
  mastery: PracticeMastery
  masteryOptions: MasteryOption[]
  masteryMeta: Record<PracticeMastery, { label: string; className: string }>
  isReviewing: boolean
  canReviewAnswer: boolean
  reviewError: string
  reviewRawOutput: string
  currentReview: PracticeAiReview | null
  canApplyImprovedAnswer: boolean
}>()

const emit = defineEmits<{
  (e: 'update:answer', value: string): void
  (e: 'update:notes', value: string): void
  (e: 'set-mastery', value: PracticeMastery): void
  (e: 'review'): void
  (e: 'cancel-review'): void
  (e: 'apply-improved-answer'): void
}>()
</script>

<template>
  <section class="practice-section">
    <div class="practice-header">
      <div class="practice-title-group">
        <h2 class="section-title">我的回答</h2>
        <div class="mastery-segments" role="tablist" aria-label="掌握状态">
          <button
            v-for="option in masteryOptions"
            :key="option.value"
            type="button"
            class="mastery-btn"
            :class="[
              masteryMeta[option.value].className,
              { active: mastery === option.value },
            ]"
            @click="emit('set-mastery', option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
      <span class="practice-status">{{ practiceUpdatedText }}</span>
    </div>
    <textarea
      :value="answer"
      class="practice-textarea"
      placeholder="在这里写你的口头回答提纲、关键词和完整作答版本。"
      rows="7"
      @input="emit('update:answer', ($event.target as HTMLTextAreaElement).value)"
    ></textarea>

    <div class="notes-block">
      <div class="notes-title">练习备注</div>
      <textarea
        :value="notes"
        class="practice-textarea notes-textarea"
        placeholder="记录薄弱点、卡壳点、想补的知识点。"
        rows="4"
        @input="emit('update:notes', ($event.target as HTMLTextAreaElement).value)"
      ></textarea>
    </div>

    <div class="review-toolbar">
      <button
        v-if="!isReviewing"
        class="review-btn"
        :disabled="!canReviewAnswer"
        @click="emit('review')"
      >
        {{ currentReview ? '重新 AI 点评' : 'AI 点评我的回答' }}
      </button>
      <button v-else class="review-cancel-btn" @click="emit('cancel-review')">取消点评</button>
      <span class="review-tip">
        {{ currentReview ? '点评会结合题目、参考答案、追问和你的草稿。' : '先写出你的回答，再让 AI 帮你挑刺。' }}
      </span>
    </div>

    <div v-if="reviewError" class="review-error">{{ reviewError }}</div>

    <div v-if="isReviewing && reviewRawOutput" class="review-stream-card">
      <div class="review-stream-label">AI 点评中...</div>
      <pre class="review-stream-content">{{ reviewRawOutput }}</pre>
    </div>

    <div v-if="currentReview" class="review-card">
      <div class="review-score-grid">
        <div class="score-item score-main">
          <span class="score-label">综合</span>
          <span class="score-value">{{ currentReview.overallScore }}</span>
        </div>
        <div class="score-item">
          <span class="score-label">完整度</span>
          <span class="score-value">{{ currentReview.completenessScore }}</span>
        </div>
        <div class="score-item">
          <span class="score-label">准确性</span>
          <span class="score-value">{{ currentReview.accuracyScore }}</span>
        </div>
        <div class="score-item">
          <span class="score-label">深度</span>
          <span class="score-value">{{ currentReview.depthScore }}</span>
        </div>
        <div class="score-item">
          <span class="score-label">表达</span>
          <span class="score-value">{{ currentReview.deliveryScore }}</span>
        </div>
      </div>

      <div class="review-section">
        <div class="review-section-title">点评结论</div>
        <p class="review-summary">{{ currentReview.summary }}</p>
      </div>

      <div class="review-columns">
        <div class="review-section">
          <div class="review-section-title">答得好的地方</div>
          <ul class="review-list">
            <li v-for="item in currentReview.strengths" :key="item">{{ item }}</li>
          </ul>
        </div>
        <div class="review-section">
          <div class="review-section-title">要补的地方</div>
          <ul class="review-list">
            <li v-for="item in currentReview.improvements" :key="item">{{ item }}</li>
          </ul>
        </div>
      </div>

      <div class="review-section">
        <div class="review-section-title">优化后回答</div>
        <div class="review-improved-answer">{{ currentReview.improvedAnswer }}</div>
        <div class="review-actions">
          <button
            type="button"
            class="apply-improved-btn"
            :disabled="!canApplyImprovedAnswer"
            @click="emit('apply-improved-answer')"
          >
            一键替换到我的回答
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.practice-section {
  margin-bottom: 28px;
}

.section-title {
  font-size: 14px;
  font-weight: 700;
  color: #2d2521;
  margin: 0 0 14px;
  padding-bottom: 8px;
  border-bottom: 2px solid #d97745;
  display: inline-block;
}

.practice-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.practice-title-group {
  min-width: 0;
}

.practice-status {
  font-size: 12px;
  color: #8a7461;
  flex-shrink: 0;
}

.mastery-segments {
  display: inline-grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-top: 10px;
}

.mastery-btn {
  min-width: 54px;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: #f7f3ef;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
}

.mastery-btn.active {
  border-color: currentColor;
  box-shadow: 0 2px 8px rgba(45, 37, 33, 0.08);
}

.mastery-unpracticed {
  color: #7b6a5b;
}

.mastery-practicing {
  color: #c26d14;
}

.mastery-mastered {
  color: #138a4a;
}

.mastery-weak {
  color: #c43d3d;
}

.practice-textarea {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid #e0d2c1;
  border-radius: 8px;
  background: #fffdfb;
  color: #2d2521;
  font-size: 13px;
  line-height: 1.7;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
}

.practice-textarea:focus {
  border-color: #d97745;
  box-shadow: 0 0 0 3px rgba(217, 119, 69, 0.08);
}

.notes-block {
  margin-top: 12px;
}

.notes-title {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 700;
  color: #6b5a4b;
}

.notes-textarea {
  min-height: 108px;
}

.review-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.review-btn,
.review-cancel-btn {
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.review-btn {
  border: none;
  background: #4631ad;
  color: #fff;
}

.review-btn:hover:not(:disabled) {
  background: #37238f;
}

.review-btn:disabled {
  background: #d8d1ee;
  cursor: not-allowed;
}

.review-cancel-btn {
  border: 1px solid #ddd2f8;
  background: #fff;
  color: #5b40c6;
}

.review-tip {
  font-size: 12px;
  color: #8a7461;
}

.review-error {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fff5f5;
  color: #dc2626;
  font-size: 12px;
}

.review-stream-card,
.review-card {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid #e6ddf8;
  border-radius: 10px;
  background: #faf9ff;
}

.review-stream-label,
.review-section-title {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 700;
  color: #5b40c6;
}

.review-stream-content {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.6;
  color: #3a3028;
  font-family: inherit;
}

.review-score-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 14px;
}

.score-item {
  padding: 10px 8px;
  border-radius: 8px;
  background: #fff;
  text-align: center;
}

.score-main {
  background: #f2eeff;
}

.score-label {
  display: block;
  margin-bottom: 4px;
  font-size: 11px;
  color: #7b6a5b;
}

.score-value {
  font-size: 18px;
  font-weight: 700;
  color: #2d2521;
}

.review-summary {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: #2d2521;
}

.review-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 14px;
}

.review-list {
  margin: 0;
  padding-left: 18px;
  color: #3a3028;
  font-size: 13px;
  line-height: 1.7;
}

.review-improved-answer {
  padding: 12px;
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
  line-height: 1.8;
  color: #2d2521;
  white-space: pre-wrap;
}

.review-actions {
  margin-top: 10px;
}

.apply-improved-btn {
  padding: 8px 14px;
  border: 1px solid #ddd2f8;
  border-radius: 8px;
  background: #fff;
  color: #5b40c6;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.apply-improved-btn:hover:not(:disabled) {
  background: #f5f2ff;
}

.apply-improved-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 980px) {
  .practice-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .review-columns {
    grid-template-columns: 1fr;
  }

  .review-score-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
