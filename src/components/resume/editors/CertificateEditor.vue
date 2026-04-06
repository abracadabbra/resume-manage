<script setup lang="ts">
import { useResumeStore } from '@/stores/resume'
import { ref } from 'vue'

const store = useResumeStore()
const collapsed = ref(false)
</script>

<template>
  <section class="editor-section">
    <div class="section-header" @click="collapsed = !collapsed">
      <div class="section-toggle">
        <svg class="chevron" :class="{ rotated: !collapsed }" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <h3>技能证书</h3>
      </div>
    </div>

    <div v-show="!collapsed" class="section-body">
      <div class="form-group">
        <label class="form-label">证书内容</label>
        <textarea
          v-model="store.certificate"
          class="form-textarea"
          rows="6"
          placeholder="请输入技能证书，每行一条..."
        ></textarea>
      </div>
    </div>
  </section>
</template>

<style scoped>
.editor-section {
  margin-bottom: var(--spacing-lg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: white;
  overflow: hidden;
  transition: box-shadow var(--transition-base);
}

.editor-section:hover {
  box-shadow: var(--shadow-sm);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-lg) var(--spacing-xl);
  cursor: pointer;
  user-select: none;
  transition: background var(--transition-fast);
}
.section-header:hover {
  background: var(--gray-50);
}

.section-toggle {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}
.section-toggle h3 {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
}

.chevron {
  color: var(--text-secondary);
  transition: transform var(--transition-base);
}
.chevron.rotated {
  transform: rotate(90deg);
}

.section-body {
  padding: 0 var(--spacing-xl) var(--spacing-xl);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.form-label {
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-textarea {
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 0.88rem;
  color: var(--text-primary);
  background: var(--gray-50);
  transition: all var(--transition-fast);
  outline: none;
  resize: vertical;
  font-family: inherit;
}
.form-textarea:focus {
  border-color: var(--primary-400);
  background: white;
  box-shadow: 0 0 0 3px var(--primary-50);
}
.form-textarea::placeholder {
  color: var(--gray-400);
}
</style>
