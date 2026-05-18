<script setup lang="ts">
import { useQuestionBankStore } from '@/stores/questionBank'

const store = useQuestionBankStore()

const difficultyOptions = [
  { value: null, label: '全部难度' },
  { value: 'basic', label: '基础' },
  { value: 'intermediate', label: '中等' },
  { value: 'advanced', label: '高级' },
]

const difficultyClass: Record<string, string> = {
  basic: 'diff-basic',
  intermediate: 'diff-intermediate',
  advanced: 'diff-advanced',
}
</script>

<template>
  <div class="question-list">
    <div class="list-header">
      <input
        type="text"
        class="search-input"
        placeholder="搜索题目..."
        :value="store.searchQuery"
        @input="store.setSearchQuery(($event.target as HTMLInputElement).value)"
      />
      <select
        class="difficulty-select"
        :value="store.difficultyFilter ?? ''"
        @change="store.setDifficultyFilter(($event.target as HTMLSelectElement).value || null)"
      >
        <option v-for="opt in difficultyOptions" :key="String(opt.value)" :value="opt.value ?? ''">
          {{ opt.label }}
        </option>
      </select>
    </div>

    <div class="list-stats">
      <span v-if="store.activeChapter">
        {{ store.activeChapter.name }}
      </span>
      <span v-else>全部题目</span>
      <span class="stats-count">，{{ store.filteredQuestions.length }} 题</span>
    </div>

    <ul class="questions">
      <li
        v-for="q in store.filteredQuestions"
        :key="q.id"
        class="question-item"
        :class="{ active: store.selectedQuestionId === q.id }"
        @click="store.selectQuestion(q.id)"
      >
        <div class="question-header">
          <span class="question-number">Q{{ q.number }}</span>
          <span class="difficulty-badge" :class="difficultyClass[q.difficulty]">
            {{ q.difficulty === 'basic' ? '基础' : q.difficulty === 'intermediate' ? '中等' : '高级' }}
          </span>
        </div>
        <p class="question-title">{{ q.title }}</p>
        <div v-if="q.labels.length" class="question-labels">
          <span v-for="label in q.labels" :key="label" class="label-tag">{{ label }}</span>
        </div>
      </li>
    </ul>

    <div v-if="store.filteredQuestions.length === 0" class="empty-state">
      <p>没有找到匹配的题目</p>
    </div>
  </div>
</template>

<style scoped>
.question-list {
  width: 320px;
  min-width: 320px;
  border-right: 1px solid #e8e0d5;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.list-header {
  padding: 14px;
  border-bottom: 1px solid #e8e0d5;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #e0d2c1;
  border-radius: 8px;
  font-size: 13px;
  background: #fff;
  outline: none;
  box-sizing: border-box;
}

.search-input:focus {
  border-color: #d97745;
}

.difficulty-select {
  padding: 6px 10px;
  border: 1px solid #e0d2c1;
  border-radius: 6px;
  font-size: 12px;
  background: #fff;
  cursor: pointer;
  outline: none;
}

.list-stats {
  padding: 10px 14px;
  font-size: 12px;
  color: #7b6a5b;
  background: #f8f5f0;
  border-bottom: 1px solid #e8e0d5;
}

.stats-count {
  color: #4a4035;
}

.questions {
  list-style: none;
  margin: 0;
  padding: 8px;
  overflow-y: auto;
  flex: 1;
}

.question-item {
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 6px;
  border: 1px solid transparent;
  transition: all 0.15s;
}

.question-item:hover {
  background: #f8f5f0;
  border-color: #e8e0d5;
}

.question-item.active {
  background: #fff;
  border-color: #d97745;
  box-shadow: 0 2px 8px rgba(217, 119, 69, 0.1);
}

.question-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.question-number {
  font-size: 11px;
  font-weight: 700;
  color: #d97745;
}

.difficulty-badge {
  font-size: 10px;
  padding: 2px 6px;
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
  font-size: 13px;
  color: #2d2521;
  margin: 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.question-labels {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.label-tag {
  font-size: 10px;
  padding: 2px 6px;
  background: #efe7dc;
  color: #7b6a5b;
  border-radius: 4px;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: #8a7461;
  font-size: 13px;
}
</style>
