<script setup lang="ts">
import { useTechInterviewQuestionsStore } from '@/stores/techInterviewQuestions'

const store = useTechInterviewQuestionsStore()
</script>

<template>
  <div class="question-detail">
    <template v-if="store.selectedQuestion">
      <div class="detail-header">
        <div class="freq-badge" :class="{ hot: store.selectedQuestion.f >= 5 }">
          {{ store.selectedQuestion.f }} 次提及
        </div>
        <h3 class="question-text">{{ store.selectedQuestion.q }}</h3>
      </div>

      <div class="detail-meta">
        <div v-if="store.selectedQuestion.c.length" class="meta-section">
          <span class="meta-label">涉及公司</span>
          <div class="company-tags">
            <span
              v-for="company in store.selectedQuestion.c"
              :key="company"
              class="company-tag"
            >
              {{ company }}
            </span>
          </div>
        </div>

        <div class="meta-section">
          <span class="meta-label">当前分类</span>
          <span class="category-name-text">
            {{ store.categories.find((c) => c.id === store.activeCategoryId)?.name ?? '全部分类' }}
          </span>
        </div>
      </div>

      <div class="detail-footer">
        <p class="footer-hint">来自真实面经 · 参考答案整理中</p>
      </div>
    </template>

    <template v-else>
      <div class="empty-detail">
        <p class="empty-icon">📋</p>
        <p class="empty-text">选择一道题目查看详情</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.question-detail {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  background: #fff;
}

.detail-header {
  margin-bottom: 24px;
}

.freq-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  background: #fff4e5;
  color: #d97745;
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 12px;
}

.freq-badge.hot {
  background: #fde8e8;
  color: #c62828;
}

.question-text {
  font-size: 18px;
  font-weight: 600;
  color: #2d2521;
  line-height: 1.6;
  margin: 0;
}

.detail-meta {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  background: #faf8f5;
  border-radius: 12px;
  border: 1px solid #e8e0d5;
}

.meta-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.meta-label {
  font-size: 11px;
  font-weight: 600;
  color: #9b8a7c;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.company-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.company-tag {
  padding: 4px 10px;
  border-radius: 6px;
  background: #eef4ff;
  color: #48699d;
  font-size: 12px;
  font-weight: 600;
}

.category-name-text {
  font-size: 13px;
  color: #4a4035;
  font-weight: 600;
}

.detail-footer {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #e8e0d5;
}

.footer-hint {
  font-size: 12px;
  color: #9b8a7c;
  margin: 0;
}

.empty-detail {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin: 0 0 12px;
}

.empty-text {
  font-size: 14px;
  color: #9b8a7c;
  margin: 0;
}
</style>
