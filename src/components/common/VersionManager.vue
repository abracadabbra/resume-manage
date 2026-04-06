<script setup lang="ts">
import { ref } from 'vue'
import { useResumeStore } from '@/stores/resume'

const store = useResumeStore()
const emit = defineEmits<{
  (e: 'close'): void
}>()

const showNewVersionDialog = ref(false)
const newVersionName = ref('')
const loading = ref(false)
const error = ref('')

async function handleCreateVersion() {
  if (!newVersionName.value.trim()) return
  error.value = ''
  loading.value = true
  
  try {
    await store.createNewVersion(newVersionName.value.trim())
    showNewVersionDialog.value = false
    newVersionName.value = ''
    emit('close')
  } catch (e: any) {
    error.value = e.message || '创建失败'
  } finally {
    loading.value = false
  }
}

async function handleSwitchVersion(resumeId: string) {
  await store.switchVersion(resumeId)
  emit('close')
}

async function handleDeleteVersion(resumeId: string, event: Event) {
  event.stopPropagation()
  if (!confirm('确定删除这个版本吗？')) return
  await store.removeVersion(resumeId)
}
</script>

<template>
  <div class="version-overlay" @click.self="emit('close')">
    <div class="version-dialog">
      <div class="version-header">
        <h2>简历版本管理</h2>
        <button class="close-btn" @click="emit('close')">×</button>
      </div>
      
      <div class="version-list">
        <div 
          v-for="resume in store.resumeVersions" 
          :key="resume.id"
          class="version-item"
          :class="{ active: resume.id === store.currentResumeId }"
          @click="handleSwitchVersion(resume.id)"
        >
          <div class="version-info">
            <span class="version-name">{{ resume.name }}</span>
            <span class="version-meta">v{{ resume.version }}</span>
          </div>
          <button 
            class="delete-btn"
            @click="handleDeleteVersion(resume.id, $event)"
          >
            删除
          </button>
        </div>
        
        <div v-if="store.resumeVersions.length === 0" class="no-versions">
          暂无版本，请创建新版本
        </div>
      </div>
      
      <div class="version-actions">
        <button 
          v-if="!showNewVersionDialog"
          class="create-btn"
          @click="showNewVersionDialog = true"
        >
          + 新建版本
        </button>
        
        <div v-else class="new-version-form">
          <input 
            v-model="newVersionName"
            type="text"
            placeholder="版本名称，如：校招版、社招版"
            @keyup.enter="handleCreateVersion"
          />
          <div class="form-actions">
            <button 
              class="cancel-btn"
              @click="showNewVersionDialog = false"
            >
              取消
            </button>
            <button 
              class="confirm-btn"
              :disabled="loading || !newVersionName.trim()"
              @click="handleCreateVersion"
            >
              {{ loading ? '创建中...' : '创建' }}
            </button>
          </div>
          <div v-if="error" class="error-msg">{{ error }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.version-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.version-dialog {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  width: 360px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.version-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.version-header h2 {
  margin: 0;
  font-size: 18px;
  color: #2d2521;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #7b6a5b;
}

.version-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.version-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border: 1px solid #e0d2c1;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.version-item:hover {
  background: #faf6f0;
}

.version-item.active {
  border-color: #2a5caa;
  background: #f0f5ff;
}

.version-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.version-name {
  font-size: 14px;
  color: #2d2521;
  font-weight: 600;
}

.version-meta {
  font-size: 12px;
  color: #7b6a5b;
}

.delete-btn {
  background: none;
  border: none;
  color: #dc3545;
  font-size: 12px;
  cursor: pointer;
}

.no-versions {
  text-align: center;
  color: #7b6a5b;
  padding: 20px;
  font-size: 14px;
}

.version-actions {
  border-top: 1px solid #e0d2c1;
  padding-top: 16px;
}

.create-btn {
  width: 100%;
  padding: 10px;
  background: #2d2521;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.new-version-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.new-version-form input {
  padding: 10px 12px;
  border: 1px solid #e0d2c1;
  border-radius: 8px;
  font-size: 14px;
}

.form-actions {
  display: flex;
  gap: 8px;
}

.cancel-btn {
  flex: 1;
  padding: 10px;
  background: #f0f0f0;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.confirm-btn {
  flex: 1;
  padding: 10px;
  background: #2d2521;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.confirm-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.error-msg {
  color: #dc3545;
  font-size: 13px;
}
</style>
