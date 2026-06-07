<script setup lang="ts">
import { computed } from 'vue'
import { buildQuestionReviewInsights } from '@/services/questionInsightService'
import { useQuestionBankStore } from '@/stores/questionBank'

const store = useQuestionBankStore()

const chapterNameMap = computed(() =>
  new Map(store.chapters.map((chapter) => [chapter.id, chapter.shortName || chapter.name])),
)

const insights = computed(() =>
  buildQuestionReviewInsights(store.questions, store.practiceRecords),
)

const hasInsightData = computed(() =>
  insights.value.summary.practicedQuestions > 0
  || insights.value.summary.reviewCount > 0
  || insights.value.summary.aiReviewedQuestions > 0,
)

const weakKnowledgeAreas = computed(() =>
  insights.value.weakChapters.map((item) => ({
    ...item,
    label: chapterNameMap.value.get(item.key) ?? item.label,
  })),
)

const reviewQueueIds = computed(() =>
  insights.value.reviewQueue.map((item) => item.questionId),
)

function resetQuestionView() {
  store.selectChapter(null)
  store.clearAdvancedFilters()
  store.setSearchQuery('')
}

function openReviewQueue() {
  resetQuestionView()
  store.setViewFilter('review')
  const first = insights.value.reviewQueue[0]
  if (first) store.selectQuestion(first.questionId)
}

function openWeakQuestions() {
  resetQuestionView()
  store.setViewFilter('all')
  store.setMasteryFilter('weak')
  const weakQuestion = insights.value.reviewQueue.find((item) => item.mastery === 'weak') ?? insights.value.reviewQueue[0]
  if (weakQuestion) store.selectQuestion(weakQuestion.questionId)
}

function openAllQuestions() {
  resetQuestionView()
  store.setViewFilter('all')
}

function jumpToQuestion(questionId: string) {
  resetQuestionView()
  store.setViewFilter('all')
  store.selectQuestion(questionId)
}

function markReviewQueuePracticed() {
  if (reviewQueueIds.value.length === 0) return
  store.batchSetPracticeMastery(reviewQueueIds.value, 'practicing')
}
</script>

<template>
  <section class="review-insights">
    <div class="panel-head">
      <div>
        <h3 class="panel-title">面试复盘面板</h3>
        <p class="panel-desc">把你的刷题记录、薄弱题和 AI 点评汇总成一页，方便决定下一步先补哪里。</p>
      </div>
      <div class="panel-actions">
        <button
          v-if="reviewQueueIds.length > 0"
          type="button"
          class="action-btn"
          @click="markReviewQueuePracticed"
        >
          批量标记练过
        </button>
        <button type="button" class="action-btn primary" @click="openReviewQueue">待复习</button>
        <button type="button" class="action-btn" @click="openWeakQuestions">只看薄弱</button>
        <button type="button" class="action-btn" @click="openAllQuestions">全部题目</button>
      </div>
    </div>

    <div v-if="!hasInsightData" class="empty-state">
      <p class="empty-title">还没有足够的复盘数据</p>
      <p class="empty-desc">先在题库里写几道“我的回答”，或者让 AI 点评几次，这里就会自动长出你的薄弱画像。</p>
    </div>

    <template v-else>
      <div class="summary-grid">
        <div class="summary-metric">
          <span class="metric-label">已练题目</span>
          <strong class="metric-value">{{ insights.summary.practicedQuestions }}</strong>
        </div>
        <div class="summary-metric warn">
          <span class="metric-label">待复习</span>
          <strong class="metric-value">{{ insights.summary.reviewCount }}</strong>
        </div>
        <div class="summary-metric warn-soft">
          <span class="metric-label">薄弱题</span>
          <strong class="metric-value">{{ insights.summary.weakCount }}</strong>
        </div>
        <div class="summary-metric good">
          <span class="metric-label">已掌握</span>
          <strong class="metric-value">{{ insights.summary.masteredCount }}</strong>
        </div>
        <div class="summary-metric">
          <span class="metric-label">AI 平均分</span>
          <strong class="metric-value">
            {{ insights.summary.averageAiScore === null ? '--' : insights.summary.averageAiScore }}
          </strong>
        </div>
      </div>

      <div class="insight-grid">
        <section class="insight-section">
          <h4 class="section-title">最常卡的技术点</h4>
          <div v-if="insights.weakTechStacks.length" class="chip-list">
            <span v-for="item in insights.weakTechStacks" :key="item.key" class="info-chip">
              {{ item.label }} · {{ item.count }}
            </span>
          </div>
          <p v-else class="empty-inline">暂时还看不出明显偏弱的技术点。</p>
        </section>

        <section class="insight-section">
          <h4 class="section-title">最弱项目</h4>
          <div v-if="insights.weakProjects.length" class="chip-list">
            <span v-for="item in insights.weakProjects" :key="item.key" class="info-chip info-chip-project">
              {{ item.label }} · {{ item.count }}
            </span>
          </div>
          <p v-else class="empty-inline">还没有项目维度的薄弱题沉淀出来。</p>
        </section>

        <section class="insight-section">
          <h4 class="section-title">最该补的知识块</h4>
          <div v-if="weakKnowledgeAreas.length" class="chip-list">
            <span v-for="item in weakKnowledgeAreas" :key="item.key" class="info-chip info-chip-knowledge">
              {{ item.label }} · {{ item.count }}
            </span>
          </div>
          <p v-else class="empty-inline">知识块还不够集中，继续练几题会更清晰。</p>
        </section>

        <section class="insight-section">
          <h4 class="section-title">建议下一步</h4>
          <ul class="action-list">
            <li v-for="item in insights.actionItems" :key="item">{{ item }}</li>
          </ul>
        </section>
      </div>

      <section v-if="insights.reviewQueue.length" class="queue-section">
        <div class="queue-head">
          <h4 class="section-title">建议优先回刷</h4>
          <span class="queue-tip">按薄弱程度和 AI 评分排序</span>
        </div>
        <div class="queue-list">
          <button
            v-for="item in insights.reviewQueue"
            :key="item.questionId"
            type="button"
            class="queue-item"
            @click="jumpToQuestion(item.questionId)"
          >
            <div class="queue-item-main">
              <span class="queue-title">{{ item.title }}</span>
              <span class="queue-meta">
                {{ item.mastery === 'weak' ? '薄弱' : '待补回答' }}
                <template v-if="item.aiScore !== null"> · AI {{ item.aiScore }}</template>
              </span>
            </div>
            <div class="queue-tags">
              <span v-for="projectName in item.projectNames.slice(0, 1)" :key="projectName" class="queue-tag project">
                {{ projectName }}
              </span>
              <span v-for="techStack in item.techStacks.slice(0, 2)" :key="techStack" class="queue-tag">
                {{ techStack }}
              </span>
            </div>
          </button>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.review-insights {
  padding: 14px;
  border-bottom: 1px solid #e8e0d5;
  background: #fffdf9;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.panel-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #2d2521;
}

.panel-desc {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #7b6a5b;
  max-width: 720px;
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.action-btn {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid #dfd2c2;
  border-radius: 6px;
  background: #fff;
  color: #6f5d4f;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.action-btn.primary {
  border-color: #d97745;
  background: #fff7f2;
  color: #b45e33;
}

.empty-state {
  padding: 16px;
  border: 1px dashed #e0d2c1;
  border-radius: 8px;
  background: #fff;
}

.empty-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: #4a4035;
}

.empty-desc,
.empty-inline {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #8a7461;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.summary-metric {
  min-width: 0;
  padding: 12px;
  border: 1px solid #eadfce;
  border-radius: 8px;
  background: #fff;
}

.summary-metric.warn {
  background: #fff8f1;
}

.summary-metric.warn-soft {
  background: #fffaf5;
}

.summary-metric.good {
  background: #f5fbf7;
}

.metric-label {
  display: block;
  font-size: 11px;
  color: #8a7461;
}

.metric-value {
  display: block;
  margin-top: 6px;
  font-size: 22px;
  line-height: 1;
  color: #2d2521;
}

.insight-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.insight-section,
.queue-section {
  padding: 12px;
  border: 1px solid #eadfce;
  border-radius: 8px;
  background: #fff;
}

.section-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: #2d2521;
}

.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.info-chip {
  padding: 4px 8px;
  border-radius: 999px;
  background: #f4efe8;
  color: #6f5d4f;
  font-size: 11px;
  line-height: 1.4;
}

.info-chip-project {
  background: #eef4ff;
  color: #476898;
}

.info-chip-knowledge {
  background: #f2f7f1;
  color: #43764d;
}

.action-list {
  margin: 10px 0 0;
  padding-left: 16px;
  color: #4a4035;
  font-size: 12px;
  line-height: 1.7;
}

.queue-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.queue-tip {
  font-size: 11px;
  color: #8a7461;
}

.queue-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.queue-item {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #eadfce;
  border-radius: 8px;
  background: #fffaf6;
  text-align: left;
  cursor: pointer;
}

.queue-item-main {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
}

.queue-title {
  font-size: 12px;
  font-weight: 600;
  color: #2d2521;
  line-height: 1.5;
}

.queue-meta {
  flex-shrink: 0;
  font-size: 11px;
  color: #9b5a37;
}

.queue-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.queue-tag {
  padding: 2px 6px;
  border-radius: 999px;
  background: #f2ede7;
  color: #6f5d4f;
  font-size: 10px;
}

.queue-tag.project {
  background: #edf3ff;
  color: #4f6e9c;
}

@media (max-width: 1100px) {
  .panel-head {
    flex-direction: column;
  }

  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .insight-grid {
    grid-template-columns: 1fr;
  }
}
</style>
