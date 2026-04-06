<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, type Component } from 'vue'
import { useResumeStore } from '@/stores/resume'
import { useAiConfigStore } from '@/stores/aiConfig'
import BasicInfoEditor from './editors/BasicInfoEditor.vue'
import EducationEditor from './editors/EducationEditor.vue'
import SkillsEditor from './editors/SkillsEditor.vue'
import CertificateEditor from './editors/CertificateEditor.vue'
import WorkExperienceEditor from './editors/WorkExperienceEditor.vue'
import ProjectExperienceEditor from './editors/ProjectExperienceEditor.vue'
import AwardsEditor from './editors/AwardsEditor.vue'
import SelfIntroEditor from './editors/SelfIntroEditor.vue'
import AiConfigDialog from '@/components/ai/AiConfigDialog.vue'
import AiOptimizePanel from '@/components/ai/AiOptimizePanel.vue'
import { getModuleIconPaths, MODULE_ICON_VIEWBOX } from '@/constants/moduleIcons'

const store = useResumeStore()
const aiConfig = useAiConfigStore()
const showSaved = ref(false)
const searchValue = ref('')
const showAiPanel = ref(false)
const showAiConfig = ref(false)
const moduleMenuOpen = ref(false)
const moduleMenuRef = ref<HTMLElement | null>(null)
const draggingModuleKey = ref<string | null>(null)
const dragOverModuleKey = ref<string | null>(null)
const nowTick = ref(Date.now())

function handleAiClick() {
  if (!aiConfig.isConfigured) {
    showAiConfig.value = true
  } else {
    showAiPanel.value = true
  }
}

function handleOpenConfigFromPanel() {
  showAiConfig.value = true
}

function toggleModuleMenu() {
  moduleMenuOpen.value = !moduleMenuOpen.value
}

function handleDocumentPointerDown(event: MouseEvent) {
  const target = event.target as Node | null
  if (!target || !moduleMenuRef.value) return
  if (!moduleMenuRef.value.contains(target)) {
    moduleMenuOpen.value = false
  }
}

const expanded = reactive<Record<string, boolean>>({
  basicInfo: true,
  education: false,
  skills: false,
  certificate: false,
  workExperience: false,
  projectExperience: false,
  awards: false,
  selfIntro: false,
})

const editorMap: Record<string, Component> = {
  basicInfo: BasicInfoEditor,
  education: EducationEditor,
  skills: SkillsEditor,
  certificate: CertificateEditor,
  workExperience: WorkExperienceEditor,
  projectExperience: ProjectExperienceEditor,
  awards: AwardsEditor,
  selfIntro: SelfIntroEditor,
}

const visibleCount = computed(() => store.modules.filter((m) => m.visible).length)
const searchKeyword = computed(() => searchValue.value.trim())
const filteredModules = computed(() =>
  store.modules.filter((m) => (searchKeyword.value ? m.label.includes(searchKeyword.value) : true))
)

function hasTextContent(value: string | undefined): boolean {
  if (!value) return false
  const text = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .trim()
  return text.length > 0
}

function countFilled(values: Array<string | undefined>): number {
  return values.reduce((count, value) => count + (value?.trim() ? 1 : 0), 0)
}

function scoreByFilled(values: Array<string | undefined>): number {
  if (values.length === 0) return 0
  return countFilled(values) / values.length
}

const moduleCompletion = computed<Record<string, number>>(() => {
  const basic = store.basicInfo

  const basicInfoScore = scoreByFilled([
    basic.name,
    basic.phone,
    basic.email,
    basic.jobTitle,
    basic.expectedLocation,
    basic.educationLevel,
  ])

  const firstEducation = store.educationList.find((e) =>
    [e.school, e.major, e.degree, e.startDate].some((value) => value?.trim())
  )
  const educationScore = firstEducation
    ? scoreByFilled([firstEducation.school, firstEducation.major, firstEducation.degree, firstEducation.startDate])
    : 0

  const firstWork = store.workList.find((w) =>
    [w.company, w.position, w.startDate, w.description].some((value) => value?.trim())
  )
  const workScore = firstWork
    ? scoreByFilled([firstWork.company, firstWork.position, firstWork.startDate, firstWork.description])
    : 0

  const firstProject = store.projectList.find((p) =>
    [p.name, p.role, p.startDate, p.mainWork].some((value) => value?.trim())
  )
  const projectScore = firstProject
    ? scoreByFilled([firstProject.name, firstProject.role, firstProject.startDate, firstProject.mainWork])
    : 0

  const firstAward = store.awardList.find((a) => [a.name, a.date].some((value) => value?.trim()))
  const awardsScore = firstAward ? scoreByFilled([firstAward.name, firstAward.date]) : 0

  return {
    basicInfo: basicInfoScore,
    education: educationScore,
    skills: hasTextContent(store.skills) ? 1 : 0,
    workExperience: workScore,
    projectExperience: projectScore,
    awards: awardsScore,
    selfIntro: hasTextContent(store.selfIntro) ? 1 : 0,
  }
})

const completionPercent = computed(() => {
  const enabledModules = store.modules.filter((m) => m.visible)
  if (enabledModules.length === 0) return 0
  const total = enabledModules.reduce((sum, mod) => sum + (moduleCompletion.value[mod.key] ?? 0), 0)
  return Math.round((total / enabledModules.length) * 100)
})

function handleSave() {
  store.saveToStorage()
  showSaved.value = true
  setTimeout(() => {
    showSaved.value = false
  }, 1800)
}

const isAutoSavePending = computed(() => store.nextAutoSaveAt !== null)
const autoSaveChipText = computed(() => {
  if (store.isSaving) {
    return '自动保存中...'
  }

  const nextAt = store.nextAutoSaveAt
  if (nextAt) {
    const remainMs = Math.max(nextAt - nowTick.value, 0)
    const remainSec = Math.max(remainMs / 1000, 0.1)
    return `${remainSec.toFixed(1)}秒后自动保存`
  }

  const savedAt = store.lastSavedAt
  if (!savedAt) {
    return `自动保存间隔 ${Math.max(store.autoSaveDelayMs / 1000, 0.1).toFixed(1)}秒`
  }

  const elapsedMs = Math.max(nowTick.value - savedAt, 0)
  const label = store.lastSaveMode === 'manual' ? '手动保存' : '自动保存'
  if (elapsedMs < 2_000) return `刚刚${label}`
  if (elapsedMs < 60_000) return `${Math.floor(elapsedMs / 1000)}秒前${label}`
  return `${Math.floor(elapsedMs / 60_000)}分钟前${label}`
})

const isDefaultOrder = computed(() => store.isDefaultModuleOrder())

function handleResetOrder() {
  store.resetModuleOrder()
}

function toggleExpand(key: string) {
  expanded[key] = !expanded[key]
}

function moduleIconPaths(key: string): string[] {
  return getModuleIconPaths(key)
}

function canMoveUp(key: string): boolean {
  return store.canMoveModule(key, 'up')
}

function canMoveDown(key: string): boolean {
  return store.canMoveModule(key, 'down')
}

function moveUp(key: string) {
  store.moveModule(key, 'up')
}

function moveDown(key: string) {
  store.moveModule(key, 'down')
}

function handleSwitchDragStart(event: DragEvent, key: string) {
  if (key === 'basicInfo') {
    event.preventDefault()
    return
  }
  draggingModuleKey.value = key
  event.dataTransfer?.setData('text/plain', key)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}

function handleSwitchDragOver(event: DragEvent, key: string) {
  if (!draggingModuleKey.value || draggingModuleKey.value === key) return
  event.preventDefault()
  dragOverModuleKey.value = key
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function handleSwitchDrop(targetKey: string) {
  const sourceKey = draggingModuleKey.value
  if (!sourceKey || sourceKey === targetKey) return
  store.reorderModule(sourceKey, targetKey)
  dragOverModuleKey.value = null
}

function handleSwitchDragEnd() {
  draggingModuleKey.value = null
  dragOverModuleKey.value = null
}

let autoSaveTicker: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  autoSaveTicker = setInterval(() => {
    nowTick.value = Date.now()
  }, 200)
  document.addEventListener('mousedown', handleDocumentPointerDown)
})

onUnmounted(() => {
  if (autoSaveTicker) {
    clearInterval(autoSaveTicker)
    autoSaveTicker = null
  }
  document.removeEventListener('mousedown', handleDocumentPointerDown)
})
</script>

<template>
  <main class="editor-panel">
    <div class="editor-toolbar">
      <input v-model="searchValue" class="search-input" placeholder="搜索模块：基本信息 / 教育经历 / 专业技能" />
      <span
        class="chip"
        :class="{ 'chip-pending': isAutoSavePending, 'chip-saving': store.isSaving }"
        :title="autoSaveChipText"
        :aria-label="autoSaveChipText"
        role="status"
        aria-live="polite"
      >
        <span v-if="store.isSaving" class="chip-loading" aria-hidden="true"></span>
        <svg v-else class="chip-status-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 7v5l3 2" />
          <circle cx="12" cy="12" r="8" />
        </svg>
      </span>
    </div>

    <div ref="moduleMenuRef" class="floating-tools">
      <div class="floating-tools-stack">
        <div class="module-switch-anchor">
          <button
            class="floating-tool-btn module-tool-btn"
            type="button"
            :aria-expanded="moduleMenuOpen"
            aria-haspopup="menu"
            aria-label="模块开关"
            title="模块开关"
            @click="toggleModuleMenu"
          >
            <span class="btn-module-switch-icon">⚙</span>
            <span class="floating-badge">{{ visibleCount }}</span>
          </button>
          <div v-if="moduleMenuOpen" class="module-switch-popover">
            <div class="module-switch-popover-header">
              <p class="module-switch-popover-title">选择展示模块</p>
              <button
                class="btn-reset-order-icon"
                type="button"
                :disabled="isDefaultOrder"
                aria-label="恢复默认顺序"
                title="恢复默认顺序"
                @click="handleResetOrder"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 11a8 8 0 1 1-2.34-5.66" />
                  <path d="M20 4v7h-7" />
                </svg>
              </button>
            </div>
            <ul class="module-switch-list">
              <li
                v-for="mod in store.modules"
                :key="`switch-${mod.key}`"
                class="module-switch-item"
                :class="{
                  active: mod.visible,
                  muted: !mod.visible,
                  draggable: mod.key !== 'basicInfo',
                  dragging: draggingModuleKey === mod.key,
                  'drag-over': dragOverModuleKey === mod.key,
                }"
                :draggable="mod.key !== 'basicInfo'"
                @dragstart="handleSwitchDragStart($event, mod.key)"
                @dragover="handleSwitchDragOver($event, mod.key)"
                @drop.prevent="handleSwitchDrop(mod.key)"
                @dragend="handleSwitchDragEnd"
              >
                <div class="module-switch-info">
                  <span v-if="mod.key !== 'basicInfo'" class="drag-handle" aria-hidden="true" title="拖拽排序">⋮⋮</span>
                  <span class="module-switch-icon" aria-hidden="true">
                    <svg class="module-switch-icon-svg" :viewBox="MODULE_ICON_VIEWBOX">
                      <path v-for="(d, idx) in moduleIconPaths(mod.key)" :key="`switch-${mod.key}-${idx}`" :d="d" />
                    </svg>
                  </span>
                  <span class="module-switch-label">{{ mod.label }}</span>
                </div>

                <div class="module-switch-actions">
                  <div v-if="mod.key !== 'basicInfo' && mod.visible" class="order-actions order-actions-switch">
                    <button class="order-btn" :disabled="!canMoveUp(mod.key)" @click.stop="moveUp(mod.key)">↑</button>
                    <button class="order-btn" :disabled="!canMoveDown(mod.key)" @click.stop="moveDown(mod.key)">↓</button>
                  </div>
                  <label class="toggle-switch">
                    <input
                      type="checkbox"
                      :checked="mod.visible"
                      :aria-label="`${mod.label}开关`"
                      @change="store.toggleModule(mod.key)"
                    />
                    <span class="toggle-slider"></span>
                  </label>
                </div>
              </li>
            </ul>
          </div>
        </div>
        <button
          class="floating-tool-btn ai-tool-btn"
          type="button"
          aria-label="AI优化建议"
          title="AI优化建议"
          @click="handleAiClick"
        >
          <span class="ai-tool-text">AI</span>
        </button>
      </div>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <p class="stat-label">简历完整度</p>
        <p class="stat-value">{{ completionPercent }}%</p>
      </div>
      <div class="stat-card">
        <p class="stat-label">模块已启用</p>
        <p class="stat-value">{{ visibleCount }} / {{ store.modules.length }}</p>
      </div>
    </div>

    <section class="info-editor">
      <div class="info-editor-header">
        <h2 class="editor-title">信息编辑区</h2>
        <div class="editor-header-actions">
          <button class="btn-save" @click="handleSave">保存草稿</button>
        </div>
      </div>
      <p class="editor-subtitle">模块顺序与模块开关一致，点击右侧可展开/收起</p>
      <transition name="fade">
        <p v-if="showSaved" class="save-hint">已保存</p>
      </transition>

      <div class="module-sections">
        <article
          v-for="mod in filteredModules"
          :key="mod.key"
          class="module-block"
          :class="{ disabled: !mod.visible }"
        >
	          <header class="module-head" @click="toggleExpand(mod.key)">
	            <div class="module-head-left">
	              <span class="module-head-icon" aria-hidden="true">
	                <svg class="module-head-icon-svg" :viewBox="MODULE_ICON_VIEWBOX">
	                  <path v-for="(d, idx) in moduleIconPaths(mod.key)" :key="`${mod.key}-${idx}`" :d="d" />
	                </svg>
	              </span>
	              <span class="module-head-title">{{ mod.label }}</span>
	            </div>
            <div class="module-head-right">
              <span v-if="!mod.visible" class="disabled-tag">已关闭</span>
              <span class="expand-text">{{ expanded[mod.key] && mod.visible ? '收起' : '展开' }} ▸</span>
            </div>
          </header>

          <div v-if="expanded[mod.key] && mod.visible" class="module-body">
            <component :is="editorMap[mod.key]" />
          </div>
        </article>

        <div v-if="filteredModules.length === 0" class="empty-result">没有匹配的模块</div>
      </div>
    </section>

    <AiOptimizePanel
      v-if="showAiPanel"
      @close="showAiPanel = false"
      @open-config="handleOpenConfigFromPanel"
    />

    <AiConfigDialog
      v-if="showAiConfig"
      @close="showAiConfig = false"
    />
  </main>
</template>

<style scoped>
.editor-panel {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  container-type: inline-size;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 40px;
  border: 1px solid #ddd2c6;
  border-radius: 8px;
  padding: 0 12px;
  background: #fff;
  color: #2d2521;
  font-size: 13px;
}

.search-input:focus {
  outline: none;
  border-color: #d97745;
  box-shadow: 0 0 0 3px rgba(217, 119, 69, 0.14);
}

.chip {
  position: relative;
  overflow: hidden;
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 8px;
  background: #efe7dc;
  color: #7b6a5b;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  transition: background-color 0.2s ease, color 0.2s ease;
  animation: chip-breath 2.6s ease-in-out infinite;
}

.chip::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    110deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.38) 44%,
    rgba(255, 255, 255, 0) 72%
  );
  transform: translateX(-120%);
  animation: chip-sheen 3.2s ease-in-out infinite;
  pointer-events: none;
}

.chip-pending {
  background: #fae8dc;
  color: #b7633b;
  animation-duration: 1.1s;
}

.chip-saving {
  background: #ffe8d9;
  color: #b54d1f;
  animation: chip-blink 0.72s ease-in-out infinite;
}

.chip-loading {
  flex-shrink: 0;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 2px solid rgba(181, 77, 31, 0.24);
  border-top-color: #b54d1f;
  animation: chip-spin 0.75s linear infinite;
}

.chip-status-icon {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@keyframes chip-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes chip-breath {
  0%,
  100% {
    opacity: 0.96;
  }

  50% {
    opacity: 0.78;
  }
}

@keyframes chip-sheen {
  0%,
  64%,
  100% {
    transform: translateX(-120%);
  }

  88% {
    transform: translateX(150%);
  }
}

@keyframes chip-blink {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.55;
  }
}

.btn-export {
  height: 40px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid #ddcfbf;
  background: #fff;
  color: #2d2521;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.18s, color 0.18s;
}

.btn-export:hover {
  border-color: #d97745;
  color: #d97745;
}

.stats-row {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.stat-card {
  background: #fff;
  border: 1px solid #e9ded0;
  border-radius: 10px;
  padding: 14px;
}

.stat-label {
  font-size: 11px;
  color: #8a7461;
  margin-bottom: 4px;
}

.stat-value {
  font-family: 'Noto Sans SC', sans-serif;
  font-size: 32px;
  line-height: 1;
  font-weight: 700;
  color: #2d2521;
}

.floating-tools {
  position: sticky;
  top: 50%;
  z-index: 30;
  height: 0;
  pointer-events: none;
  align-self: flex-end;
  margin-right: 8px;
}

.floating-tools-stack {
  width: fit-content;
  display: inline-flex;
  flex-direction: column;
  gap: 12px;
  transform: translateY(-50%);
  pointer-events: auto;
}

.floating-tool-btn {
  width: 52px;
  height: 52px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid #2d2521;
  background: #2d2521;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 18px rgba(45, 37, 33, 0.22);
  transition: transform 0.16s ease, box-shadow 0.16s ease, background-color 0.16s ease;
  position: relative;
}

.floating-tool-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 24px rgba(45, 37, 33, 0.26);
  background: #1f1916;
}

.module-switch-anchor {
  position: relative;
}

.ai-tool-btn {
  background: #d97745;
  border-color: #d97745;
}

.ai-tool-btn:hover {
  background: #c96a3b;
}

.btn-module-switch-icon {
  font-size: 16px;
  line-height: 1;
}

.floating-badge {
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;
  background: #d97745;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  position: absolute;
  right: -4px;
  top: -4px;
  border: 2px solid #f7f2ec;
}

.ai-tool-text {
  font-size: 14px;
  line-height: 1;
  font-weight: 800;
}

.module-switch-popover {
  position: absolute;
  top: -4px;
  right: calc(100% + 12px);
  width: 288px;
  max-width: min(288px, calc(100vw - 96px));
  padding: 10px;
  border: 1px solid #e9ded0;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 16px 30px rgba(45, 37, 33, 0.16);
  z-index: 20;
}

.module-switch-popover-title {
  color: #8a7461;
  font-size: 12px;
  font-weight: 700;
}

.module-switch-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.btn-reset-order-icon {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid #ddcfbf;
  border-radius: 8px;
  background: #fff;
  color: #8a7461;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.btn-reset-order-icon svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.btn-reset-order-icon:hover:not(:disabled) {
  border-color: #d97745;
  color: #d97745;
}

.btn-reset-order-icon:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.module-switch-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.module-switch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-radius: 10px;
  padding: 10px 12px;
  border: 1px solid transparent;
  background: #f2ece5;
  transition: all 0.18s ease;
}

.module-switch-item.draggable {
  cursor: grab;
}

.module-switch-item.draggable:active {
  cursor: grabbing;
}

.module-switch-item.active {
  background: #ffffff;
  border-color: #e9ded0;
}

.module-switch-item.muted {
  opacity: 0.9;
}

.module-switch-item.dragging {
  opacity: 0.5;
}

.module-switch-item.drag-over {
  border-color: #d97745;
  box-shadow: 0 0 0 1px rgba(217, 119, 69, 0.2) inset;
}

.module-switch-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.drag-handle {
  color: #a08c7b;
  letter-spacing: -1px;
  font-size: 13px;
  line-height: 1;
  flex-shrink: 0;
}

.module-switch-icon {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.module-switch-icon-svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: #8a7461;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.module-switch-item.active .module-switch-icon-svg {
  stroke: #d97745;
}

.module-switch-label {
  color: #2d2521;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.module-switch-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.toggle-switch {
  position: relative;
  width: 42px;
  height: 24px;
  flex-shrink: 0;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: #b8afa6;
  transition: 0.2s ease;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  top: 3px;
  border-radius: 50%;
  background: #ffffff;
  transition: 0.2s ease;
}

.toggle-switch input:checked + .toggle-slider {
  background: #d97745;
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(18px);
}

.info-editor {
  background: #fff;
  border: 1px solid #e9ded0;
  border-radius: 12px;
  padding: 16px;
}

.info-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.editor-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.editor-title {
  font-size: 18px;
  font-weight: 700;
  color: #2d2521;
}

.editor-subtitle {
  margin-top: 2px;
  font-size: 12px;
  color: #8a7461;
}

.btn-save {
  border: none;
  height: 36px;
  padding: 0 14px;
  border-radius: 8px;
  background: #2d2521;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.save-hint {
  margin-top: 6px;
  color: #d97745;
  font-size: 12px;
  font-weight: 600;
}

.module-sections {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.module-block {
  border-radius: 10px;
  background: #f8f3ed;
  border: 1px solid #efe4d8;
  overflow: hidden;
}

.module-block.disabled {
  background: #f2ece5;
}

.module-head {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 12px;
  cursor: pointer;
}

.module-head-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.module-head-icon {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.module-head-icon-svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: #8a7461;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.module-block:not(.disabled) .module-head-icon-svg {
  stroke: #d97745;
}

.module-head-title {
  font-size: 14px;
  font-weight: 700;
  color: #2d2521;
}

.module-head-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.order-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.order-actions-switch {
  margin-right: 2px;
}

.order-btn {
  width: 22px;
  height: 22px;
  border: 1px solid #ddcfbf;
  border-radius: 6px;
  background: #fff;
  color: #8a7461;
  font-size: 12px;
  line-height: 1;
  font-weight: 700;
  cursor: pointer;
}

.order-btn:hover:not(:disabled) {
  border-color: #d97745;
  color: #d97745;
}

.order-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.disabled-tag {
  font-size: 11px;
  color: #a08c7b;
  font-weight: 600;
}

.expand-text {
  font-size: 12px;
  color: #8a7461;
  font-weight: 600;
}

.module-body {
  padding: 0 10px 10px;
}

.empty-result {
  font-size: 12px;
  color: #8a7461;
  text-align: center;
  padding: 18px 0;
}

.module-body :deep(.editor-section) {
  margin: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  box-shadow: none;
}

.module-body :deep(.editor-section:hover) {
  box-shadow: none;
}

.module-body :deep(.section-header) {
  display: none;
}

.module-body :deep(.section-body) {
  padding: 10px;
  background: #fff;
  border: 1px solid #e9ded0;
  border-radius: 8px;
}

.module-body :deep(.entry-card) {
  background: #fff;
  border-color: #e9ded0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@container (max-width: 560px) {
  .chip {
    display: none;
  }

  .module-switch-popover {
    right: 0;
    top: auto;
    bottom: calc(100% + 10px);
    width: min(280px, calc(100vw - 24px));
    max-width: none;
  }

  .stats-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .info-editor-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .editor-header-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .expand-text {
    display: none;
  }
}

@container (max-width: 420px) {
  .editor-toolbar {
    flex-wrap: wrap;
  }

  .search-input {
    width: 100%;
  }

  .editor-panel {
    padding: 14px;
    gap: 10px;
  }

  .info-editor {
    padding: 12px;
  }

  .stat-value {
    font-size: 26px;
  }
}
</style>
