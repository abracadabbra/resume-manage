<script setup lang="ts">
import { useQuestionBankStore } from '@/stores/questionBank'
import QuestionChapterNav from './QuestionChapterNav.vue'
import QuestionList from './QuestionList.vue'
import QuestionDetail from './QuestionDetail.vue'
import QuestionAdder from './QuestionAdder.vue'

const store = useQuestionBankStore()
</script>

<template>
  <div class="question-bank-panel">
    <QuestionAdder />
    <div class="bank-body">
      <QuestionChapterNav />
      <QuestionList />
      <QuestionDetail />
    </div>
  </div>
</template>

<style scoped>
.question-bank-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  min-width: 0;
}

.bank-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-width: 0;
}
</style>
