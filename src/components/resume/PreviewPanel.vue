<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useResumeStore } from '@/stores/resume'
import TemplatePickerDialog from '@/components/resume/TemplatePickerDialog.vue'
import {
  RESUME_TEMPLATES,
  getResumeTemplateByKey,
  type ResumeTemplateDefinition,
  type ResumeTemplateKey,
} from '@/templates/resume'
import { generateResumeMarkdown, downloadMarkdown } from '@/services/exportMarkdown'

const store = useResumeStore()
const resumeRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const exporting = ref(false)
const exportProgress = ref(0)
const exportProgressText = ref('')
type ExportQualityMode = 'compressed' | 'hd'
const exportMenuOpen = ref(false)
const exportMenuRef = ref<HTMLElement | null>(null)
const templatePickerOpen = ref(false)

// AI Generated Start
/** 预览画布宽度（px）对应 A4 纸宽；长边按同比例换算，与 ISO A4 几何一致 */
const A4_WIDTH = 794
const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297
const PX_PER_MM = A4_WIDTH / A4_WIDTH_MM
const A4_HEIGHT = Math.round(A4_HEIGHT_MM * PX_PER_MM)
/** 底边距（及第 2 页起顶边距）：5mm */
const PAGE_MARGIN_MM = 5
const PAGE_MARGIN_PX = Math.round(PAGE_MARGIN_MM * PX_PER_MM)
/** 第 2 页起：A4 可排版区域（297 − 2×边距）在预览中的 px */
const USABLE_PAGE_CONTENT_HEIGHT = Math.max(0, A4_HEIGHT - 2 * PAGE_MARGIN_PX)
/** 第 1 页：无上边距，仅保留下边距（A4 高 − PAGE_MARGIN_MM）在预览中的 px */
const FIRST_PAGE_USABLE_CONTENT_HEIGHT = Math.max(0, A4_HEIGHT - PAGE_MARGIN_PX)
/** PDF：第 1 页版心高度（mm），顶贴边、底留边距 */
const A4_PDF_FIRST_PAGE_INNER_HEIGHT_MM = A4_HEIGHT_MM - PAGE_MARGIN_MM
/** PDF：第 2 页起版心高度（mm），上下均留边距 */
const A4_PDF_INNER_HEIGHT_MM = A4_HEIGHT_MM - 2 * PAGE_MARGIN_MM

const pageBreaks = ref<number[]>([])
const lastPageSpacerHeight = ref(0)

type PageLayout = {
  breaks: number[]
  lastPageSpacerHeight: number
  contentHeight: number
  /** 版心高度：正文 + 末页补齐空白（不含上下边距） */
  innerTotalHeight: number
  /** 与导出画布一致：版心总高度（正文 + 末页补齐），纸张无额外 padding */
  fullPaperHeight: number
}

/** 版心内额外留白（px），避免贴底裁字；不宜过大，否则会像「提前很多就分页」 */
const SAFE_PAGE_BOTTOM_GAP = Math.max(4, Math.round(PAGE_MARGIN_PX * 0.25))
const MIN_PAGE_CONTENT_HEIGHT = 160
const BREAK_MIN_SPACING = 12

type LineBand = { top: number; bottom: number }

/** 收集每行文字的 top/bottom（相对 root），不按块类型区分 */
function collectLineBands(root: HTMLElement, contentHeight: number): LineBand[] {
  const rootRect = root.getBoundingClientRect()
  const bands: LineBand[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      const text = node.textContent?.replace(/\s+/g, '') ?? ''
      if (!parent || !text) return NodeFilter.FILTER_REJECT
      const style = window.getComputedStyle(parent)
      return style.display === 'none' || style.visibility === 'hidden'
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT
    },
  })

  const range = document.createRange()
  while (walker.nextNode()) {
    range.selectNodeContents(walker.currentNode)
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.height < 8 || rect.width < 4) continue
      const top = Math.round(rect.top - rootRect.top)
      const bottom = Math.round(rect.bottom - rootRect.top)
      if (top < BREAK_MIN_SPACING || bottom > contentHeight - BREAK_MIN_SPACING) continue
      bands.push({ top, bottom })
    }
  }
  range.detach?.()

  bands.sort((a, b) => a.top - b.top || a.bottom - b.bottom)
  return bands
}

/**
 * 本页允许排到的最底行：用「行底 <= pageEnd」找最后一行能完整落在本页的；
 * 断点 = 下一行 top。若没有下一行，说明从 minTop 起正文已全部落在本页内（余量只是模板 padding），
 * 应返回 null，禁止再用 pageEnd 在「无字区域」切一刀 —— 否则会多出一整页空白 + spacer。
 */
function chooseBreakAfterLastLineThatFits(
  bands: LineBand[],
  minTop: number,
  pageEnd: number,
  contentHeight: number,
): number | null {
  const maxY = contentHeight - BREAK_MIN_SPACING
  let lastFit: LineBand | null = null
  for (const b of bands) {
    if (b.top < minTop) continue
    if (b.bottom <= pageEnd && b.bottom <= maxY) {
      if (!lastFit || b.bottom > lastFit.bottom) lastFit = b
    }
  }

  if (lastFit) {
    let nextTop: number | null = null
    for (const b of bands) {
      if (b.top <= lastFit.top) continue
      if (b.top >= lastFit.bottom - 1) {
        if (nextTop === null || b.top < nextTop) nextTop = b.top
      }
    }
    if (nextTop === null) {
      let fallbackNext: number | null = null
      for (const b of bands) {
        if (b.top > lastFit.bottom + 2 && b.top <= maxY) {
          if (fallbackNext === null || b.top < fallbackNext) fallbackNext = b.top
        }
      }
      if (fallbackNext === null) {
        return null
      }
      return Math.min(Math.max(fallbackNext, minTop), maxY)
    }
    const y = nextTop
    return Math.min(Math.max(y, minTop), maxY)
  }

  let firstOnPage: number | null = null
  for (const b of bands) {
    if (b.top >= minTop && b.top <= maxY) {
      if (firstOnPage === null || b.top < firstOnPage) firstOnPage = b.top
    }
  }
  if (firstOnPage !== null) return firstOnPage

  return Math.min(Math.max(Math.round(pageEnd), minTop), maxY)
}

function computePageLayout(root: HTMLElement): PageLayout {
  const contentHeight = Math.max(root.scrollHeight, Math.ceil(root.getBoundingClientRect().height))
  if (contentHeight <= 0) {
    return {
      breaks: [],
      lastPageSpacerHeight: 0,
      contentHeight: 0,
      innerTotalHeight: 0,
      fullPaperHeight: A4_HEIGHT,
    }
  }

  const lineBands = collectLineBands(root, contentHeight)
  const breaks: number[] = []
  let currentTop = 0

  while (true) {
    const usable =
      currentTop === 0 ? FIRST_PAGE_USABLE_CONTENT_HEIGHT : USABLE_PAGE_CONTENT_HEIGHT
    if (contentHeight - currentTop <= usable) break

    const minTop = currentTop + MIN_PAGE_CONTENT_HEIGHT
    const pageEnd = currentTop + usable - SAFE_PAGE_BOTTOM_GAP
    if (pageEnd <= minTop) break

    const nextBreak = chooseBreakAfterLastLineThatFits(lineBands, minTop, pageEnd, contentHeight)
    if (nextBreak === null) {
      break
    }
    const clampedBreak = Math.max(minTop, Math.min(nextBreak, contentHeight - BREAK_MIN_SPACING))
    if (clampedBreak <= currentTop + BREAK_MIN_SPACING) break

    breaks.push(clampedBreak)
    currentTop = clampedBreak
  }

  const usedOnLastPage = Math.max(0, contentHeight - currentTop)
  const lastPageUsable =
    breaks.length === 0 ? FIRST_PAGE_USABLE_CONTENT_HEIGHT : USABLE_PAGE_CONTENT_HEIGHT
  const spacerHeight =
    usedOnLastPage > 0 && usedOnLastPage < lastPageUsable ? lastPageUsable - usedOnLastPage : 0

  const innerTotalHeight = contentHeight + spacerHeight
  return {
    breaks,
    lastPageSpacerHeight: spacerHeight,
    contentHeight,
    innerTotalHeight,
    fullPaperHeight: innerTotalHeight,
  }
}
// AI Generated End

const fallbackTemplate: ResumeTemplateDefinition = getResumeTemplateByKey('default')
const currentTemplate = computed<ResumeTemplateDefinition>(
  () => getResumeTemplateByKey(store.selectedTemplateKey) ?? fallbackTemplate
)
const currentTemplateComponent = computed(() => currentTemplate.value.component)
const a4TemplateLabel = computed(() => `A4 / ${currentTemplate.value.name}`)

function waitNextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

async function setExportProgress(percent: number, text: string) {
  exportProgress.value = Math.max(0, Math.min(100, Math.round(percent)))
  exportProgressText.value = text
  await nextTick()
  await waitNextFrame()
}

/**
 * 与导出共用同一套测量：先等字体就绪（与 html2canvas 一致），再算断页。
 * 预览纸张无 padding（与 pdf-exporting 克隆一致），分页线位置与 PDF 切片对齐。
 */
async function refreshPreviewPageLayout(): Promise<PageLayout | null> {
  if (!contentRef.value) return null
  await document.fonts?.ready
  const layout = computePageLayout(contentRef.value)
  pageBreaks.value = layout.breaks
  lastPageSpacerHeight.value = layout.lastPageSpacerHeight
  return layout
}

function openTemplatePicker() {
  templatePickerOpen.value = true
  exportMenuOpen.value = false
}

function chooseTemplate(key: ResumeTemplateKey) {
  store.setTemplate(key)
  templatePickerOpen.value = false
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  void nextTick(async () => {
    await refreshPreviewPageLayout()
    if (contentRef.value) {
      resizeObserver = new ResizeObserver(() => {
        void refreshPreviewPageLayout()
      })
      resizeObserver.observe(contentRef.value)
    }
  })
  document.addEventListener('mousedown', handleDocumentPointerDown)
})

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

onUnmounted(() => {
  resizeObserver?.disconnect()
  document.removeEventListener('mousedown', handleDocumentPointerDown)
})

function handleExportTriggerClick() {
  if (exporting.value) return
  exportMenuOpen.value = !exportMenuOpen.value
}

function handleExportTriggerEnter() {
  if (exporting.value) return
  exportMenuOpen.value = true
}

function handleDocumentPointerDown(event: MouseEvent) {
  const target = event.target as Node | null
  if (!target || !exportMenuRef.value) return
  if (!exportMenuRef.value.contains(target)) {
    exportMenuOpen.value = false
  }
}

function handleExportMarkdown() {
  exportMenuOpen.value = false
  const md = generateResumeMarkdown(store)
  const name = store.basicInfo.name?.trim() || '简历'
  downloadMarkdown(`${name}_简历.md`, md)
}

async function exportPDF(mode: ExportQualityMode) {
  if (!resumeRef.value || !contentRef.value) return
  exporting.value = true
  exportMenuOpen.value = false
  exportProgress.value = 0
  exportProgressText.value = '准备导出...'
  // AI Generated Start
  const layout = await refreshPreviewPageLayout()
  if (!layout) {
    exporting.value = false
    return
  }
  await nextTick()
  await waitNextFrame()
  // AI Generated End
  const isHdMode = mode === 'hd'
  const sourceNode = resumeRef.value
  const exportHost = document.createElement('div')
  exportHost.style.position = 'fixed'
  exportHost.style.left = '-10000px'
  exportHost.style.top = '0'
  exportHost.style.width = `${A4_WIDTH}px`
  exportHost.style.pointerEvents = 'none'
  exportHost.style.opacity = '0'
  exportHost.style.zIndex = '-1'

  const exportNode = sourceNode.cloneNode(true) as HTMLElement
  exportNode.classList.add('pdf-exporting')
  exportNode.style.width = `${A4_WIDTH}px`
  exportNode.style.height = 'auto'
  exportNode.style.minHeight = 'auto'
  exportNode.style.margin = '0'
  exportNode.style.overflow = 'visible'

  exportHost.appendChild(exportNode)
  document.body.appendChild(exportHost)

  try {
    await setExportProgress(8, '准备导出资源...')
    await document.fonts?.ready
    await setExportProgress(18, '加载导出引擎...')
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
    await setExportProgress(36, '正在渲染简历画布...')
    const exportScale = isHdMode ? Math.min(4, Math.max(3, window.devicePixelRatio || 1)) : 2
    const canvas = await html2canvas(exportNode, {
      scale: exportScale,
      useCORS: true,
      width: A4_WIDTH,
      windowWidth: A4_WIDTH,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
    })
    await setExportProgress(68, '正在分页生成 PDF...')

    const pdf = new jsPDF({
      unit: 'mm',
      format: 'a4',
      orientation: 'portrait',
      compress: !isHdMode,
    })

    // AI Generated Start
    const innerTotal = layout.innerTotalHeight
    const scaleY = innerTotal > 0 ? canvas.height / innerTotal : 1
    const scaledBoundaries = [0, ...layout.breaks.map((b) => Math.max(0, Math.min(canvas.height, Math.round(b * scaleY)))), canvas.height]
    const pageSlices = scaledBoundaries
      .slice(0, -1)
      .map((start, index) => ({
        start,
        height: Math.max(0, (scaledBoundaries[index + 1] ?? canvas.height) - start),
      }))
      .filter((slice) => slice.height > 2)

    if (pageSlices.length === 0) {
      pageSlices.push({
        start: 0,
        height: canvas.height,
      })
    }

    const totalPages = pageSlices.length

    for (const [pageIndex, slice] of pageSlices.entries()) {
      const { start, height } = slice

      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = canvas.width
      pageCanvas.height = height
      const ctx = pageCanvas.getContext('2d')
      if (!ctx) break
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
      ctx.drawImage(canvas, 0, start, canvas.width, height, 0, 0, canvas.width, height)

      const imgData = isHdMode ? pageCanvas.toDataURL('image/png') : pageCanvas.toDataURL('image/jpeg', 0.92)
      const pdfPageWidthMm = A4_WIDTH_MM
      let imgWidthMm = pdfPageWidthMm
      let imgHeightMm = (height / canvas.width) * imgWidthMm
      const pdfInnerHeightMm =
        pageIndex === 0 ? A4_PDF_FIRST_PAGE_INNER_HEIGHT_MM : A4_PDF_INNER_HEIGHT_MM
      if (imgHeightMm > pdfInnerHeightMm) {
        const scale = pdfInnerHeightMm / imgHeightMm
        imgHeightMm = pdfInnerHeightMm
        imgWidthMm *= scale
      }

      if (pageIndex > 0) pdf.addPage('a4', 'portrait')
      pdf.addImage(
        imgData,
        isHdMode ? 'PNG' : 'JPEG',
        0,
        pageIndex === 0 ? 0 : PAGE_MARGIN_MM,
        imgWidthMm,
        imgHeightMm,
        undefined,
        isHdMode ? 'NONE' : 'FAST',
      )
      const pageProgress = 68 + Math.round((Math.min(pageIndex + 1, totalPages) / totalPages) * 28)
      await setExportProgress(pageProgress, `正在写入第 ${Math.min(pageIndex + 1, totalPages)}/${totalPages} 页...`)
    }
    // AI Generated End

    await setExportProgress(98, '正在保存文件...')
    pdf.save(`${store.basicInfo.name || '简历'}_resume.pdf`)
    await setExportProgress(100, '导出完成')
  } catch (err) {
    console.error('PDF export failed:', err)
  } finally {
    exportHost.remove()
    exportProgress.value = 0
    exportProgressText.value = ''
    exporting.value = false
  }
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
      </div>
      <div
        ref="exportMenuRef"
        class="export-actions export-dropdown"
        @mouseenter="handleExportTriggerEnter"
      >
        <button class="btn-export" :disabled="exporting" @click="handleExportTriggerClick">
          {{ exporting ? '导出中...' : '导出' }}
        </button>
        <div v-if="exportMenuOpen && !exporting" class="export-menu">
          <button class="export-menu-item" @click="exportPDF('hd')">导出高清 PDF</button>
          <button class="export-menu-item" @click="exportPDF('compressed')">导出压缩 PDF</button>
          <button class="export-menu-item" @click="handleExportMarkdown">导出 Markdown</button>
        </div>
      </div>
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
            minHeight: `${A4_HEIGHT}px`,
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

        <!-- AI Generated Start -->
        <div v-for="(pos, idx) in pageBreaks" :key="idx" class="page-line" :style="{ top: `${pos}px` }">
          <span>第{{ idx + 2 }}页</span>
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

.btn-export {
  border: none;
  height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  background: #2d2521;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}

.btn-export:disabled {
  opacity: 0.7;
  cursor: wait;
}

.export-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.export-dropdown {
  position: relative;
}

.export-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 124px;
  padding: 4px;
  border-radius: 8px;
  border: 1px solid #e9ded0;
  background: #fff;
  box-shadow: 0 10px 20px rgba(45, 37, 33, 0.14);
  z-index: 12;
}

.export-menu-item {
  width: 100%;
  border: none;
  border-radius: 6px;
  background: #fff;
  color: #2d2521;
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  padding: 7px 8px;
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease;
}

.export-menu-item:hover {
  background: #eadccf;
  color: #1f1916;
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
</style>
