<script setup lang="ts">
import QuestionReviewInsights from '@/components/question-bank/QuestionReviewInsights.vue'

defineEmits<{
  navigateToBank: []
}>()
</script>

<template>
  <div class="interview-review-panel">
    <QuestionReviewInsights @navigate-to-bank="$emit('navigateToBank')" />
  </div>
</template>

<style scoped>
.interview-review-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  background: #fffdf9;
}
</style>
