<script setup lang="ts">
import JdSelector from './JdSelector.vue'
import JdQuestionList from './JdQuestionList.vue'
import JdQuestionDetail from './JdQuestionDetail.vue'
import JdAdder from './JdAdder.vue'

import { useJdProfileStore } from '@/stores/jdProfile'

const store = useJdProfileStore()
</script>

<template>
  <div class="jd-special-panel">
    <div class="panel-body">
      <JdSelector />
      <JdQuestionList />
      <JdQuestionDetail />
    </div>
    <JdAdder />
  </div>
</template>

<style scoped>
.jd-special-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  min-width: 0;
}

.panel-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-width: 0;
}
</style>
