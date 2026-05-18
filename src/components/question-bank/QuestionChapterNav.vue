<script setup lang="ts">
import { useQuestionBankStore } from '@/stores/questionBank'

const store = useQuestionBankStore()
</script>

<template>
  <nav class="chapter-nav">
    <div class="nav-header">
      <h2 class="nav-title">面试题库</h2>
      <span class="question-count">共 {{ store.questions.length }} 题</span>
    </div>

    <button
      class="chapter-item"
      :class="{ active: store.activeChapterId === null }"
      @click="store.selectChapter(null)"
    >
      <span class="chapter-name">全部章节</span>
      <span class="count">{{ store.questions.length }}</span>
    </button>

    <ul class="chapter-list">
      <li v-for="chapter in store.chapters" :key="chapter.id">
        <button
          class="chapter-item"
          :class="{ active: store.activeChapterId === chapter.id }"
          @click="store.selectChapter(chapter.id)"
        >
          <span class="chapter-name">{{ chapter.shortName }}</span>
          <span class="count">{{ store.questionCountByChapter[chapter.id] ?? 0 }}</span>
        </button>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.chapter-nav {
  width: 160px;
  min-width: 160px;
  background: #f8f5f0;
  border-right: 1px solid #e8e0d5;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.nav-header {
  padding: 16px 14px 12px;
  border-bottom: 1px solid #e8e0d5;
}

.nav-title {
  font-size: 14px;
  font-weight: 700;
  color: #2d2521;
  margin: 0 0 4px;
}

.question-count {
  font-size: 11px;
  color: #8a7461;
}

.chapter-list {
  list-style: none;
  margin: 0;
  padding: 8px 0;
}

.chapter-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  color: #4a4035;
  transition: background 0.15s;
}

.chapter-item:hover {
  background: #efe7dc;
}

.chapter-item.active {
  background: #d97745;
  color: #fff;
}

.chapter-item.active .count {
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
}

.chapter-name {
  flex: 1;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.count {
  font-size: 10px;
  background: #e8e0d5;
  color: #7b6a5b;
  padding: 2px 6px;
  border-radius: 10px;
  margin-left: 8px;
}
</style>
