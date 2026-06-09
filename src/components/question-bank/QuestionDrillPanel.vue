<script setup lang="ts">
import type { FollowUpDrillPlan, FollowUpDrillRound } from '@/services/questionFollowUpDrillService'

type CompletedDrillRound = FollowUpDrillRound & { answer: string }

defineProps<{
  isAiConfigured: boolean
  isGeneratingDrill: boolean
  drillError: string
  drillRawOutput: string
  drillPlan: FollowUpDrillPlan | null
  fallbackDrillPlan: FollowUpDrillPlan | null
  drillRoundIndex: number
  currentDrillRound: FollowUpDrillRound | null
  currentDrillAnswer: string
  isDrillFinished: boolean
  completedDrillRounds: CompletedDrillRound[]
  canUseFirstDrillAnswer: boolean
  drillHintText: string
}>()

const emit = defineEmits<{
  (e: 'generate-ai-drill'): void
  (e: 'start-fallback-drill'): void
  (e: 'cancel-drill-generation'): void
  (e: 'update:current-drill-answer', value: string): void
  (e: 'advance-drill'): void
  (e: 'drill-prev'): void
  (e: 'fill-answer-from-drill'): void
  (e: 'append-drill-to-notes'): void
  (e: 'reset-drill'): void
}>()
</script>

<template>
  <section class="drill-section">
    <div class="drill-header">
      <h2 class="section-title">追问链训练</h2>
      <span v-if="drillPlan" class="drill-progress">
        {{ isDrillFinished ? '训练完成' : `第 ${drillRoundIndex + 1} / ${drillPlan.rounds.length} 轮` }}
      </span>
    </div>

    <div v-if="!drillPlan" class="drill-intro-card">
      <div class="drill-action-row">
        <button
          v-if="isAiConfigured && !isGeneratingDrill"
          type="button"
          class="drill-btn primary"
          @click="emit('generate-ai-drill')"
        >
          AI 生成 3-5 轮追问
        </button>
        <button
          v-if="fallbackDrillPlan && !isGeneratingDrill"
          type="button"
          class="drill-btn"
          @click="emit('start-fallback-drill')"
        >
          直接用题库追问
        </button>
        <button
          v-if="isGeneratingDrill"
          type="button"
          class="drill-cancel-btn"
          @click="emit('cancel-drill-generation')"
        >
          取消生成
        </button>
      </div>
      <p class="drill-tip">{{ drillHintText }}</p>
      <div v-if="drillError" class="drill-error">{{ drillError }}</div>
      <div v-if="isGeneratingDrill && drillRawOutput" class="drill-stream-card">
        <div class="drill-stream-label">AI 追问链生成中...</div>
        <pre class="drill-stream-content">{{ drillRawOutput }}</pre>
      </div>
    </div>

    <template v-else>
      <div class="drill-summary-card">
        <div class="drill-summary-label">训练重点</div>
        <p class="drill-summary-text">{{ drillPlan.summary }}</p>
      </div>

      <div v-if="!isDrillFinished && currentDrillRound" class="drill-round-card">
        <div class="drill-round-head">
          <span class="drill-round-badge">第 {{ drillRoundIndex + 1 }} 轮</span>
          <span class="drill-focus-tag">{{ currentDrillRound.focus }}</span>
        </div>
        <div class="drill-question">{{ currentDrillRound.question }}</div>
        <textarea
          :value="currentDrillAnswer"
          class="practice-textarea drill-textarea"
          placeholder="按真实面试状态作答，尽量一口气把思路讲完整。"
          rows="5"
          @input="emit('update:current-drill-answer', ($event.target as HTMLTextAreaElement).value)"
        ></textarea>
        <div class="drill-nav">
          <button
            type="button"
            class="drill-nav-btn"
            :disabled="drillRoundIndex === 0"
            @click="emit('drill-prev')"
          >
            上一轮
          </button>
          <button
            type="button"
            class="drill-nav-btn primary"
            :disabled="!currentDrillAnswer.trim()"
            @click="emit('advance-drill')"
          >
            {{ drillRoundIndex >= drillPlan.rounds.length - 1 ? '完成训练' : '提交并下一轮' }}
          </button>
        </div>
      </div>

      <div v-else class="drill-result-card">
        <div class="drill-result-head">
          <div>
            <div class="drill-summary-label">训练回看</div>
            <p class="drill-summary-text">这次追问链已经走完，下面可以对照你的回答和参考要点复盘。</p>
          </div>
          <div class="drill-result-actions">
            <button type="button" class="drill-btn" :disabled="!canUseFirstDrillAnswer" @click="emit('fill-answer-from-drill')">
              首轮写入我的回答
            </button>
            <button type="button" class="drill-btn" @click="emit('append-drill-to-notes')">追加到练习备注</button>
            <button type="button" class="drill-btn primary" @click="emit('reset-drill')">重新开始</button>
          </div>
        </div>

        <div class="drill-review-list">
          <div
            v-for="(round, index) in completedDrillRounds"
            :key="`${index}-${round.question}`"
            class="drill-review-item"
          >
            <div class="drill-round-head">
              <span class="drill-round-badge">第 {{ index + 1 }} 轮</span>
              <span class="drill-focus-tag">{{ round.focus }}</span>
            </div>
            <div class="drill-question">{{ round.question }}</div>
            <div class="drill-review-block">
              <div class="drill-review-title">我的回答</div>
              <div class="drill-review-content">{{ round.answer.trim() || '（未填写）' }}</div>
            </div>
            <div class="drill-review-block">
              <div class="drill-review-title">参考要点</div>
              <div class="drill-review-content reference">{{ round.referenceAnswer }}</div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.drill-section {
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

.drill-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.drill-progress {
  font-size: 12px;
  font-weight: 600;
  color: #4f46a5;
}

.drill-intro-card,
.drill-summary-card,
.drill-round-card,
.drill-result-card,
.drill-stream-card {
  padding: 14px;
  border: 1px solid #dbe3f7;
  border-radius: 10px;
  background: #f8fbff;
}

.drill-action-row,
.drill-nav,
.drill-result-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.drill-btn,
.drill-cancel-btn,
.drill-nav-btn {
  min-height: 34px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.drill-btn,
.drill-nav-btn,
.drill-cancel-btn {
  border: 1px solid #c8d5f6;
  background: #fff;
  color: #37558f;
}

.drill-btn.primary,
.drill-nav-btn.primary {
  border-color: transparent;
  background: #37558f;
  color: #fff;
}

.drill-tip {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #6b7280;
}

.drill-error {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fff5f5;
  color: #dc2626;
  font-size: 12px;
}

.drill-stream-card {
  margin-top: 12px;
}

.drill-stream-label,
.drill-summary-label,
.drill-review-title {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 700;
  color: #37558f;
}

.drill-stream-content {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.6;
  color: #3a3028;
  font-family: inherit;
}

.drill-summary-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: #2d2521;
}

.drill-round-head,
.drill-result-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.drill-round-badge,
.drill-focus-tag {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.drill-round-badge {
  background: #e7efff;
  color: #37558f;
}

.drill-focus-tag {
  background: #edf5ea;
  color: #447d47;
}

.drill-question {
  margin-top: 12px;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.7;
  color: #2d2521;
}

.drill-textarea {
  margin-top: 12px;
}

.drill-nav {
  margin-top: 12px;
  justify-content: flex-end;
}

.drill-review-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 14px;
}

.drill-review-item {
  padding: 12px;
  border: 1px solid #dbe3f7;
  border-radius: 10px;
  background: #fff;
}

.drill-review-block {
  margin-top: 12px;
}

.drill-review-content {
  font-size: 13px;
  line-height: 1.7;
  color: #3a3028;
  white-space: pre-wrap;
}

.drill-review-content.reference {
  color: #4b5563;
}

@media (max-width: 980px) {
  .drill-header,
  .drill-result-head,
  .drill-round-head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
