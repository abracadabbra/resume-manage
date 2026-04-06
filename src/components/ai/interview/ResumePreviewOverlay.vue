<script setup lang="ts">
import { computed } from 'vue'
import { useResumeStore } from '@/stores/resume'
import { getResumeTemplateByKey, type ResumeTemplateDefinition } from '@/templates/resume'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const store = useResumeStore()

const fallbackTemplate: ResumeTemplateDefinition = getResumeTemplateByKey('default')
const currentTemplate = computed<ResumeTemplateDefinition>(
  () => getResumeTemplateByKey(store.selectedTemplateKey) ?? fallbackTemplate
)
const currentTemplateComponent = computed(() => currentTemplate.value.component)
</script>

<template>
  <section class="resume-overlay">
    <header class="overlay-header">
      <h3 class="overlay-title">简历实时预览</h3>
      <button class="close-btn" type="button" aria-label="关闭简历预览" @click="emit('close')">×</button>
    </header>

    <div class="overlay-body">
      <div class="paper-shell">
        <div class="paper">
          <component :is="currentTemplateComponent" />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.resume-overlay {
  position: absolute;
  right: 12px;
  top: 12px;
  bottom: clamp(150px, 18vh, 210px);
  width: min(760px, calc(100% - 24px));
  border-radius: 14px;
  border: 1px solid #d9ccbd;
  background: #fffefd;
  box-shadow: 0 10px 26px rgba(45, 37, 33, 0.24);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 12;
}

.overlay-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.overlay-title {
  color: #2b2620;
  font-size: 16px;
  font-weight: 700;
}

.close-btn {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  border: none;
  background: #f3eee7;
  color: #7e6f5e;
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}

.overlay-body {
  flex: 1;
  min-height: 0;
  border-radius: 12px;
  background: #ede3d7;
  padding: 10px;
}

.paper-shell {
  width: 100%;
  height: 100%;
  overflow: auto;
}

.paper {
  width: 100%;
  min-height: 100%;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #e8e0d6;
  box-shadow: 0 5px 14px rgba(0, 0, 0, 0.1);
}

.paper :deep([class*='resume-template-']) {
  min-height: 100%;
}

@media (max-width: 1280px) {
  .resume-overlay {
    width: calc(100% - 24px);
    left: 12px;
    right: 12px;
  }
}
</style>
