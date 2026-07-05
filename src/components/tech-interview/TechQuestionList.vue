<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTechInterviewQuestionsStore } from '@/stores/techInterviewQuestions'
import QuestionListItem from './QuestionListItem.vue'

const store = useTechInterviewQuestionsStore()

const showAllCompanies = ref(false)
const MAX_VISIBLE_COMPANIES = 8

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

/** 当前可见公司是否已被全部选中（用于切换「全选/取消」按钮文案） */
const isAllVisibleSelected = computed(() => {
  const allNames = store.availableCompaniesInCategory.map((c) => c.name)
  if (allNames.length === 0) return false
  return allNames.every((name) => store.selectedCompanies.includes(name))
})

function toggleSelectAllVisible() {
  if (isAllVisibleSelected.value) {
    store.clearCompanyFilter()
  } else {
    const names = store.availableCompaniesInCategory.map((c) => c.name)
    store.setSelectedCompanies(names)
  }
}

function isCompanySelected(company: string): boolean {
  return store.selectedCompanies.includes(company)
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
          <button
            class="chip chip-bulk"
            @click="toggleSelectAllVisible"
          >
            {{ isAllVisibleSelected ? '取消全选' : '全选' }}
          </button>
        </div>
      </div>

      <!-- 薄弱题库视图筛选 -->
      <div v-if="store.activeCategoryId === '__weak__'" class="weak-filter">
        <button
          class="chip"
          :class="{ active: store.weakViewFilter === 'all' }"
          @click="store.setWeakViewFilter('all')"
        >
          全部
        </button>
        <button
          class="chip"
          :class="{ active: store.weakViewFilter === 'marked' }"
          @click="store.setWeakViewFilter('marked')"
        >
          我标记的
        </button>
        <button
          class="chip"
          :class="{ active: store.weakViewFilter === 'recommended' }"
          @click="store.setWeakViewFilter('recommended')"
        >
          系统推荐
        </button>
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

    <!-- 题目列表（直接渲染 + CSS contain，撤掉 RecycleScroller 虚拟滚动避免行高问题） -->
    <div class="questions-scroll">
      <div v-if="store.filteredQuestions.length > 0" class="scroller">
        <QuestionListItem
          v-for="(item, index) in store.filteredQuestions"
          :key="item.id"
          :question="item"
          :index="index"
          :active="store.selectedQuestionId === item.id"
          :highlight="store.searchQueryDebounced.trim()"
        />
      </div>
      <div v-else class="empty-state">
        <p>没有找到匹配的题目</p>
        <button class="clear-btn" @click="store.clearFilters()">清空筛选</button>
      </div>
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
  height: 100%;
}

.list-header {
  padding: 12px;
  border-bottom: 1px solid #e8e0d5;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
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

.weak-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
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

.chip-bulk {
  margin-left: auto;
  border-style: solid;
  background: #f5f0ff;
  color: #7c6af0;
  border-color: #d4cef5;
}

.chip-bulk:hover {
  background: #ebe5ff;
  border-color: #7c6af0;
  color: #7c6af0;
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

.questions-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  contain: layout style;
}

.scroller {
  padding: 4px 8px;
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

.clear-btn:hover {
  background: #d97745;
  color: #fff;
}
</style>