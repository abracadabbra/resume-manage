import { computed, nextTick, onMounted, onUnmounted, ref, type Ref } from 'vue'
import {
  buildPaginationDiagnostics,
  type PaginationDiagnostics,
  type PaginationSegment,
} from '@/services/paginationDiagnostics'

/** 预览画布宽度（px）对应 A4 纸宽；长边按同比例换算，与 ISO A4 几何一致 */
export const A4_WIDTH = 794
export const A4_WIDTH_MM = 210
export const A4_HEIGHT_MM = 297
export const PX_PER_MM = A4_WIDTH / A4_WIDTH_MM
export const A4_HEIGHT = Math.round(A4_HEIGHT_MM * PX_PER_MM)
/** 底边距（及第 2 页起顶边距）：5mm */
export const PAGE_MARGIN_MM = 5
export const PAGE_MARGIN_PX = Math.round(PAGE_MARGIN_MM * PX_PER_MM)
/** 第 2 页起：A4 可排版区域（297 - 2*边距）在预览中的 px */
export const USABLE_PAGE_CONTENT_HEIGHT = Math.max(0, A4_HEIGHT - 2 * PAGE_MARGIN_PX)
/** 第 1 页：无上边距，仅保留下边距（A4 高 - PAGE_MARGIN_MM）在预览中的 px */
export const FIRST_PAGE_USABLE_CONTENT_HEIGHT = Math.max(0, A4_HEIGHT - PAGE_MARGIN_PX)
/** PDF：第 1 页版心高度（mm），顶贴边、底留边距 */
export const A4_PDF_FIRST_PAGE_INNER_HEIGHT_MM = A4_HEIGHT_MM - PAGE_MARGIN_MM
/** PDF：第 2 页起版心高度（mm），上下均留边距 */
export const A4_PDF_INNER_HEIGHT_MM = A4_HEIGHT_MM - 2 * PAGE_MARGIN_MM

export type PageLayout = {
  breaks: number[]
  lastPageSpacerHeight: number
  contentHeight: number
  /** 版心高度：正文 + 末页补齐空白（不含上下边距） */
  innerTotalHeight: number
  /** 与导出画布一致：版心总高度（正文 + 末页补齐），纸张无额外 padding */
  fullPaperHeight: number
}

type LineBand = { top: number; bottom: number }

/** 版心内额外留白（px），避免贴底裁字；不宜过大，否则会像「提前很多就分页」 */
const SAFE_PAGE_BOTTOM_GAP = Math.max(4, Math.round(PAGE_MARGIN_PX * 0.25))
const MIN_PAGE_CONTENT_HEIGHT = 160
const BREAK_MIN_SPACING = 12
const BREAK_AFTER_LINE_GAP = Math.max(2, Math.round(PAGE_MARGIN_PX * 0.15))

function clipDiagnosticLabel(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  return normalized.length > 24 ? `${normalized.slice(0, 24)}...` : normalized
}

function collectPaginationSegments(root: HTMLElement): PaginationSegment[] {
  const rootRect = root.getBoundingClientRect()
  const unique = new Set<string>()
  const segments: PaginationSegment[] = []
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('*'))

  for (const element of candidates) {
    const text = clipDiagnosticLabel(element.textContent ?? '')
    if (!text) continue

    const style = window.getComputedStyle(element)
    if (style.display === 'inline' || style.display === 'contents' || style.visibility === 'hidden') continue

    const rect = element.getBoundingClientRect()
    const height = rect.height
    if (height < 18 || height > 360) continue

    const top = Math.max(0, Math.round(rect.top - rootRect.top))
    const bottom = Math.max(top, Math.round(rect.bottom - rootRect.top))
    const key = `${top}:${bottom}:${text}`
    if (unique.has(key)) continue
    unique.add(key)
    segments.push({ top, bottom, label: text })
  }

  segments.sort((a, b) => a.top - b.top || a.bottom - b.bottom)
  return segments
}

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
    const y = Math.min(lastFit.bottom + BREAK_AFTER_LINE_GAP, pageEnd)
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

function hasTextAfterBreak(bands: LineBand[], breakTop: number, contentHeight: number): boolean {
  const maxY = contentHeight - BREAK_MIN_SPACING
  return bands.some((b) => b.top > breakTop + 1 && b.top <= maxY)
}

export function computePageLayout(root: HTMLElement): PageLayout {
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

  let paperEnd = contentHeight
  while (breaks.length > 0) {
    const lastBreak = breaks[breaks.length - 1]
    if (lastBreak === undefined || hasTextAfterBreak(lineBands, lastBreak, contentHeight)) break
    paperEnd = lastBreak
    breaks.pop()
  }

  const spacerHeight = 0
  const innerTotalHeight = Math.max(A4_HEIGHT, paperEnd + spacerHeight)
  return {
    breaks,
    lastPageSpacerHeight: spacerHeight,
    contentHeight,
    innerTotalHeight,
    fullPaperHeight: innerTotalHeight,
  }
}

export function useResumePagination(
  contentRef: Ref<HTMLElement | null>,
  diagnosticMode: Ref<boolean>,
) {
  const pageBreaks = ref<number[]>([])
  const lastPageSpacerHeight = ref(0)
  const paperHeight = ref(A4_HEIGHT)
  const currentLayout = ref<PageLayout | null>(null)

  const paginationDiagnostics = computed<PaginationDiagnostics | null>(() => {
    if (!diagnosticMode.value || !currentLayout.value || !contentRef.value) return null
    return buildPaginationDiagnostics({
      breaks: currentLayout.value.breaks,
      contentHeight: currentLayout.value.contentHeight,
      innerTotalHeight: currentLayout.value.innerTotalHeight,
      firstPageUsableHeight: FIRST_PAGE_USABLE_CONTENT_HEIGHT,
      regularPageUsableHeight: USABLE_PAGE_CONTENT_HEIGHT,
      segments: collectPaginationSegments(contentRef.value),
    })
  })

  const pageDiagnostics = computed(() => paginationDiagnostics.value?.pages ?? [])
  const blankZones = computed(() =>
    pageDiagnostics.value
      .filter((page) => page.blankHeight > 16)
      .map((page) => ({
        key: `blank-${page.pageNumber}`,
        top: page.start + page.usedHeight,
        height: page.blankHeight,
        label: `留白 ${page.blankHeight}px`,
        suspicious: page.suspiciousBlank,
      })),
  )

  async function refreshPreviewPageLayout(): Promise<PageLayout | null> {
    if (!contentRef.value) return null
    await document.fonts?.ready
    const layout = computePageLayout(contentRef.value)
    pageBreaks.value = layout.breaks
    lastPageSpacerHeight.value = layout.lastPageSpacerHeight
    paperHeight.value = layout.fullPaperHeight
    currentLayout.value = layout
    return layout
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
  })

  onUnmounted(() => {
    resizeObserver?.disconnect()
  })

  return {
    pageBreaks,
    lastPageSpacerHeight,
    paperHeight,
    currentLayout,
    paginationDiagnostics,
    pageDiagnostics,
    blankZones,
    refreshPreviewPageLayout,
  }
}
