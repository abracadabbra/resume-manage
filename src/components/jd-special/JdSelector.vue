<script setup lang="ts">
import { ref } from 'vue'
import { useJdProfileStore } from '@/stores/jdProfile'

const store = useJdProfileStore()

const showNewForm = ref(false)
const newJdName = ref('')
const newJdText = ref('')

function handleCreate() {
  if (!newJdName.value.trim()) return
  const profile = store.addProfile(newJdName.value.trim(), newJdText.value.trim())
  store.selectProfile(profile.id)
  newJdName.value = ''
  newJdText.value = ''
  showNewForm.value = false
}

function handleCancel() {
  showNewForm.value = false
  newJdName.value = ''
  newJdText.value = ''
}
</script>

<template>
  <div class="jd-selector">
    <div class="selector-header">
      <h2 class="selector-title">JD 专项</h2>
      <button v-if="!showNewForm" class="new-btn" @click="showNewForm = true">
        + 新建
      </button>
    </div>

    <!-- 新建表单 -->
    <div v-if="showNewForm" class="new-form">
      <div class="form-field">
        <label class="field-label">JD 名称</label>
        <input
          v-model="newJdName"
          class="field-input"
          placeholder="例如：资深Java工程师"
        />
      </div>
      <div class="form-field">
        <label class="field-label">JD 原文（可选）</label>
        <textarea
          v-model="newJdText"
          class="field-textarea"
          placeholder="粘贴职位描述原文..."
          rows="4"
        ></textarea>
      </div>
      <div class="form-actions">
        <button class="confirm-create-btn" @click="handleCreate">创建</button>
        <button class="cancel-create-btn" @click="handleCancel">取消</button>
      </div>
    </div>

    <!-- JD 列表 -->
    <ul class="jd-list">
      <li
        v-for="profile in store.profiles"
        :key="profile.id"
        class="jd-item"
        :class="{ active: store.activeProfileId === profile.id }"
      >
        <button class="jd-item-btn" @click="store.selectProfile(profile.id)">
          <span class="jd-name">{{ profile.name }}</span>
          <span class="jd-count">{{ profile.questions.length }} 题</span>
        </button>
        <button
          class="delete-jd-btn"
          title="删除 JD"
          @click.stop="store.deleteProfile(profile.id)"
        >
          ×
        </button>
      </li>
    </ul>

    <div v-if="store.profiles.length === 0 && !showNewForm" class="empty-hint">
      点击"新建"创建第一个 JD
    </div>
  </div>
</template>

<style scoped>
.jd-selector {
  width: 200px;
  min-width: 200px;
  background: #f8f5f0;
  border-right: 1px solid #e8e0d5;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.selector-header {
  padding: 16px 14px 12px;
  border-bottom: 1px solid #e8e0d5;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.selector-title {
  font-size: 14px;
  font-weight: 700;
  color: #2d2521;
  margin: 0;
}

.new-btn {
  padding: 4px 10px;
  border: none;
  border-radius: 6px;
  background: #d97745;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.new-btn:hover {
  background: #c96a3b;
}

.new-form {
  padding: 12px 14px;
  border-bottom: 1px solid #e8e0d5;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 11px;
  color: #7b6a5b;
  font-weight: 600;
}

.field-input {
  padding: 6px 8px;
  border: 1px solid #e0d2c1;
  border-radius: 6px;
  font-size: 12px;
  outline: none;
}

.field-input:focus {
  border-color: #d97745;
}

.field-textarea {
  padding: 6px 8px;
  border: 1px solid #e0d2c1;
  border-radius: 6px;
  font-size: 12px;
  font-family: inherit;
  resize: vertical;
  outline: none;
}

.field-textarea:focus {
  border-color: #d97745;
}

.form-actions {
  display: flex;
  gap: 6px;
}

.confirm-create-btn {
  flex: 1;
  padding: 6px;
  border: none;
  border-radius: 6px;
  background: #d97745;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.confirm-create-btn:hover {
  background: #c96a3b;
}

.cancel-create-btn {
  flex: 1;
  padding: 6px;
  border: 1px solid #e0d2c1;
  border-radius: 6px;
  background: #fff;
  color: #7b6a5b;
  font-size: 12px;
  cursor: pointer;
}

.jd-list {
  list-style: none;
  margin: 0;
  padding: 8px 0;
  flex: 1;
}

.jd-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
}

.jd-item:hover .delete-jd-btn {
  opacity: 1;
}

.jd-item-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}

.jd-item-btn:hover {
  background: #efe7dc;
}

.jd-item.active .jd-item-btn {
  background: #d97745;
}

.jd-item.active .jd-name {
  color: #fff;
}

.jd-item.active .jd-count {
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
}

.jd-name {
  font-size: 12px;
  font-weight: 600;
  color: #2d2521;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.jd-count {
  font-size: 10px;
  background: #e8e0d5;
  color: #7b6a5b;
  padding: 2px 6px;
  border-radius: 10px;
  flex-shrink: 0;
}

.delete-jd-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: #dc2626;
  font-size: 16px;
  cursor: pointer;
  opacity: 0;
  border-radius: 4px;
  flex-shrink: 0;
}

.delete-jd-btn:hover {
  background: #fff5f5;
}

.empty-hint {
  padding: 20px 14px;
  text-align: center;
  color: #8a7461;
  font-size: 12px;
}
</style>
