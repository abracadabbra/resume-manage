// @vitest-environment jsdom
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useResumeStore } from '@/stores/resume'
import { useResumeJsonIO } from '@/components/resume/composables/useResumeJsonIO'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key)
    }),
  }
}

describe('useResumeJsonIO', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('localStorage', createStorage())
  })

  it('exports current resume as json blob', async () => {
    const store = useResumeStore()
    const urlCreator = vi.fn(() => 'blob:fake-url')
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = urlCreator
    URL.revokeObjectURL = vi.fn()

    // 模拟 click 触发下载
    const linkClick = vi.fn()
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag)
      if (tag === 'a') {
        el.click = linkClick
      }
      return el
    })
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as never)
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as never)

    const { handleExport, successMsg } = useResumeJsonIO(store)

    store.basicInfo.name = '张三'
    handleExport()

    expect(successMsg.value).toBe('已导出简历文件')
    expect(linkClick).toHaveBeenCalled()

    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
    vi.restoreAllMocks()
  })

  it('rejects non-json file on import', async () => {
    const store = useResumeStore()
    const { handleImport, errorMsg } = useResumeJsonIO(store)

    const file = new File(['content'], 'resume.txt', { type: 'text/plain' })
    await handleImport(file)

    expect(errorMsg.value).toBe('请选择 .json 文件')
  })

  it('rejects invalid json content', async () => {
    const store = useResumeStore()
    const { handleImport, errorMsg } = useResumeJsonIO(store)

    const file = new File(['not json content'], 'resume.json', { type: 'application/json' })
    await handleImport(file)

    expect(errorMsg.value).toBe('文件不是合法的 JSON')
  })

  it('rejects payload with wrong version', async () => {
    const store = useResumeStore()
    const { handleImport, errorMsg } = useResumeJsonIO(store)

    const payload = JSON.stringify({ version: 999, data: {} })
    const file = new File([payload], 'resume.json', { type: 'application/json' })
    await handleImport(file)

    expect(errorMsg.value).toContain('版本不兼容')
  })

  it('rejects payload without data field', async () => {
    const store = useResumeStore()
    const { handleImport, errorMsg } = useResumeJsonIO(store)

    const payload = JSON.stringify({ version: 1, exportedAt: Date.now() })
    const file = new File([payload], 'resume.json', { type: 'application/json' })
    await handleImport(file)

    expect(errorMsg.value).toBe('文件缺少简历数据')
  })

  it('loads snapshot into store on valid import', async () => {
    const store = useResumeStore()
    const { handleImport, successMsg } = useResumeJsonIO(store)

    // 构造一个有效的导出文件
    const snapshot = store.getSnapshot()
    const payload = JSON.stringify({
      version: 1,
      exportedAt: Date.now(),
      data: snapshot,
    })
    const file = new File([payload], 'resume.json', { type: 'application/json' })

    // 修改 store 后再导入，验证是否覆盖
    store.basicInfo.name = '临时改名'
    await handleImport(file)

    expect(successMsg.value).toBe('已导入简历数据')
    // 验证 store 已被覆盖（loadSnapshot 后名字应回到原值）
    expect(store.basicInfo.name).toBe(snapshot.basicInfo.name)
  })
})
