<script setup lang="ts">
import { computed } from 'vue'
import { useJdProfileStore } from '@/stores/jdProfile'
import { useResumeStore } from '@/stores/resume'
import {
  extractResumeTechKeywords,
  findKeywordsInJd,
  highlightJdKeywords,
} from '@/services/jdKeywordHighlight'

const jdStore = useJdProfileStore()
const resumeStore = useResumeStore()

const jdText = computed(() => jdStore.activeProfile?.rawText ?? '')

const resumeKeywords = computed(() =>
  extractResumeTechKeywords({
    skills: resumeStore.skills,
    workList: resumeStore.workList,
    projectList: resumeStore.projectList,
  }),
)

const segments = computed(() => highlightJdKeywords(jdText.value, resumeKeywords.value))

const keywordStats = computed(() => findKeywordsInJd(jdText.value, resumeKeywords.value))

const coveredCount = computed(() => keywordStats.value.filter((k) => k.covered).length)
const missingCount = computed(() => keywordStats.value.filter((k) => !k.covered).length)

const hasJdText = computed(() => jdText.value.trim().length > 0)
</script>

<template>
  <div class="jd-highlight">
    <button
      v-if="!hasJdText"
      class="empty-hint"
      type="button"
      disabled
    >
      请先在 JD 列表中选择或新建一个含原文的 JD
    </button>

    <template v-else>
      <div class="stats-bar">
        <span class="stat-item covered">
          已覆盖 <strong>{{ coveredCount }}</strong>
        </span>
        <span class="stat-item missing">
          未覆盖 <strong>{{ missingCount }}</strong>
        </span>
        <span class="stat-hint">关键词高亮：绿色=简历已覆盖，红色=未覆盖</span>
      </div>

      <div class="jd-text">
        <template v-for="(seg, idx) in segments" :key="idx">
          <mark
            v-if="seg.keyword"
            class="jd-keyword"
            :class="{ covered: seg.covered, missing: !seg.covered }"
            :title="seg.covered ? '简历已覆盖' : '简历未覆盖'"
          >{{ seg.text }}</mark>
          <span v-else>{{ seg.text }}</span>
        </template>
      </div>

      <div v-if="keywordStats.length" class="keyword-cloud">
        <span
          v-for="item in keywordStats"
          :key="item.keyword"
          class="cloud-item"
          :class="{ covered: item.covered, missing: !item.covered }"
          :title="`${item.keyword}（出现 ${item.count} 次，${item.covered ? '已覆盖' : '未覆盖'}）`"
        >
          {{ item.keyword }}
          <span class="cloud-count">{{ item.count }}</span>
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.jd-highlight {
  border: 1px solid #e8e0d5;
  border-radius: 10px;
  background: #fff;
  padding: 12px 14px;
}

.empty-hint {
  width: 100%;
  padding: 16px;
  border: 1px dashed #ddcfbf;
  border-radius: 8px;
  background: #faf8f5;
  color: #8a7461;
  font-size: 12px;
  cursor: not-allowed;
}

.stats-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.stat-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.stat-item.covered {
  background: #eef8f1;
  color: #2b7a45;
}

.stat-item.missing {
  background: #fff1ec;
  color: #b74a30;
}

.stat-item strong {
  font-size: 14px;
}

.stat-hint {
  font-size: 11px;
  color: #8a7461;
}

.jd-text {
  font-size: 13px;
  line-height: 1.7;
  color: #3a3028;
  white-space: pre-wrap;
  word-break: break-word;
  background: #faf8f5;
  border: 1px solid #eadfd2;
  border-radius: 8px;
  padding: 12px;
  max-height: 280px;
  overflow-y: auto;
}

.jd-keyword {
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 600;
  cursor: help;
}

.jd-keyword.covered {
  background: #d4edda;
  color: #155724;
}

.jd-keyword.missing {
  background: #f8d7da;
  color: #721c24;
}

.keyword-cloud {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cloud-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  cursor: help;
}

.cloud-item.covered {
  background: #eef8f1;
  color: #2b7a45;
  border: 1px solid #c8e6cf;
}

.cloud-item.missing {
  background: #fff5f1;
  color: #b74a30;
  border: 1px solid #f0d2c8;
}

.cloud-count {
  font-size: 10px;
  opacity: 0.7;
}
</style>
