import { nextTick, ref, type Ref } from 'vue'
import type { PageLayout } from '@/components/resume/useResumePagination'
import {
  A4_HEIGHT_MM,
  A4_PDF_FIRST_PAGE_INNER_HEIGHT_MM,
  A4_PDF_INNER_HEIGHT_MM,
  A4_WIDTH,
  A4_WIDTH_MM,
  PAGE_MARGIN_MM,
} from '@/components/resume/useResumePagination'

export type ExportQualityMode = 'compressed' | 'hd'

export interface UsePdfExportOptions {
  resumeRef: Ref<HTMLElement | null>
  contentRef: Ref<HTMLElement | null>
  refreshPageLayout: () => Promise<PageLayout | null>
  getFileBaseName: () => string
}

function waitNextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

const SOFTWARE_ENGINEER_LEFT_BAR_WIDTH_PX = 6
const SOFTWARE_ENGINEER_LEFT_BAR_COLOR = '#2a5caa'
const SOFTWARE_ENGINEER_PAGE_BACKGROUND_COLOR = '#f3f7fc'
const SOFTWARE_ENGINEER_LAST_PAGE_FREE_SPACE_TOP_RATIO = 0.78
const SOFTWARE_ENGINEER_LAST_PAGE_TAIL_MM = 3

export function usePdfExport(options: UsePdfExportOptions) {
  const exporting = ref(false)
  const exportProgress = ref(0)
  const exportProgressText = ref('')

  async function setExportProgress(percent: number, text: string) {
    exportProgress.value = Math.max(0, Math.min(100, Math.round(percent)))
    exportProgressText.value = text
    await nextTick()
    await waitNextFrame()
  }

  async function exportPDF(mode: ExportQualityMode) {
    if (!options.resumeRef.value || !options.contentRef.value) return
    exporting.value = true
    exportProgress.value = 0
    exportProgressText.value = '准备导出...'

    const layout = await options.refreshPageLayout()
    if (!layout) {
      exporting.value = false
      return
    }
    await nextTick()
    await waitNextFrame()

    const isHdMode = mode === 'hd'
    const sourceNode = options.resumeRef.value
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

    const softwareEngineerTemplate = exportNode.querySelector<HTMLElement>(
      '.resume-template-software-engineer',
    )
    const isSoftwareEngineerTemplate = !!softwareEngineerTemplate

    if (softwareEngineerTemplate) {
      const exportHeight = `${layout.fullPaperHeight}px`
      exportNode.style.minHeight = exportHeight
      exportNode.style.background = 'transparent'

      const contentWrapper = softwareEngineerTemplate.parentElement
      if (contentWrapper instanceof HTMLElement && exportNode.contains(contentWrapper)) {
        contentWrapper.style.minHeight = exportHeight
        contentWrapper.style.background = 'transparent'
      }
      softwareEngineerTemplate.style.minHeight = exportHeight
      softwareEngineerTemplate.style.background = 'transparent'
    }

    try {
      await setExportProgress(8, '准备导出资源...')
      await document.fonts?.ready
      await setExportProgress(18, '加载导出引擎...')
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      await setExportProgress(36, '正在渲染简历画布...')
      const exportScale = isHdMode ? Math.min(4, Math.max(3, window.devicePixelRatio || 1)) : 2
      const canvas = await html2canvas(exportNode, {
        scale: exportScale,
        useCORS: true,
        width: A4_WIDTH,
        windowWidth: A4_WIDTH,
        backgroundColor: isSoftwareEngineerTemplate ? null : '#ffffff',
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

      const innerTotal = layout.innerTotalHeight
      const scaleY = innerTotal > 0 ? canvas.height / innerTotal : 1
      const scaledBoundaries = [
        0,
        ...layout.breaks.map((b) => Math.max(0, Math.min(canvas.height, Math.round(b * scaleY)))),
        canvas.height,
      ]
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
      const scaledContentHeight = Math.max(
        0,
        Math.min(canvas.height, Math.round(layout.contentHeight * scaleY)),
      )

      for (const [pageIndex, slice] of pageSlices.entries()) {
        const { start, height } = slice
        const isLastPage = pageIndex === totalPages - 1
        const sourceHeight =
          isSoftwareEngineerTemplate && isLastPage
            ? Math.max(1, Math.min(height, scaledContentHeight - start))
            : height
        const pdfPageWidthMm = A4_WIDTH_MM
        const imgWidthMm = pdfPageWidthMm
        const imgHeightMm = (sourceHeight / canvas.width) * imgWidthMm
        const pdfInnerHeightMm =
          pageIndex === 0 ? A4_PDF_FIRST_PAGE_INNER_HEIGHT_MM : A4_PDF_INNER_HEIGHT_MM
        const pageHeightMm = pageIndex === 0 ? A4_HEIGHT_MM - PAGE_MARGIN_MM : A4_HEIGHT_MM
        const scaledImgHeightMm = Math.min(imgHeightMm, pdfInnerHeightMm)
        const pageFreeSpaceMm = Math.max(0, pageHeightMm - 2 * PAGE_MARGIN_MM - scaledImgHeightMm)
        const yOffsetMm =
          pageIndex === 0
            ? 0
            : PAGE_MARGIN_MM +
              pageFreeSpaceMm *
                (isSoftwareEngineerTemplate && isLastPage
                  ? SOFTWARE_ENGINEER_LAST_PAGE_FREE_SPACE_TOP_RATIO
                  : 0.5)

        const pageCanvas = document.createElement('canvas')
        pageCanvas.width = canvas.width
        pageCanvas.height = isSoftwareEngineerTemplate
          ? Math.round((A4_HEIGHT_MM / A4_WIDTH_MM) * canvas.width)
          : height
        const ctx = pageCanvas.getContext('2d')
        if (!ctx) break
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)

        if (isSoftwareEngineerTemplate) {
          const yOffsetPx = Math.max(0, Math.round((yOffsetMm / A4_WIDTH_MM) * canvas.width))
          const contentHeightPx = Math.max(
            1,
            Math.min(
              pageCanvas.height - yOffsetPx,
              Math.round((scaledImgHeightMm / A4_WIDTH_MM) * canvas.width),
            ),
          )
          const tailHeightPx =
            isLastPage
              ? Math.round((SOFTWARE_ENGINEER_LAST_PAGE_TAIL_MM / A4_WIDTH_MM) * canvas.width)
              : pageCanvas.height
          const templateBottomY = isLastPage
            ? Math.min(pageCanvas.height, yOffsetPx + contentHeightPx + tailHeightPx)
            : pageCanvas.height

          ctx.fillStyle = SOFTWARE_ENGINEER_PAGE_BACKGROUND_COLOR
          ctx.fillRect(0, 0, pageCanvas.width, templateBottomY)

          ctx.drawImage(
            canvas,
            0,
            start,
            canvas.width,
            sourceHeight,
            0,
            yOffsetPx,
            canvas.width,
            contentHeightPx,
          )
        } else {
          ctx.drawImage(canvas, 0, start, canvas.width, height, 0, 0, canvas.width, height)
        }

        if (isSoftwareEngineerTemplate) {
          const scaleX = canvas.width / A4_WIDTH
          const leftBarWidth = Math.max(1, Math.round(SOFTWARE_ENGINEER_LEFT_BAR_WIDTH_PX * scaleX))
          const leftBarHeight =
            isLastPage
              ? Math.min(
                  pageCanvas.height,
                  Math.round((yOffsetMm / A4_WIDTH_MM) * canvas.width) +
                    Math.round((scaledImgHeightMm / A4_WIDTH_MM) * canvas.width) +
                    Math.round((SOFTWARE_ENGINEER_LAST_PAGE_TAIL_MM / A4_WIDTH_MM) * canvas.width),
                )
              : pageCanvas.height
          ctx.fillStyle = SOFTWARE_ENGINEER_LEFT_BAR_COLOR
          ctx.fillRect(0, 0, leftBarWidth, leftBarHeight)
        }

        const usePngImage = isHdMode
        const jpegQuality = isHdMode ? 0.92 : 0.88
        const imgData = usePngImage ? pageCanvas.toDataURL('image/png') : pageCanvas.toDataURL('image/jpeg', jpegQuality)

        if (pageIndex > 0) pdf.addPage('a4', 'portrait')
        pdf.addImage(
          imgData,
          usePngImage ? 'PNG' : 'JPEG',
          0,
          isSoftwareEngineerTemplate ? 0 : yOffsetMm,
          imgWidthMm,
          isSoftwareEngineerTemplate ? A4_HEIGHT_MM : scaledImgHeightMm,
          undefined,
          usePngImage ? 'NONE' : 'FAST',
        )
        const pageProgress = 68 + Math.round((Math.min(pageIndex + 1, totalPages) / totalPages) * 28)
        await setExportProgress(pageProgress, `正在写入第 ${Math.min(pageIndex + 1, totalPages)}/${totalPages} 页...`)
      }

      await setExportProgress(98, '正在保存文件...')
      pdf.save(`${options.getFileBaseName()}_resume.pdf`)
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

  return {
    exporting,
    exportProgress,
    exportProgressText,
    exportPDF,
  }
}
