<script setup lang="ts">
interface FollowUpItem {
  question: string
  answer: string
}

defineProps<{
  followUp: FollowUpItem[]
}>()
</script>

<template>
  <section v-if="followUp.length" class="followup-section">
    <h2 class="section-title">高频追问</h2>
    <div class="followup-list">
      <div
        v-for="(item, idx) in followUp"
        :key="idx"
        class="followup-item"
      >
        <div class="followup-q">{{ item.question }}</div>
        <div class="followup-a">{{ item.answer }}</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.followup-section {
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

.followup-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.followup-item {
  background: #faf5ef;
  border-left: 3px solid #d97745;
  border-radius: 0 6px 6px 0;
  padding: 12px 14px;
}

.followup-q {
  font-size: 13px;
  color: #2d2521;
  font-weight: 600;
  margin-bottom: 8px;
}

.followup-a {
  font-size: 12px;
  color: #5a4a3a;
  line-height: 1.6;
  white-space: pre-wrap;
}
</style>
