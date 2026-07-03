<script setup lang="ts">
import { ref, computed } from 'vue'
import { RecycleScroller } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import { useTechInterviewQuestionsStore, type TechInterviewQuestion } from '@/stores/techInterviewQuestions'
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

/**
 * 按 item 估算行高，传给 RecycleScroller 动态布局。
 * - header 高：1 行 mini-tag 24px；若公司 ≥4（+ more-chip 多一行）→ +22px
 * - 文本：每行 18px，按字符数 / 28 估行数（中文 / 字母混合），最多 2 行
 * - padding 上下 20px + row 间隔 6px
 * 与 QuestionListItem.vue 中的 itemSize 公式保持一致，避免视觉跳动。
 */
function estimateItemSize(item: TechInterviewQuestion): number {
  const HEADER_BASE = 24
  const HEADER_EXTRA = 22
  const PADDING_Y = 20
  const ROW_GAP = 6
  const LINE_H = 18
  const MAX_LINES = 2
  const charLen = item.q.length
  const lines = Math.min(MAX_LINES, Math.max(1, Math.ceil(charLen / 28)))
  const headerH = HEADER_BASE + (item.c.length >= 4 ? HEADER_EXTRA : 0)
  return headerH + lines * LINE_H + PADDING_Y + ROW_GAP
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

    <!-- 题目列表（虚拟滚动） -->
    <div class="questions-scroll">
      <RecycleScroller
        v-if="store.filteredQuestions.length > 0"
        class="scroller"
        :items="store.filteredQuestions"
        :item-size="estimateItemSize as unknown as number"
        key-field="id"
        v-slot="{ item, index }: { item: TechInterviewQuestion; index: number }"
      >
        <QuestionListItem
          :question="item"
          :index="index"
          :active="store.selectedQuestionId === item.id"
          :highlight="store.searchQueryDebounced.trim()"
        />
      </RecycleScroller>
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
  overflow: hidden;
}

.scroller {
  width: 100%;
  height: 100%;
  padding: 8px;
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