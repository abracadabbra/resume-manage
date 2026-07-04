<script setup lang="ts">
import { computed, ref } from 'vue'
import { useResumeStore } from '@/stores/resume'
import {
  runAtsCheck,
  getAtsScoreLevel,
  getAtsScoreLabel,
  getAtsSeverityLabel,
  type AtsCheckResult,
} from '@/services/atsCheckService'

const resumeStore = useResumeStore()

const isExpanded = ref(false)
const result = ref<AtsCheckResult | null>(null)

const checkInput = computed(() => ({
  basicInfo: resumeStore.basicInfo,
  educationList: resumeStore.educationList,
  workList: resumeStore.workList,
  projectList: resumeStore.projectList,
  awardList: resumeStore.awardList,
  skills: resumeStore.skills,
  selfIntro: resumeStore.selfIntro,
}))

const overallLevel = computed(() =>
  result.value ? getAtsScoreLevel(result.value.overallScore) : 'none',
)

const overallLabel = computed(() =>
  result.value ? getAtsScoreLabel(result.value.overallScore) : '',
)

function handleRun() {
  result.value = runAtsCheck(checkInput.value)
}

function handleRerun() {
  handleRun()
}

function handleDiscard() {
  result.value = null
  isExpanded.value = false
}
</script>

<template>
  <div class="ats-check">
    <button
      v-if="!isExpanded"
      class="trigger-btn"
      type="button"
      @click="isExpanded = true"
    >
      <span class="trigger-icon">A</span>
      ATS 友好度检测
    </button>

    <div v-else class="ats-panel">
      <div class="ats-header">
        <div>
          <h3 class="ats-title">ATS 友好度检测</h3>
          <p class="ats-desc">
            检测简历是否符合 ATS（求职者追踪系统）规范，避免被机器筛选过滤。纯本地规则校验，即时出结果。
          </p>
        </div>
        <button class="close-btn" type="button" @click="handleDiscard">×</button>
      </div>

      <div class="ats-actions">
        <button class="run-btn" type="button" @click="handleRun">
          {{ result ? '重新检测' : '开始检测' }}
        </button>
        <span class="hint-text">检测联系方式、字段完整性、时间格式、内容可解析性</span>
      </div>

      <div v-if="result" class="result-card">
        <div class="score-row">
          <div class="score-block" :class="`level-${overallLevel}`">
            <div class="score-value">{{ result.overallScore }}</div>
            <div class="score-unit">/ 100</div>
          </div>
          <div class="score-meta">
            <div class="score-label" :class="`level-${overallLevel}`">{{ overallLabel }}</div>
            <p class="score-summary">{{ result.summary }}</p>
            <div class="stat-pills">
              <span v-if="result.criticalCount" class="pill pill-critical">
                严重 {{ result.criticalCount }}
              </span>
              <span v-if="result.warningCount" class="pill pill-warning">
                警告 {{ result.warningCount }}
              </span>
              <span class="pill pill-info">
                建议 {{ result.issues.length - result.criticalCount - result.warningCount }}
              </span>
            </div>
          </div>
        </div>

        <div v-if="result.issues.length === 0" class="all-passed">
          未发现 ATS 问题，简历可直接投递
        </div>

        <div v-else class="issue-list">
          <div
            v-for="(item, index) in result.issues"
            :key="`ats-issue-${index}`"
            class="issue-item"
            :class="`severity-${item.severity}`"
          >
            <div class="issue-head">
              <span class="severity-tag" :class="`severity-${item.severity}`">
                {{ getAtsSeverityLabel(item.severity) }}
              </span>
              <span class="issue-category">{{ item.category }}</span>
              <span v-if="item.field" class="issue-field">{{ item.field }}</span>
            </div>
            <p class="issue-problem">{{ item.problem }}</p>
            <p class="issue-suggestion">建议：{{ item.suggestion }}</p>
          </div>
        </div>

        <div class="confirm-row">
          <button class="regenerate-btn" type="button" @click="handleRerun">重新检测</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ats-check {
  display: flex;
}

.trigger-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid #ddcfbf;
  border-radius: 8px;
  background: #fff;
  color: #2d2521;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.trigger-btn:hover {
  border-color: #d97745;
  box-shadow: 0 6px 16px rgba(217, 119, 69, 0.08);
}

.trigger-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: #f2ece6;
  font-size: 11px;
  font-weight: 700;
  color: #7b6a5b;
}

.ats-panel {
  flex: 1;
  border: 1px solid #e8e0d5;
  border-radius: 10px;
  background: #fff;
  padding: 14px;
}

.ats-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.ats-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #2d2521;
}

.ats-desc {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: #7b6a5b;
}

.close-btn {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 50%;
  background: #f2ece6;
  color: #7b6a5b;
  font-size: 16px;
  cursor: pointer;
  line-height: 1;
  flex-shrink: 0;
}

.ats-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.run-btn,
.regenerate-btn {
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  padding: 9px 14px;
  cursor: pointer;
}

.run-btn {
  background: #d97745;
  color: #fff;
}

.regenerate-btn {
  background: #f4eee8;
  color: #6a5748;
}

.hint-text {
  font-size: 12px;
  color: #8a7461;
}

.result-card {
  margin-top: 12px;
  border: 1px solid #eadfd2;
  border-radius: 10px;
  background: #faf8f5;
  padding: 12px;
}

.score-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #eadfd2;
}

.score-block {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding: 6px 14px;
  border-radius: 8px;
  min-width: 96px;
  justify-content: center;
}

.score-value {
  font-size: 32px;
  font-weight: 700;
  line-height: 1;
}

.score-unit {
  font-size: 12px;
  color: #8a7258;
}

.score-block.level-excellent,
.score-block.level-good {
  background: #eef8f1;
  color: #2b7a45;
}

.score-block.level-fair {
  background: #fff7e6;
  color: #b27d12;
}

.score-block.level-weak,
.score-block.level-poor {
  background: #fff1ec;
  color: #b74a30;
}

.score-meta {
  flex: 1;
  min-width: 0;
}

.score-label {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 4px;
}

.score-label.level-excellent,
.score-label.level-good {
  color: #2b7a45;
}

.score-label.level-fair {
  color: #b27d12;
}

.score-label.level-weak,
.score-label.level-poor {
  color: #b74a30;
}

.score-summary {
  margin: 0 0 6px;
  font-size: 12px;
  line-height: 1.55;
  color: #40362d;
}

.stat-pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.pill-critical {
  background: #fff1ec;
  color: #b74a30;
}

.pill-warning {
  background: #fff7e6;
  color: #b27d12;
}

.pill-info {
  background: #f2ece6;
  color: #7b6a5b;
}

.all-passed {
  margin-top: 14px;
  padding: 16px;
  border: 1px solid #c8e6cf;
  border-radius: 8px;
  background: #eef8f1;
  color: #2b7a45;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
}

.issue-list {
  margin-top: 14px;
  display: grid;
  gap: 8px;
}

.issue-item {
  border: 1px solid #eadfd2;
  border-radius: 8px;
  background: #fff;
  padding: 10px 12px;
}

.issue-item.severity-critical {
  border-color: #f0d2c8;
  background: #fff5f1;
}

.issue-item.severity-warning {
  border-color: #f0e0c8;
  background: #fffaef;
}

.issue-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.severity-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
}

.severity-tag.severity-critical {
  background: #b74a30;
}

.severity-tag.severity-warning {
  background: #b27d12;
}

.severity-tag.severity-info {
  background: #8a7461;
}

.issue-category {
  font-size: 11px;
  font-weight: 600;
  color: #7b6a5b;
}

.issue-field {
  font-size: 11px;
  color: #a08c7b;
  font-family: monospace;
}

.issue-problem {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: #2d2521;
  font-weight: 500;
}

.issue-suggestion {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: #6a5748;
}

.confirm-row {
  margin-top: 12px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
