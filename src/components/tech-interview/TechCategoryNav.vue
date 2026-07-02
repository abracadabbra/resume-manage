<script setup lang="ts">
import { computed } from 'vue'
import { useTechInterviewQuestionsStore } from '@/stores/techInterviewQuestions'

const store = useTechInterviewQuestionsStore()

/** 虚拟分类：薄弱题库 */
const WEAK_CATEGORY_ID = '__weak__'

// 核心技术分类
const coreCategories = computed(() =>
  store.categories.filter((c) =>
    !['project', 'brainteaser', 'other'].includes(c.id),
  ),
)

// 综合分类
const miscCategories = computed(() =>
  store.categories.filter((c) =>
    ['project', 'brainteaser', 'other'].includes(c.id),
  ),
)
</script>

<template>
  <nav class="category-nav">
    <div class="nav-header">
      <h2 class="nav-title">大厂面经</h2>
      <span class="question-count">共 {{ store.allQuestions.length }} 题</span>
    </div>

    <button
      class="category-item"
      :class="{ active: store.activeCategoryId === null }"
      @click="store.selectCategory(null)"
    >
      <span class="category-name">全部分类</span>
      <span class="count">{{ store.allQuestions.length }}</span>
    </button>

    <button
      class="category-item weak-item"
      :class="{ active: store.activeCategoryId === '__weak__' }"
      @click="store.selectCategory('__weak__')"
    >
      <span class="category-name">🔥 薄弱题库</span>
      <span class="count">{{ store.weakQuestions.length }}</span>
    </button>

    <div class="section-label">核心技术</div>
    <ul class="category-list">
      <li v-for="cat in coreCategories" :key="cat.id">
        <button
          class="category-item"
          :class="{ active: store.activeCategoryId === cat.id }"
          @click="store.selectCategory(cat.id)"
        >
          <span class="category-name">{{ cat.name }}</span>
          <span class="count">{{ cat.count }}</span>
        </button>
      </li>
    </ul>

    <div class="section-label">综合分类</div>
    <ul class="category-list">
      <li v-for="cat in miscCategories" :key="cat.id">
        <button
          class="category-item"
          :class="{ active: store.activeCategoryId === cat.id }"
          @click="store.selectCategory(cat.id)"
        >
          <span class="category-name">{{ cat.name }}</span>
          <span class="count">{{ cat.count }}</span>
        </button>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.category-nav {
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

.section-label {
  padding: 10px 14px 4px;
  font-size: 10px;
  font-weight: 600;
  color: #9b8a7c;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.category-list {
  list-style: none;
  margin: 0;
  padding: 0 0 8px;
}

.category-item {
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

.category-item:hover {
  background: #efe7dc;
}

.category-item.active {
  background: #d97745;
  color: #fff;
}

.category-item.active .count {
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
}

.category-name {
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
  flex-shrink: 0;
}
</style>
