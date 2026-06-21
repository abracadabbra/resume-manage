<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTechInterviewQuestionsStore, type TechInterviewQuestion } from '@/stores/techInterviewQuestions'

const store = useTechInterviewQuestionsStore()

const showAllCompanies = ref(false)
const MAX_VISIBLE_COMPANIES = 8

// 显示的公司列表
const visibleCompanies = computed(() => {
  const all = store.availableCompaniesInCategory
  if (showAllCompanies.value || all.length <= MAX_VISIBLE_COMPANIES) {
    return all
  }
  return all.slice(0, MAX_VISIBLE_COMPANIES)
})

const hasMoreCompanies = computed(() =>
  store.availableCompaniesInCategory.length > MAX_VISIBLE_COMPANIES,
)

function handleSelectQuestion(q: TechInterviewQuestion, index: number) {
  store.selectQuestion(q, String(index))
}

function isCompanySelected(company: string): boolean {
  return store.selectedCompanies.includes(company)
}

function getFrequencyClass(f: number): string {
  if (f >= 5) return 'freq-hot'
  if (f >= 3) return 'freq-high'
  return 'freq-normal'
}
</script>

<template>
  <div class="question-list">
    <!-- 搜索框 -->
    <div class="list-header">
      <input
        type="text"
        class="search-input"
        placeholder="搜索面试题 / 公司名"
        :value="store.searchQuery"
        @input="store.setSearchQuery(($event.target as HTMLInputElement).value)"
      />

      <!-- 公司筛选 chips -->
      <div v-if="store.availableCompaniesInCategory.length > 0" class="company-filter">
        <div class="company-chips">
          <button
            class="chip"
            :class="{ active: store.selectedCompanies.length === 0 }"
            @click="store.clearCompanyFilter()"
          >
            全部公司
          </button>
          <button
            v-for="item in visibleCompanies"
            :key="item.name"
            class="chip"
            :class="{ active: isCompanySelected(item.name) }"
            @click="store.toggleCompany(item.name)"
          >
            {{ item.name }}
            <span class="chip-count">{{ item.count }}</span>
          </button>
          <button
            v-if="hasMoreCompanies"
            class="chip chip-more"
            @click="showAllCompanies = !showAllCompanies"
          >
            {{ showAllCompanies ? '收起' : `+${store.availableCompaniesInCategory.length - MAX_VISIBLE_COMPANIES}` }}
          </button>
        </div>
      </div>

      <!-- 排序 + 统计 -->
      <div class="list-toolbar">
        <span class="result-count">
          {{ store.filteredQuestions.length }} 道题
        </span>
        <div class="sort-toggle">
          <button
            class="sort-btn"
            :class="{ active: store.sortBy === 'frequency' }"
            @click="store.setSortBy('frequency')"
          >
            按频次
          </button>
          <button
            class="sort-btn"
            :class="{ active: store.sortBy === 'default' }"
            @click="store.setSortBy('default')"
          >
            默认
          </button>
        </div>
      </div>
    </div>

    <!-- 题目列表 -->
    <ul class="questions">
      <li
        v-for="(q, idx) in store.filteredQuestions"
        :key="idx"
        class="question-item"
        :class="{ active: store.selectedQuestionId === String(idx) }"
        @click="handleSelectQuestion(q, idx)"
      >
        <div class="question-header">
          <span class="freq-pill" :class="getFrequencyClass(q.f)">
            {{ q.f }}次
          </span>
          <span v-for="company in q.c.slice(0, 3)" :key="company" class="mini-tag">
            {{ company }}
          </span>
          <span v-if="q.c.length > 3" class="mini-tag mini-more">+{{ q.c.length - 3 }}</span>
        </div>
        <p class="question-text">{{ q.q }}</p>
      </li>
    </ul>

    <div v-if="store.filteredQuestions.length === 0" class="empty-state">
      <p>没有找到匹配的题目</p>
      <button class="clear-btn" @click="store.clearFilters()">清空筛选</button>
    </div>
  </div>
</template>

<style scoped>
.question-list {
  width: 340px;
  min-width: 340px;
  border-right: 1px solid #e8e0d5;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.list-header {
  padding: 12px;
  border-bottom: 1px solid #e8e0d5;
  display: flex;
  flex-direction: column;
  gap: 10px;
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

.company-filter {
  overflow: hidden;
}

.company-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid #e0d2c1;
  border-radius: 16px;
  background: #fff;
  color: #7b6a5b;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.chip:hover {
  border-color: #d97745;
  color: #d97745;
}

.chip.active {
  border-color: #d97745;
  background: #d97745;
  color: #fff;
}

.chip-count {
  font-size: 9px;
  opacity: 0.7;
}

.chip-more {
  border-style: dashed;
  color: #9b8a7c;
}

.list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.result-count {
  font-size: 12px;
  color: #7b6a5b;
}

.sort-toggle {
  display: flex;
  border: 1px solid #e0d2c1;
  border-radius: 6px;
  overflow: hidden;
}

.sort-btn {
  padding: 4px 10px;
  border: none;
  background: #fff;
  color: #7b6a5b;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.sort-btn.active {
  background: #d97745;
  color: #fff;
}

.questions {
  list-style: none;
  margin: 0;
  padding: 8px;
  overflow-y: auto;
  flex: 1;
}

.question-item {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 4px;
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
  gap: 6px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.freq-pill {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
}

.freq-hot {
  background: #fde8e8;
  color: #c62828;
}

.freq-high {
  background: #fff4e5;
  color: #d97745;
}

.freq-normal {
  background: #f4f1ed;
  color: #7b6a5b;
}

.mini-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #eef4ff;
  color: #48699d;
}

.mini-more {
  background: #f4f1ed;
  color: #9b8a7c;
}

.question-text {
  font-size: 13px;
  color: #2d2521;
  margin: 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: #8a7461;
  font-size: 13px;
}

.clear-btn {
  margin-top: 12px;
  padding: 6px 14px;
  border: 1px solid #d97745;
  border-radius: 6px;
  background: #fff;
  color: #d97745;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
</style>
