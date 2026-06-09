<script setup lang="ts">
defineProps<{
  answerContent: string
}>()
</script>

<template>
  <section class="answer-section">
    <h2 class="section-title">参考答案</h2>
    <div class="answer-content" v-safe-html="answerContent.replace(/\n/g, '<br>')"></div>
  </section>
</template>

<style scoped>
.answer-section {
  margin-bottom: 28px;
}

.section-title {
  font-size: 14px;
  font-weight: 700;
  color: #2d2521;
  margin: 0 0 14px;
  padding-bottom: 8px;
  border-bottom: 2px solid #d97745;
  display: inline-block;
}

.answer-content {
  font-size: 14px;
  line-height: 1.8;
  color: #3a3028;
  white-space: pre-wrap;
}
</style>
