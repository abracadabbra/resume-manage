<script setup lang="ts">
import { ref, computed } from 'vue'
import { useResumeStore } from '@/stores/resume'
import { useResumeVersionsStore } from '@/stores/resumeVersions'

const resumeStore = useResumeStore()
const versionsStore = useResumeVersionsStore()

const isExpanded = ref(false)
const newName = ref('')
const errorMsg = ref('')
const successMsg = ref('')
const editingId = ref<string | null>(null)
const editingName = ref('')
let msgTimer: ReturnType<typeof setTimeout> | null = null

const versions = computed(() => versionsStore.sortedVersions)

function showMsg(message: string, isError = false) {
  if (isError) {
    errorMsg.value = message
    successMsg.value = ''
  } else {
    successMsg.value = message
    errorMsg.value = ''
  }
  if (msgTimer) clearTimeout(msgTimer)
  msgTimer = setTimeout(() => {
    errorMsg.value = ''
    successMsg.value = ''
    msgTimer = null
  }, 2400)
}

function handleSave() {
  const name = newName.value.trim()
  if (!name) {
    showMsg('请输入版本名称', true)
    return
  }
  if (!versionsStore.canSave) {
    showMsg(`版本数量已达上限`, true)
    return
  }

  const version = versionsStore.saveCurrentAsVersion(name, resumeStore.getSnapshot())
  if (!version) {
    showMsg('保存失败，请重试', true)
    return
  }

  versionsStore.setActiveVersion(version.id)
  newName.value = ''
  showMsg(`已保存版本"${version.name}"`)
}

function handleApply(id: string) {
  const data = versionsStore.getVersionData(id)
  if (!data) {
    showMsg('版本数据已损坏', true)
    return
  }

  // 应用前确认（用浏览器原生 confirm 即可，避免引入复杂 dialog）
  const version = versions.value.find((v) => v.id === id)
  const ok = window.confirm(
    `确定切换到版本"${version?.name ?? ''}"吗？\n当前未保存的改动将被覆盖。`,
  )
  if (!ok) return

  resumeStore.loadSnapshot(data)
  resumeStore.saveToStorage('manual')
  versionsStore.setActiveVersion(id)
  showMsg(`已切换到版本"${version?.name ?? ''}"`)
}

function handleDelete(id: string) {
  const version = versions.value.find((v) => v.id === id)
  if (!version) return
  const ok = window.confirm(`确定删除版本"${version.name}"吗？此操作不可恢复。`)
  if (!ok) return

  versionsStore.deleteVersion(id)
  showMsg(`已删除版本"${version.name}"`)
}

function startEdit(id: string, currentName: string) {
  editingId.value = id
  editingName.value = currentName
}

function confirmEdit() {
  if (!editingId.value) return
  const name = editingName.value.trim()
  if (!name) {
    showMsg('版本名称不能为空', true)
    return
  }
  versionsStore.updateVersionName(editingId.value, name)
  editingId.value = null
  editingName.value = ''
}

function cancelEdit() {
  editingId.value = null
  editingName.value = ''
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n))
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<template>
  <div class="version-manager">
    <button
      v-if="!isExpanded"
      class="trigger-btn"
      type="button"
      @click="isExpanded = true"
    >
      <span class="trigger-icon">版</span>
      简历版本管理
      <span v-if="versions.length" class="trigger-count">{{ versions.length }}</span>
    </button>

    <div v-else class="version-panel">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">简历版本管理</h3>
          <p class="panel-desc">保存当前简历为命名快照，便于多岗位投递时切换。</p>
        </div>
        <button class="close-btn" type="button" @click="isExpanded = false">×</button>
      </div>

      <div class="save-row">
        <input
          v-model="newName"
          class="name-input"
          type="text"
          placeholder="例如：投阿里版、投字节版"
          maxlength="40"
          @keyup.enter="handleSave"
        />
        <button
          class="save-btn"
          type="button"
          :disabled="!newName.trim() || !versionsStore.canSave"
          @click="handleSave"
        >
          保存当前为版本
        </button>
      </div>

      <div v-if="errorMsg" class="msg error-msg">{{ errorMsg }}</div>
      <div v-if="successMsg" class="msg success-msg">{{ successMsg }}</div>

      <div v-if="versions.length === 0" class="empty-hint">
        还没有保存任何版本。填写名称后点击"保存当前为版本"。
      </div>

      <ul v-else class="version-list">
        <li
          v-for="ver in versions"
          :key="ver.id"
          class="version-item"
          :class="{ active: versionsStore.activeVersionId === ver.id }"
        >
          <div class="item-main">
            <template v-if="editingId === ver.id">
              <input
                v-model="editingName"
                class="edit-input"
                type="text"
                maxlength="40"
                @keyup.enter="confirmEdit"
                @keyup.esc="cancelEdit"
              />
              <button class="item-btn primary" type="button" @click="confirmEdit">确定</button>
              <button class="item-btn" type="button" @click="cancelEdit">取消</button>
            </template>
            <template v-else>
              <span class="item-name">{{ ver.name }}</span>
              <span class="item-time">{{ formatTime(ver.createdAt) }}</span>
            </template>
          </div>
          <div v-if="editingId !== ver.id" class="item-actions">
            <button class="item-btn primary" type="button" @click="handleApply(ver.id)">
              切换
            </button>
            <button class="item-btn" type="button" @click="startEdit(ver.id, ver.name)">
              重命名
            </button>
            <button class="item-btn danger" type="button" @click="handleDelete(ver.id)">
              删除
            </button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.version-manager {
  display: flex;
}

.trigger-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid #ddcfbf;
  border-radius: 8px;
  background: #fff;
  color: #2d2521;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.trigger-btn:hover {
  border-color: #d97745;
  box-shadow: 0 6px 16px rgba(217, 119, 69, 0.08);
}

.trigger-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: #f2ece6;
  font-size: 11px;
  font-weight: 700;
  color: #7b6a5b;
}

.trigger-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: #d97745;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.version-panel {
  flex: 1;
  border: 1px solid #e8e0d5;
  border-radius: 10px;
  background: #fff;
  padding: 14px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.panel-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #2d2521;
}

.panel-desc {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: #7b6a5b;
}

.close-btn {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 50%;
  background: #f2ece6;
  color: #7b6a5b;
  font-size: 16px;
  cursor: pointer;
  line-height: 1;
  flex-shrink: 0;
}

.save-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.name-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddcfbf;
  border-radius: 8px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}

.name-input:focus {
  border-color: #d97745;
}

.save-btn {
  border: none;
  border-radius: 8px;
  background: #d97745;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  padding: 0 14px;
  cursor: pointer;
  white-space: nowrap;
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.msg {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  margin-bottom: 10px;
}

.error-msg {
  border: 1px solid #f0d2c8;
  background: #fff1ec;
  color: #b74a30;
}

.success-msg {
  border: 1px solid #c8e6cf;
  background: #eef8f1;
  color: #2b7a45;
}

.empty-hint {
  padding: 20px;
  text-align: center;
  color: #8a7461;
  font-size: 12px;
  border: 1px dashed #ddcfbf;
  border-radius: 8px;
  background: #faf8f5;
}

.version-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  overflow-y: auto;
}

.version-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #eadfd2;
  border-radius: 8px;
  background: #faf8f5;
  transition: border-color 0.15s, background 0.15s;
}

.version-item:hover {
  border-color: #d97745;
}

.version-item.active {
  border-color: #d97745;
  background: #fff2eb;
}

.item-main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.item-name {
  font-size: 13px;
  font-weight: 600;
  color: #2d2521;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-time {
  font-size: 11px;
  color: #8a7461;
  white-space: nowrap;
}

.edit-input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid #d97745;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
}

.item-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.item-btn {
  padding: 4px 8px;
  border: 1px solid #ddcfbf;
  border-radius: 4px;
  background: #fff;
  color: #6a5748;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s, color 0.15s;
}

.item-btn:hover {
  border-color: #d97745;
  color: #d97745;
}

.item-btn.primary {
  border-color: #d97745;
  background: #d97745;
  color: #fff;
}

.item-btn.primary:hover {
  background: #c96a3b;
  color: #fff;
}

.item-btn.danger {
  border-color: #f0d2c8;
  color: #b74a30;
}

.item-btn.danger:hover {
  border-color: #b74a30;
  background: #fff1ec;
  color: #b74a30;
}

@media (max-width: 720px) {
  .version-item {
    flex-direction: column;
    align-items: stretch;
  }

  .item-actions {
    justify-content: flex-end;
  }
}
</style>
