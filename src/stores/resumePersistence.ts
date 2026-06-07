import type { ResumeTemplateKey } from '@/templates/resume'
import type {
  AwardEntry,
  BasicInfo,
  EducationEntry,
  ModuleConfig,
  ProjectEntry,
  WorkEntry,
} from './resume'

type ValueRef<T> = { value: T }

export interface ResumeDraftData {
  modules: ModuleConfig[]
  selectedTemplateKey: ResumeTemplateKey
  basicInfo: BasicInfo
  educationList: EducationEntry[]
  skills: string
  certificate: string
  workList: WorkEntry[]
  projectList: ProjectEntry[]
  awardList: AwardEntry[]
  selfIntro: string
}

interface LegacyResumeDraftData extends Partial<ResumeDraftData> {
  selectedTemplateId?: unknown
}

export interface ResumeMutableState {
  modules: ModuleConfig[]
  selectedTemplateKey: ValueRef<ResumeTemplateKey>
  basicInfo: BasicInfo
  educationList: EducationEntry[]
  skills: ValueRef<string>
  certificate: ValueRef<string>
  workList: WorkEntry[]
  projectList: ProjectEntry[]
  awardList: AwardEntry[]
  selfIntro: ValueRef<string>
}

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface StorageLoadResult {
  data: unknown | null
  error: unknown | null
}

type TemplateKeyNormalizer = (value: unknown) => ResumeTemplateKey

function cloneModuleConfig(module: ModuleConfig): ModuleConfig {
  return { ...module }
}

function extractModuleKey(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const key = Reflect.get(value, 'key')
  return typeof key === 'string' && key.trim() ? key : null
}

export function createResumeDataSnapshot(state: ResumeMutableState): ResumeDraftData {
  return {
    modules: state.modules.map(cloneModuleConfig),
    selectedTemplateKey: state.selectedTemplateKey.value,
    basicInfo: { ...state.basicInfo },
    educationList: state.educationList.map((entry) => ({ ...entry })),
    skills: state.skills.value,
    certificate: state.certificate.value,
    workList: state.workList.map((entry) => ({ ...entry })),
    projectList: state.projectList.map((entry) => ({ ...entry })),
    awardList: state.awardList.map((entry) => ({ ...entry })),
    selfIntro: state.selfIntro.value,
  }
}

export function normalizeModuleConfigs(
  storedModules: unknown,
  fallbackModules: readonly ModuleConfig[],
): ModuleConfig[] {
  const fallbackList = fallbackModules.map(cloneModuleConfig)
  if (!Array.isArray(storedModules)) return fallbackList

  const byKey = new Map<string, ModuleConfig>()
  storedModules.forEach((module) => {
    const key = extractModuleKey(module)
    if (key) {
      byKey.set(key, module as ModuleConfig)
    }
  })

  const orderedKeys = [
    'basicInfo',
    ...storedModules
      .map(extractModuleKey)
      .filter((key): key is string => Boolean(key && key !== 'basicInfo')),
  ]

  const nextModules: ModuleConfig[] = []
  const seen = new Set<string>()

  orderedKeys.forEach((key) => {
    if (seen.has(key)) return
    seen.add(key)
    const fallback = fallbackList.find((module) => module.key === key)
    if (!fallback) return
    nextModules.push({ ...fallback, ...byKey.get(key) })
  })

  fallbackList.forEach((module) => {
    if (seen.has(module.key)) return
    nextModules.push({ ...module, ...byKey.get(module.key) })
  })

  return nextModules
}

export function applyResumeData(
  state: ResumeMutableState,
  source: unknown,
  normalizeTemplateKey: TemplateKeyNormalizer,
) {
  if (!source || typeof source !== "object") return

  const data = source as LegacyResumeDraftData

  if ('modules' in data) {
    state.modules.splice(
      0,
      state.modules.length,
      ...normalizeModuleConfigs(data.modules, state.modules),
    )
  }

  state.selectedTemplateKey.value = normalizeTemplateKey(
    data.selectedTemplateKey ?? data.selectedTemplateId,
  )

  if (data.basicInfo && typeof data.basicInfo === 'object') {
    Object.assign(state.basicInfo, data.basicInfo)
  }
  if (Array.isArray(data.educationList)) {
    state.educationList.splice(0, state.educationList.length, ...data.educationList)
  }
  if (data.skills !== undefined) {
    state.skills.value = typeof data.skills === 'string' ? data.skills : String(data.skills ?? '')
  }
  if (data.certificate !== undefined) {
    state.certificate.value =
      typeof data.certificate === 'string' ? data.certificate : String(data.certificate ?? '')
  }
  if (Array.isArray(data.workList)) {
    state.workList.splice(0, state.workList.length, ...data.workList)
  }
  if (Array.isArray(data.projectList)) {
    state.projectList.splice(0, state.projectList.length, ...data.projectList)
  }
  if (Array.isArray(data.awardList)) {
    state.awardList.splice(0, state.awardList.length, ...data.awardList)
  }
  if (data.selfIntro !== undefined) {
    state.selfIntro.value =
      typeof data.selfIntro === 'string' ? data.selfIntro : String(data.selfIntro ?? '')
  }
}

export function saveResumeDataToStorage(
  storage: Pick<KeyValueStorage, 'setItem'>,
  storageKey: string,
  data: ResumeDraftData,
) {
  storage.setItem(storageKey, JSON.stringify(data))
}

export function loadResumeDataFromStorage(
  storage: Pick<KeyValueStorage, 'getItem'>,
  storageKey: string,
): StorageLoadResult {
  const raw = storage.getItem(storageKey)
  if (!raw) {
    return { data: null, error: null }
  }

  try {
    return { data: JSON.parse(raw), error: null }
  } catch (error) {
    return { data: null, error }
  }
}
