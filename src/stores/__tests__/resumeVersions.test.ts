import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useResumeVersionsStore } from '@/stores/resumeVersions'

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

describe('resumeVersions store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('localStorage', createStorage())
  })

  it('starts with empty versions', () => {
    const store = useResumeVersionsStore()
    expect(store.versions).toHaveLength(0)
    expect(store.sortedVersions).toEqual([])
    expect(store.canSave).toBe(true)
  })

  it('saves current snapshot as a named version', () => {
    const store = useResumeVersionsStore()
    const data = { basicInfo: { name: '张三' } }

    const version = store.saveCurrentAsVersion('投阿里版', data)

    expect(version).not.toBeNull()
    expect(version?.name).toBe('投阿里版')
    expect(version?.data).toEqual(data)
    expect(store.versions).toHaveLength(1)
    expect(store.canSave).toBe(true)
  })

  it('rejects empty name', () => {
    const store = useResumeVersionsStore()
    const version = store.saveCurrentAsVersion('   ', { foo: 1 })
    expect(version).toBeNull()
    expect(store.versions).toHaveLength(0)
  })

  it('persists to localStorage', () => {
    const store = useResumeVersionsStore()
    store.saveCurrentAsVersion('v1', { data: 1 })

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'resume-versions',
      expect.stringContaining('"name":"v1"'),
    )
  })

  it('updates version name', () => {
    const store = useResumeVersionsStore()
    const v = store.saveCurrentAsVersion('旧名', { data: 1 })
    if (!v) throw new Error('version not created')

    store.updateVersionName(v.id, '新名')

    expect(store.versions[0].name).toBe('新名')
  })

  it('ignores empty name on update', () => {
    const store = useResumeVersionsStore()
    const v = store.saveCurrentAsVersion('原名', { data: 1 })
    if (!v) throw new Error('version not created')

    store.updateVersionName(v.id, '   ')

    expect(store.versions[0].name).toBe('原名')
  })

  it('deletes a version', () => {
    const store = useResumeVersionsStore()
    const v1 = store.saveCurrentAsVersion('v1', { data: 1 })
    const v2 = store.saveCurrentAsVersion('v2', { data: 2 })
    if (!v1 || !v2) throw new Error('versions not created')

    store.deleteVersion(v1.id)

    expect(store.versions).toHaveLength(1)
    expect(store.versions[0].id).toBe(v2.id)
  })

  it('clears activeVersionId when deleting active version', () => {
    const store = useResumeVersionsStore()
    const v = store.saveCurrentAsVersion('v1', { data: 1 })
    if (!v) throw new Error('version not created')

    store.setActiveVersion(v.id)
    expect(store.activeVersionId).toBe(v.id)

    store.deleteVersion(v.id)
    expect(store.activeVersionId).toBeNull()
  })

  it('returns version data by id', () => {
    const store = useResumeVersionsStore()
    const data = { foo: 'bar' }
    const v = store.saveCurrentAsVersion('v1', data)
    if (!v) throw new Error('version not created')

    expect(store.getVersionData(v.id)).toEqual(data)
    expect(store.getVersionData('nonexistent')).toBeNull()
  })

  it('sorts versions by createdAt descending', () => {
    const store = useResumeVersionsStore()
    const v1 = store.saveCurrentAsVersion('v1', { data: 1 })
    // 确保时间戳不同
    const originalNow = Date.now
    Date.now = () => originalNow() + 1000
    const v2 = store.saveCurrentAsVersion('v2', { data: 2 })
    Date.now = originalNow
    if (!v1 || !v2) throw new Error('versions not created')

    const sorted = store.sortedVersions
    expect(sorted[0].id).toBe(v2.id)
    expect(sorted[1].id).toBe(v1.id)
  })
})
