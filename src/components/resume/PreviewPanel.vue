<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useResumeStore } from '@/stores/resume'
import ExportMenu from '@/components/resume/ExportMenu.vue'
import PaginationDiagnosticPanel from '@/components/resume/PaginationDiagnosticPanel.vue'
import TemplatePickerDialog from '@/components/resume/TemplatePickerDialog.vue'
import { usePdfExport } from '@/components/resume/usePdfExport'
import {
  RESUME_TEMPLATES,
  getResumeTemplateByKey,
  type ResumeTemplateDefinition,
  type ResumeTemplateKey,
} from '@/templates/resume'
import { generateResumeMarkdown, downloadMarkdown } from '@/services/exportMarkdown'
import {
  A4_WIDTH,
  useResumePagination,
} from '@/components/resume/useResumePagination'

const store = useResumeStore()
const resumeRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const templatePickerOpen = ref(false)
const diagnosticMode = ref(false)
const {
  pageBreaks,
  lastPageSpacerHeight,
  paperHeight,
  paginationDiagnostics,
  pageDiagnostics,
  blankZones,
  refreshPreviewPageLayout,
} = useResumePagination(contentRef, diagnosticMode)
const {
  exporting,
  exportProgress,
  exportProgressText,
  exportPDF,
} = usePdfExport({
  resumeRef,
  contentRef,
  refreshPageLayout: refreshPreviewPageLayout,
  getFileBaseName: () => store.basicInfo.name || '简历',
})

const fallbackTemplate: ResumeTemplateDefinition = getResumeTemplateByKey('default')
const currentTemplate = computed<ResumeTemplateDefinition>(
  () => getResumeTemplateByKey(store.selectedTemplateKey) ?? fallbackTemplate
)
const currentTemplateComponent = computed(() => currentTemplate.value.component)
const a4TemplateLabel = computed(() => `A4 / ${currentTemplate.value.name}`)

function toggleDiagnosticMode() {
  diagnosticMode.value = !diagnosticMode.value
}

function openTemplatePicker() {
  templatePickerOpen.value = true
}

function chooseTemplate(key: ResumeTemplateKey) {
  store.setTemplate(key)
  templatePickerOpen.value = false
}

watch(
  () => [
    JSON.stringify(store.modules),
    JSON.stringify(store.basicInfo),
    JSON.stringify(store.educationList),
    store.skills,
    JSON.stringify(store.workList),
    JSON.stringify(store.projectList),
    JSON.stringify(store.awardList),
    store.selfIntro,
    store.selectedTemplateKey,
  ],
  () => {
    void nextTick(() => refreshPreviewPageLayout())
  }
)

function handleExportMarkdown() {
  const md = generateResumeMarkdown(store)
  const name = store.basicInfo.name?.trim() || '简历'
  downloadMarkdown(`${name}_简历.md`, md)
}
</script>

<template>
  <aside class="preview-panel">
    <div class="preview-top">
      <div class="preview-title-row">
        <span class="preview-title">实时预览</span>
        <button class="template-trigger" @click="openTemplatePicker">
          <span class="template-trigger-label">切换模板</span>
          <span class="template-trigger-name">{{ currentTemplate.name }}</span>
          <span class="template-trigger-arrow">▾</span>
        </button>
        <span class="a4-badge">{{ a4TemplateLabel }}</span>
        <button
          type="button"
          class="diagnostic-toggle"
          :class="{ active: diagnosticMode }"
          @click="toggleDiagnosticMode"
        >
          {{ diagnosticMode ? '关闭诊断' : '分页诊断' }}
        </button>
      </div>
      <ExportMenu
        :exporting="exporting"
        @export-pdf="exportPDF"
        @export-markdown="handleExportMarkdown"
      />
    </div>
    <div v-if="exporting" class="export-progress">
      <div class="export-progress-head">
        <span class="export-progress-text">{{ exportProgressText || '导出中...' }}</span>
        <span class="export-progress-percent">{{ exportProgress }}%</span>
      </div>
      <div class="export-progress-track">
        <span class="export-progress-fill" :style="{ width: `${exportProgress}%` }"></span>
      </div>
    </div>

    <PaginationDiagnosticPanel
      v-if="diagnosticMode && paginationDiagnostics"
      :diagnostics="paginationDiagnostics"
    />

    <TemplatePickerDialog
      v-model="templatePickerOpen"
      :templates="RESUME_TEMPLATES"
      :selected-key="store.selectedTemplateKey"
      @select="chooseTemplate"
    />

    <div class="preview-scroll">
      <div class="paper-wrapper" :style="{ width: `${A4_WIDTH}px` }">
        <!-- AI Generated Start -->
        <div
          ref="resumeRef"
          class="paper"
          :style="{
            width: `${A4_WIDTH}px`,
            minHeight: `${paperHeight}px`,
            height: 'auto',
            padding: '0',
          }"
        >
          <!-- AI Generated End -->
          <div ref="contentRef">
            <component :is="currentTemplateComponent" />
          </div>
          <div v-if="lastPageSpacerHeight > 0" :style="{ height: `${lastPageSpacerHeight}px` }"></div>
        </div>

        <div
          v-for="zone in diagnosticMode ? blankZones : []"
          :key="zone.key"
          class="diagnostic-blank-zone"
          :class="{ warn: zone.suspicious }"
          :style="{ top: `${zone.top}px`, height: `${zone.height}px` }"
        >
          <span>{{ zone.label }}</span>
        </div>

        <!-- AI Generated Start -->
        <div v-for="(pos, idx) in pageBreaks" :key="idx" class="page-line" :style="{ top: `${pos}px` }">
          <span>
            第{{ idx + 2 }}页
            <template v-if="diagnosticMode && pageDiagnostics[idx]">
              · 上页使用 {{ Math.round(pageDiagnostics[idx]!.usageRatio * 100) }}%
            </template>
          </span>
        </div>
        <!-- AI Generated End -->
      </div>
    </div>
  </aside>
</template>

<style scoped>
.preview-panel {
  box-sizing: border-box;
  width: 812px;
  max-width: 812px;
  min-width: 0;
  flex: 0 0 812px;
  height: 100%;
  border-left: 1px solid #e4d8cb;
  background: #efe7dc;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preview-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.preview-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.preview-title {
  color: #2d2521;
  font-size: 16px;
  font-weight: 700;
}

.template-trigger {
  height: 30px;
  padding: 0 10px 0 8px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border-radius: 8px;
  border: 1px solid #e0d2c1;
  background: #fff;
  color: #2d2521;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  outline: none;
  box-shadow: 0 1px 0 rgba(45, 37, 33, 0.06);
  transition: background-color 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
}

.template-trigger:hover {
  border-color: #cdbba7;
  background: #faf6f0;
  box-shadow: 0 4px 12px rgba(45, 37, 33, 0.1);
}

.template-trigger-label {
  height: 20px;
  padding: 0 6px;
  border-radius: 6px;
  background: #2d2521;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
}

.template-trigger-name {
  color: #2d2521;
  font-size: 12px;
  font-weight: 700;
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.template-trigger-arrow {
  color: #7b6a5b;
  font-size: 11px;
  line-height: 1;
}

.a4-badge {
  height: 24px;
  padding: 0 8px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #e9ded0;
  color: #7b6a5b;
  font-size: 11px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}

.diagnostic-toggle {
  height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid #d8cabb;
  background: #fff;
  color: #6f5d4f;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.diagnostic-toggle.active {
  border-color: #d97745;
  background: #fff4ec;
  color: #b45e33;
}

.export-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid #e9ded0;
  border-radius: 8px;
  background: #fff8f2;
}

.export-progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.export-progress-text {
  font-size: 12px;
  color: #7b6a5b;
  font-weight: 600;
}

.export-progress-percent {
  font-size: 12px;
  color: #2d2521;
  font-weight: 700;
}

.export-progress-track {
  position: relative;
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: #eedfce;
  overflow: hidden;
}

.export-progress-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #d97745 0%, #c96a3b 100%);
  transition: width 0.18s ease;
}

.preview-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0;
}

.paper-wrapper {
  position: relative;
  margin: 0 auto;
  padding-bottom: 8px;
}

.paper {
  box-sizing: border-box;
  background: #fff;
  border: 1px solid #d8dde6;
  border-radius: 4px;
  color: #000;
  box-shadow: 0 12px 24px rgba(45, 37, 33, 0.1);
  min-height: 0;
}

.paper.pdf-exporting {
  box-shadow: none;
  border: none;
  border-radius: 0;
  min-height: 0 !important;
  /* AI Generated Start */
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  /* AI Generated End */
}

.page-line {
  position: absolute;
  left: 16px;
  right: 16px;
  transform: translateY(-6px);
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: none;
  z-index: 2;
}

.page-line::before,
.page-line::after {
  content: '';
  flex: 1;
  height: 1px;
  border-top: 1px dashed #d97745;
}

.page-line span {
  color: #d97745;
  font-size: 10px;
  font-weight: 600;
  background: #efe7dc;
  padding: 0 4px;
}

.diagnostic-blank-zone {
  position: absolute;
  left: 12px;
  right: 12px;
  border: 1px dashed rgba(217, 119, 69, 0.55);
  background: rgba(217, 119, 69, 0.08);
  pointer-events: none;
  z-index: 1;
}

.diagnostic-blank-zone.warn {
  background: rgba(220, 38, 38, 0.08);
  border-color: rgba(220, 38, 38, 0.45);
}

.diagnostic-blank-zone span {
  position: absolute;
  right: 8px;
  bottom: 6px;
  font-size: 10px;
  font-weight: 700;
  color: #9a4e2a;
  background: rgba(255, 255, 255, 0.86);
  padding: 2px 6px;
  border-radius: 999px;
}

</style>
