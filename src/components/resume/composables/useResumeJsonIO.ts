import { ref } from 'vue'
import type { useResumeStore } from '@/stores/resume'

type ResumeStore = ReturnType<typeof useResumeStore>

const EXPORT_VERSION = 1

interface ResumeExportPayload {
  version: number
  exportedAt: number
  data: unknown
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function buildExportFileName(date: Date): string {
  const y = date.getFullYear()
  const m = pad2(date.getMonth() + 1)
  const d = pad2(date.getDate())
  const h = pad2(date.getHours())
  const mi = pad2(date.getMinutes())
  const s = pad2(date.getSeconds())
  return `resume-${y}${m}${d}-${h}${mi}${s}.json`
}

function triggerDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function useResumeJsonIO(store: ResumeStore) {
  const errorMsg = ref('')
  const successMsg = ref('')
  let successTimer: ReturnType<typeof setTimeout> | null = null

  function showSuccess(message: string) {
    successMsg.value = message
    if (successTimer) clearTimeout(successTimer)
    successTimer = setTimeout(() => {
      successMsg.value = ''
      successTimer = null
    }, 2400)
  }

  function showError(message: string) {
    errorMsg.value = message
    if (successTimer) clearTimeout(successTimer)
    successTimer = setTimeout(() => {
      errorMsg.value = ''
      successTimer = null
    }, 3200)
  }

  function handleExport() {
    try {
      const payload: ResumeExportPayload = {
        version: EXPORT_VERSION,
        exportedAt: Date.now(),
        data: store.getSnapshot(),
      }
      const content = JSON.stringify(payload, null, 2)
      const filename = buildExportFileName(new Date())
      triggerDownload(filename, content)
      showSuccess('已导出简历文件')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      showError(`导出失败: ${message}`)
    }
  }

  async function handleImport(file: File): Promise<void> {
    errorMsg.value = ''
    successMsg.value = ''

    if (!file.name.toLowerCase().endsWith('.json')) {
      showError('请选择 .json 文件')
      return
    }

    let text: string
    try {
      text = await file.text()
    } catch {
      showError('读取文件失败，请重试')
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      showError('文件不是合法的 JSON')
      return
    }

    const payload = parsed as Partial<ResumeExportPayload>
    if (!payload || typeof payload !== 'object') {
      showError('文件内容格式不正确')
      return
    }
    if (payload.version !== EXPORT_VERSION) {
      showError(`文件版本不兼容（当前支持 v${EXPORT_VERSION}）`)
      return
    }
    if (!payload.data || typeof payload.data !== 'object') {
      showError('文件缺少简历数据')
      return
    }

    try {
      store.loadSnapshot(payload.data)
      store.saveToStorage('manual')
      showSuccess('已导入简历数据')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      showError(`导入失败: ${message}`)
    }
  }

  return {
    errorMsg,
    successMsg,
    handleExport,
    handleImport,
  }
}
