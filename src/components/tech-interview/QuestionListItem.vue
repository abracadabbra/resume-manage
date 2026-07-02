<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTechInterviewQuestionsStore, type TechInterviewQuestion } from '@/stores/techInterviewQuestions'

const props = defineProps<{
  question: TechInterviewQuestion
  index: number
  active: boolean
  highlight?: string
}>()

const store = useTechInterviewQuestionsStore()

const MASTERY_OPTIONS = ['unpracticed', 'practicing', 'mastered', 'weak'] as const
const MASTERY_LABELS: Record<string, string> = {
  unpracticed: '未练',
  practicing: '练过',
  mastered: '熟练',
  weak: '薄弱',
}
const MASTERY_CLASSES: Record<string, string> = {
  unpracticed: 'mst-unpracticed',
  practicing: 'mst-practicing',
  mastered: 'mst-mastered',
  weak: 'mst-weak',
}

function getFreqClass(f: number): string {
  if (f >= 5) return 'freq-hot'
  if (f >= 3) return 'freq-high'
  return 'freq-normal'
}

const practice = computed(() => store.getPracticeRecord(props.question.id))

function getMasteryClass(): string {
  return MASTERY_CLASSES[practice.value.mastery] ?? 'mst-unpracticed'
}

function getMasteryLabel(): string {
  return MASTERY_LABELS[practice.value.mastery] ?? '未练'
}

const localMenuOpen = ref(false)

function onSelect() {
  store.selectQuestion(props.question)
}

function toggleMenu(e: Event) {
  e.stopPropagation()
  localMenuOpen.value = !localMenuOpen.value
}

function pickMastery(e: Event, m: typeof MASTERY_OPTIONS[number]) {
  e.stopPropagation()
  store.setPracticeMastery(props.question.id, m)
  localMenuOpen.value = false
}

/** HTML 实体转义，防止 highlight 来源不可信（虽实际来自 searchQuery，但渲染走 v-html） */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 把字符串按 highlight（不区分大小写）切分，把命中片段包成 `<mark>`。
 * - 无 highlight 或 highlight 为空：返回原文本（转义后）
 * - highlight 出现在 q 或任一 c 中都视作命中
 */
function buildHighlightedHtml(text: string): string {
  const escaped = escapeHtml(text)
  const q = (props.highlight ?? '').trim()
  if (!q) return escaped
  const safe = escapeHtml(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(${safe})`, 'gi')
  return escaped.replace(re, '<mark class="search-hit">$1</mark>')
}

const highlightedQuestionHtml = computed(() => buildHighlightedHtml(props.question.q))
</script>

<template>
  <div
    class="question-item"
    :class="{ active }"
    :data-index="index"
    @click="onSelect"
  >
    <div class="question-header">
      <span v-if="question.f >= 5" class="hot-star" title="高频热题">⭐</span>
      <span class="freq-pill" :class="getFreqClass(question.f)">{{ question.f }}次</span>
      <span v-for="company in question.c.slice(0, 3)" :key="company" class="mini-tag">
        {{ company }}
      </span>
      <span v-if="question.c.length > 3" class="mini-tag mini-more">+{{ question.c.length - 3 }}</span>
      <span class="mastery-chip-wrap">
        <button
          class="mastery-chip"
          :class="getMasteryClass()"
          type="button"
          @click.stop="toggleMenu"
        >
          {{ getMasteryLabel() }}
        </button>
        <div v-if="localMenuOpen" class="mastery-menu">
          <button
            v-for="m in MASTERY_OPTIONS"
            :key="m"
            class="mastery-menu-item"
            :class="MASTERY_CLASSES[m]"
            type="button"
            @click="pickMastery($event, m)"
          >
            {{ MASTERY_LABELS[m] }}
          </button>
        </div>
      </span>
    </div>
    <p class="question-text" v-html="highlightedQuestionHtml"></p>
  </div>
</template>

<style scoped>
.question-item {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 4px;
  border: 1px solid transparent;
  transition: all 0.15s;
  background: transparent;
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

.hot-star {
  font-size: 12px;
  line-height: 1;
  margin-right: -2px;
}

.freq-hot { background: #fde8e8; color: #c62828; }
.freq-high { background: #fff4e5; color: #d97745; }
.freq-normal { background: #f4f1ed; color: #7b6a5b; }

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

.question-text :deep(mark.search-hit) {
  background: #fff3a3;
  color: #5a3e00;
  padding: 0 2px;
  border-radius: 3px;
}

.mastery-chip-wrap {
  position: relative;
  margin-left: auto;
}

.mastery-chip {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid transparent;
}

.mst-unpracticed { background: #f4f1ed; color: #9b8a7c; }
.mst-practicing { background: #eef4ff; color: #48699d; }
.mst-mastered { background: #f2f7f1; color: #43764d; }
.mst-weak { background: #fde8e8; color: #c62828; }

.mastery-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  background: #fff;
  border: 1px solid #e0d2c1;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 100;
  overflow: hidden;
}

.mastery-menu-item {
  display: block;
  width: 100%;
  padding: 6px 14px;
  border: none;
  background: none;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}

.mastery-menu-item.mst-unpracticed:hover { background: #f4f1ed; color: #9b8a7c; }
.mastery-menu-item.mst-practicing:hover { background: #eef4ff; color: #48699d; }
.mastery-menu-item.mst-mastered:hover { background: #f2f7f1; color: #43764d; }
.mastery-menu-item.mst-weak:hover { background: #fde8e8; color: #c62828; }
</style>