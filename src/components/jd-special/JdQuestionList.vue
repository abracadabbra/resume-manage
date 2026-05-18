<script setup lang="ts">
import { useJdProfileStore } from '@/stores/jdProfile'

const store = useJdProfileStore()
</script>

<template>
  <div class="jd-question-list">
    <template v-if="store.activeProfile">
      <div class="list-header">
        <span class="question-count">共 {{ store.activeProfile.questions.length }} 题</span>
      </div>
      <ul class="question-items">
        <li
          v-for="(q, idx) in store.activeProfile.questions"
          :key="q.id"
          class="question-item"
          :class="{ active: store.selectedQuestionId === q.id }"
          @click="store.selectQuestion(q.id)"
        >
          <span class="q-index">{{ idx + 1 }}</span>
          <span class="q-title">{{ q.title }}</span>
          <span class="q-diff" :class="'diff-' + q.difficulty"></span>
        </li>
      </ul>
      <div v-if="store.activeProfile.questions.length === 0" class="empty-state">
        <p>还没有题目，点击上方"添加题目"开始</p>
      </div>
    </template>
    <div v-else class="empty-state">
      <p>请先选择或创建一个 JD</p>
    </div>
  </div>
</template>

<style scoped>
.jd-question-list {
  width: 260px;
  min-width: 260px;
  border-right: 1px solid #e8e0d5;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: #faf8f5;
}

.list-header {
  padding: 14px 16px 10px;
  border-bottom: 1px solid #e8e0d5;
}

.question-count {
  font-size: 12px;
  color: #8a7461;
}

.question-items {
  list-style: none;
  margin: 0;
  padding: 8px 0;
}

.question-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.15s;
}

.question-item:hover {
  background: #efe7dc;
}

.question-item.active {
  background: #d97745;
}

.question-item.active .q-title {
  color: #fff;
}

.question-item.active .q-index {
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
}

.question-item.active .q-diff {
  opacity: 0.8;
}

.q-index {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #e8e0d5;
  color: #7b6a5b;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.q-title {
  flex: 1;
  font-size: 13px;
  color: #2d2521;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.q-diff {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.diff-basic {
  background: #2e7d32;
}

.diff-intermediate {
  background: #f57f17;
}

.diff-advanced {
  background: #c62828;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #8a7461;
  font-size: 13px;
  padding: 20px;
  text-align: center;
}

.empty-state p {
  margin: 0;
}
</style>
