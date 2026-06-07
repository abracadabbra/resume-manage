<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
import {
  useQuestionBankStore,
  type PracticeMastery,
  type PracticeMasteryFilter,
  type QuestionSource,
  type QuestionSourceFilter,
  type QuestionViewFilter,
} from '@/stores/questionBank'

const store = useQuestionBankStore()
const questionItemRefs = new Map<string, HTMLLIElement>()

const difficultyOptions = [
  { value: null, label: '全部难度' },
  { value: 'basic', label: '基础' },
  { value: 'intermediate', label: '中等' },
  { value: 'advanced', label: '高级' },
]

const viewOptions = computed<{ value: QuestionViewFilter; label: string; count?: number }[]>(() => [
  { value: 'all', label: '全部题目' },
  { value: 'resume-generated', label: 'AI 生成' },
  { value: 'review', label: '待复习', count: store.reviewQuestionCount },
])

const sourceOptions: Array<{ value: QuestionSourceFilter; label: string }> = [
  { value: 'all', label: '全部来源' },
  { value: 'bundled', label: '内置题库' },
  { value: 'manual', label: '手动添加' },
  { value: 'resume-generated', label: '简历生成' },
  { value: 'project-generated', label: '项目生成' },
  { value: 'interview-review', label: '面试复盘' },
]

const masteryOptions: Array<{ value: PracticeMasteryFilter; label: string }> = [
  { value: 'all', label: '全部掌握状态' },
  { value: 'unpracticed', label: '未练' },
  { value: 'practicing', label: '练过' },
  { value: 'mastered', label: '熟练' },
  { value: 'weak', label: '薄弱' },
]

const labelOptions = computed(() => [
  { value: '', label: '全部标签' },
  ...store.availableLabels.map((label) => ({ value: label, label })),
])

const projectOptions = computed(() => [
  { value: '', label: '全部项目' },
  ...store.availableProjectNames.map((projectName) => ({ value: projectName, label: projectName })),
])

const techStackOptions = computed(() => [
  { value: '', label: '全部技术栈' },
  ...store.availableTechStacks.map((techStack) => ({ value: techStack, label: techStack })),
])

const difficultyClass: Record<string, string> = {
  basic: 'diff-basic',
  intermediate: 'diff-intermediate',
  advanced: 'diff-advanced',
}

const masteryMeta: Record<PracticeMastery, { label: string; className: string }> = {
  unpracticed: { label: '未练', className: 'mastery-unpracticed' },
  practicing: { label: '练过', className: 'mastery-practicing' },
  mastered: { label: '熟练', className: 'mastery-mastered' },
  weak: { label: '薄弱', className: 'mastery-weak' },
}

function getMastery(questionId: string): PracticeMastery {
  return store.getPracticeRecord(questionId).mastery
}

function handleSourceFilterChange(value: string) {
  store.setSourceFilter(value as QuestionSourceFilter)
}

function handleMasteryFilterChange(value: string) {
  store.setMasteryFilter(value as PracticeMasteryFilter)
}

function getSourceLabel(source?: QuestionSource): string {
  switch (source) {
    case 'bundled':
      return '内置'
    case 'manual':
      return '手动'
    case 'resume-generated':
      return '简历'
    case 'project-generated':
      return '项目'
    case 'interview-review':
      return '复盘'
    default:
      return '题库'
  }
}

const hasActiveAdvancedFilters = computed(() =>
  Boolean(store.difficultyFilter)
  || store.sourceFilter !== 'all'
  || store.masteryFilter !== 'all'
  || Boolean(store.labelFilter)
  || Boolean(store.projectNameFilter)
  || Boolean(store.techStackFilter),
)

function setQuestionItemRef(id: string, element: unknown) {
  if (element instanceof HTMLLIElement) {
    questionItemRefs.set(id, element)
    return
  }
  questionItemRefs.delete(id)
}

watch(
  () => [store.selectedQuestionId, store.filteredQuestions.map((item) => item.id).join(',')],
  async () => {
    await nextTick()
    if (!store.selectedQuestionId) return
    questionItemRefs.get(store.selectedQuestionId)?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    })
  },
)
</script>

<template>
  <div class="question-list">
    <div class="list-header">
      <input
        type="text"
        class="search-input"
        placeholder="搜索题目 / 答案 / 标签 / 项目 / 技术栈"
        :value="store.searchQuery"
        @input="store.setSearchQuery(($event.target as HTMLInputElement).value)"
      />
      <div class="filter-row">
        <div class="source-segments" role="tablist" aria-label="题目视图筛选">
          <button
            v-for="opt in viewOptions"
            :key="opt.value"
            type="button"
            class="segment-btn"
            :class="{ active: store.viewFilter === opt.value }"
            @click="store.setViewFilter(opt.value)"
          >
            <span>{{ opt.label }}</span>
            <span v-if="typeof opt.count === 'number'" class="segment-count">{{ opt.count }}</span>
          </button>
        </div>
      </div>
      <div class="advanced-grid">
        <select
          class="filter-select"
          :value="store.difficultyFilter ?? ''"
          @change="store.setDifficultyFilter(($event.target as HTMLSelectElement).value || null)"
        >
          <option v-for="opt in difficultyOptions" :key="`difficulty-${String(opt.value)}`" :value="opt.value ?? ''">
            {{ opt.label }}
          </option>
        </select>
        <select
          class="filter-select"
          :value="store.sourceFilter"
          @change="handleSourceFilterChange(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="opt in sourceOptions" :key="`source-${opt.value}`" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <select
          class="filter-select"
          :value="store.masteryFilter"
          @change="handleMasteryFilterChange(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="opt in masteryOptions" :key="`mastery-${opt.value}`" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <select
          class="filter-select"
          :value="store.labelFilter ?? ''"
          @change="store.setLabelFilter(($event.target as HTMLSelectElement).value || null)"
        >
          <option v-for="opt in labelOptions" :key="`label-${opt.value || 'all'}`" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <select
          class="filter-select"
          :value="store.projectNameFilter ?? ''"
          @change="store.setProjectNameFilter(($event.target as HTMLSelectElement).value || null)"
        >
          <option v-for="opt in projectOptions" :key="`project-${opt.value || 'all'}`" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <select
          class="filter-select"
          :value="store.techStackFilter ?? ''"
          @change="store.setTechStackFilter(($event.target as HTMLSelectElement).value || null)"
        >
          <option v-for="opt in techStackOptions" :key="`tech-${opt.value || 'all'}`" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>
      <button
        type="button"
        class="clear-btn"
        :disabled="!hasActiveAdvancedFilters"
        @click="store.clearAdvancedFilters()"
      >
        清空筛选
      </button>
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
        :ref="(element) => setQuestionItemRef(q.id, element)"
        class="question-item"
        :class="{ active: store.selectedQuestionId === q.id }"
        @click="store.selectQuestion(q.id)"
      >
        <div class="question-header">
          <span class="question-number">Q{{ q.number }}</span>
          <span class="difficulty-badge" :class="difficultyClass[q.difficulty]">
            {{ q.difficulty === 'basic' ? '基础' : q.difficulty === 'intermediate' ? '中等' : '高级' }}
          </span>
          <span class="mastery-badge" :class="masteryMeta[getMastery(q.id)].className">
            {{ masteryMeta[getMastery(q.id)].label }}
          </span>
        </div>
        <p class="question-title">{{ q.title }}</p>
        <div v-if="q.labels.length" class="question-labels">
          <span class="label-tag source-tag">{{ getSourceLabel(q.source) }}</span>
          <span v-for="label in q.labels" :key="label" class="label-tag">{{ label }}</span>
          <span
            v-for="projectName in q.projectNames?.slice(0, 2) ?? []"
            :key="`project-${projectName}`"
            class="label-tag project-tag"
          >
            {{ projectName }}
          </span>
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

.filter-row {
  display: flex;
  gap: 8px;
}

.source-segments {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  width: 100%;
  padding: 2px;
  border: 1px solid #e0d2c1;
  border-radius: 8px;
  background: #f8f5f0;
}

.segment-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #7b6a5b;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.segment-count {
  min-width: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: rgba(123, 106, 91, 0.12);
  font-size: 10px;
  line-height: 16px;
}

.segment-btn.active {
  background: #fff;
  color: #2d2521;
  box-shadow: 0 1px 2px rgba(45, 37, 33, 0.08);
}

.segment-btn.active .segment-count {
  background: rgba(217, 119, 69, 0.12);
  color: #a5542d;
}

.advanced-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.filter-select {
  width: 100%;
  min-width: 0;
  padding: 7px 10px;
  border: 1px solid #e0d2c1;
  border-radius: 6px;
  font-size: 12px;
  background: #fff;
  color: #2d2521;
  cursor: pointer;
  outline: none;
}

.filter-select:focus {
  border-color: #d97745;
}

.clear-btn {
  min-height: 32px;
  border: 1px solid #e0d2c1;
  border-radius: 6px;
  background: #fff;
  color: #7b6a5b;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.clear-btn:hover:not(:disabled) {
  border-color: #d97745;
  color: #d97745;
  background: #fffaf7;
}

.clear-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
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

.mastery-badge {
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

.mastery-unpracticed {
  background: #f4f1ed;
  color: #7b6a5b;
}

.mastery-practicing {
  background: #fff4e5;
  color: #c26d14;
}

.mastery-mastered {
  background: #e7f7ef;
  color: #138a4a;
}

.mastery-weak {
  background: #fdeaea;
  color: #c43d3d;
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

.source-tag {
  background: #f4efe8;
  color: #8a7461;
}

.project-tag {
  background: #eef4ff;
  color: #48699d;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: #8a7461;
  font-size: 13px;
}
</style>
