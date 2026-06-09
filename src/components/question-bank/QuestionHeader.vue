<script setup lang="ts">
import type { Question } from '@/stores/questionBank'

defineProps<{
  question: Question
}>()

const difficultyLabel: Record<string, string> = {
  basic: '基础',
  intermediate: '中等',
  advanced: '高级',
}
</script>

<template>
  <div class="detail-header">
    <div class="header-top">
      <span class="question-number">第 {{ question.number }} 题</span>
      <span
        class="difficulty-badge"
        :class="'diff-' + question.difficulty"
      >
        {{ difficultyLabel[question.difficulty] }}
      </span>
    </div>
    <h1 class="question-title">{{ question.title }}</h1>
    <div v-if="question.labels.length" class="question-labels">
      <span
        v-for="label in question.labels"
        :key="label"
        class="label-tag"
      >{{ label }}</span>
    </div>
  </div>
</template>

<style scoped>
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
</style>
