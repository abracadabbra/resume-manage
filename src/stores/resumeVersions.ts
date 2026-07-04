import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { loadJson, saveJson } from '@/services/safeStorage'

/**
 * 简历多版本管理 store
 *
 * 用户可以保存当前简历的命名快照（如"投阿里版"、"投字节版"），
 * 后续可一键切换/恢复。所有版本存 localStorage。
 *
 * 注意：版本只保存简历数据快照，不含 undo/redo 栈。
 */

export interface ResumeVersion {
  id: string
  name: string
  createdAt: number
  // 简历数据快照（resumeStore.getSnapshot() 的返回值）
  data: unknown
}

const STORAGE_KEY = 'resume-versions'
const VERSIONS_MAX = 20

function loadVersions(): ResumeVersion[] {
  return loadJson<ResumeVersion[]>(localStorage, STORAGE_KEY, []).value
}

function saveVersions(versions: ResumeVersion[]) {
  saveJson(localStorage, STORAGE_KEY, versions)
}

function createVersionId(): string {
  return `rv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export const useResumeVersionsStore = defineStore('resumeVersions', () => {
  const versions = ref<ResumeVersion[]>(loadVersions())
  const activeVersionId = ref<string | null>(null)

  const sortedVersions = computed(() =>
    [...versions.value].sort((a, b) => b.createdAt - a.createdAt),
  )

  const canSave = computed(() => versions.value.length < VERSIONS_MAX)

  function saveCurrentAsVersion(name: string, data: unknown): ResumeVersion | null {
    const trimmed = name.trim()
    if (!trimmed) return null
    if (versions.value.length >= VERSIONS_MAX) return null

    const version: ResumeVersion = {
      id: createVersionId(),
      name: trimmed,
      createdAt: Date.now(),
      data,
    }
    versions.value.push(version)
    saveVersions(versions.value)
    return version
  }

  function updateVersionName(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const version = versions.value.find((v) => v.id === id)
    if (!version) return
    version.name = trimmed
    saveVersions(versions.value)
  }

  function deleteVersion(id: string) {
    const idx = versions.value.findIndex((v) => v.id === id)
    if (idx === -1) return
    versions.value.splice(idx, 1)
    if (activeVersionId.value === id) {
      activeVersionId.value = null
    }
    saveVersions(versions.value)
  }

  function getVersionData(id: string): unknown | null {
    const version = versions.value.find((v) => v.id === id)
    return version?.data ?? null
  }

  function setActiveVersion(id: string | null) {
    activeVersionId.value = id
  }

  return {
    versions,
    activeVersionId,
    sortedVersions,
    canSave,
    saveCurrentAsVersion,
    updateVersionName,
    deleteVersion,
    getVersionData,
    setActiveVersion,
  }
})
