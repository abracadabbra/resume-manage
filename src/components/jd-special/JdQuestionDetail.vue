<script setup lang="ts">
import { useJdProfileStore } from '@/stores/jdProfile'

const store = useJdProfileStore()

const difficultyLabel: Record<string, string> = {
  basic: '基础',
  intermediate: '中等',
  advanced: '高级',
}
</script>

<template>
  <div class="jd-question-detail">
    <template v-if="store.selectedQuestion">
      <div class="detail-header">
        <div class="header-top">
          <span class="question-number">第 {{ (store.activeProfile?.questions.findIndex(q => q.id === store.selectedQuestionId) ?? 0) + 1 }} 题</span>
          <span
            class="difficulty-badge"
            :class="'diff-' + store.selectedQuestion.difficulty"
          >
            {{ difficultyLabel[store.selectedQuestion.difficulty] }}
          </span>
          <button
            class="delete-btn"
            @click="store.deleteQuestion(store.activeProfileId!, store.selectedQuestionId!)"
          >
            删除
          </button>
        </div>
        <h1 class="question-title">{{ store.selectedQuestion.title }}</h1>
        <div v-if="store.selectedQuestion.labels.length" class="question-labels">
          <span
            v-for="label in store.selectedQuestion.labels"
            :key="label"
            class="label-tag"
          >{{ label }}</span>
        </div>
      </div>

      <div class="detail-content">
        <section class="answer-section">
          <h2 class="section-title">参考答案</h2>
          <div class="answer-content" v-html="store.selectedQuestion.answer.content.replace(/\n/g, '<br>')"></div>
        </section>

        <section v-if="store.selectedQuestion.answer.followUp.length" class="followup-section">
          <h2 class="section-title">高频追问</h2>
          <div class="followup-list">
            <div
              v-for="(item, idx) in store.selectedQuestion.answer.followUp"
              :key="idx"
              class="followup-item"
            >
              <div class="followup-q">{{ item.question }}</div>
              <div class="followup-a">{{ item.answer }}</div>
            </div>
          </div>
        </section>
      </div>
    </template>

    <div v-else class="empty-state">
      <div class="empty-icon">📋</div>
      <p class="empty-text">选择一道题目查看详情</p>
    </div>
  </div>
</template>

<style scoped>
.jd-question-detail {
  flex: 1;
  overflow-y: auto;
  background: #fff;
}

.detail-header {
  padding: 24px 28px 20px;
  border-bottom: 1px solid #e8e0d5;
  background: linear-gradient(to bottom, #faf8f5, #fff);
}

.header-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.question-number {
  font-size: 12px;
  font-weight: 700;
  color: #d97745;
}

.difficulty-badge {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  font-weight: 600;
}

.diff-basic {
  background: #e8f5e9;
  color: #2e7d32;
}

.diff-intermediate {
  background: #fff8e1;
  color: #f57f17;
}

.diff-advanced {
  background: #fce4ec;
  color: #c62828;
}

.delete-btn {
  margin-left: auto;
  padding: 4px 10px;
  border: 1px solid #e0d2c1;
  border-radius: 6px;
  background: #fff;
  color: #dc2626;
  font-size: 12px;
  cursor: pointer;
}

.delete-btn:hover {
  background: #fff5f5;
  border-color: #dc2626;
}

.question-title {
  font-size: 18px;
  font-weight: 700;
  color: #2d2521;
  margin: 0 0 12px;
  line-height: 1.4;
}

.question-labels {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.label-tag {
  font-size: 11px;
  padding: 3px 8px;
  background: #efe7dc;
  color: #7b6a5b;
  border-radius: 4px;
}

.detail-content {
  padding: 24px 28px;
}

.answer-section,
.followup-section {
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

.answer-content {
  font-size: 14px;
  line-height: 1.8;
  color: #3a3028;
  white-space: pre-wrap;
}

.followup-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.followup-item {
  background: #faf5ef;
  border-left: 3px solid #d97745;
  border-radius: 0 6px 6px 0;
  padding: 12px 14px;
}

.followup-q {
  font-size: 13px;
  color: #2d2521;
  font-weight: 600;
  margin-bottom: 8px;
}

.followup-a {
  font-size: 12px;
  color: #5a4a3a;
  line-height: 1.6;
  white-space: pre-wrap;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #8a7461;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 14px;
  margin: 0;
}
</style>
