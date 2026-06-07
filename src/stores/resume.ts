import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'
import { normalizeResumeTemplateKey, type ResumeTemplateKey } from '@/templates/resume'
import {
  applyResumeData,
  createResumeDataSnapshot,
  loadResumeDataFromStorage,
  saveResumeDataToStorage,
} from './resumePersistence'
import { createResumeCloudManager } from './resumeCloud'
import { 
  signUp, 
  signIn, 
  signOut, 
  getResumes, 
  getActiveResume, 
  createResume, 
  updateResume, 
  setActiveResume, 
  deleteResume,
  type ResumeRecord 
} from '@/services/supabase'

export interface BasicInfo {
  name: string
  phone: string
  email: string
  age: string
  gender: string
  location: string
  jobTitle: string
  educationLevel: string
  avatar: string
  workYears: string
  currentStatus: string
  expectedLocation: string
  expectedSalary: string
  website: string
  wechat: string
  currentCity: string
  github: string
  blog: string
  line1: string
  line2: string
  line3: string
  line4: string
}

export interface EducationEntry {
  id: string
  school: string
  college: string
  major: string
  degree: string
  startDate: string
  endDate: string
  gpa: string
  description: string
  type: string
  location: string
  schoolTag: string
}

export interface WorkEntry {
  id: string
  company: string
  department: string
  position: string
  startDate: string
  endDate: string
  location: string
  description: string
}

export interface ProjectEntry {
  id: string
  name: string
  role: string
  startDate: string
  endDate: string
  link: string
  introduction: string
  mainWork: string
}

export interface AwardEntry {
  id: string
  name: string
  date: string
  description: string
}

export interface ModuleConfig {
  key: string
  label: string
  icon: string
  visible: boolean
}

type MoveDirection = 'up' | 'down'
const DEFAULT_MODULE_ORDER = [
  'basicInfo',
  'education',
  'skills',
  'workExperience',
  'projectExperience',
  'awards',
  'selfIntro',
] as const

let _idCounter = 0
function genId(): string {
  return `item_${Date.now()}_${++_idCounter}`
}

export const useResumeStore = defineStore('resume', () => {
  const modules = reactive<ModuleConfig[]>([
    { key: 'basicInfo', label: '基本信息', icon: '👤', visible: true },
    { key: 'education', label: '教育经历', icon: '🎓', visible: true },
    { key: 'skills', label: '专业技能', icon: '⚡', visible: true },
    { key: 'certificate', label: '技能证书', icon: '📜', visible: false },
    { key: 'workExperience', label: '工作经历', icon: '💼', visible: true },
    { key: 'projectExperience', label: '项目经历', icon: '📁', visible: true },
    { key: 'awards', label: '荣誉奖项', icon: '🏆', visible: false },
    { key: 'selfIntro', label: '个人简介', icon: '📝', visible: false },
  ])

  const basicInfo = reactive<BasicInfo>({
    name: '',
    phone: '',
    email: '',
    age: '',
    gender: '',
    location: '',
    jobTitle: '',
    educationLevel: '',
    avatar: '',
    workYears: '',
    currentStatus: '',
    expectedLocation: '',
    expectedSalary: '',
    website: '',
    wechat: '',
    currentCity: '',
    github: '',
    blog: '',
    line1: '',
    line2: '',
    line3: '',
    line4: '',
  })

  const educationList = reactive<EducationEntry[]>([
    {
      id: genId(),
      school: '',
      college: '',
      major: '',
      degree: '',
      startDate: '',
      endDate: '',
      gpa: '',
      description: '',
      type: '',
      location: '',
      schoolTag: '',
    },
  ])

  const skills = ref('')
  const certificate = ref('')

  const workList = reactive<WorkEntry[]>([
    {
      id: genId(),
      company: '',
      department: '',
      position: '',
      startDate: '',
      endDate: '',
      location: '',
      description: '',
    },
  ])

  const projectList = reactive<ProjectEntry[]>([
    {
      id: genId(),
      name: '',
      role: '',
      startDate: '',
      endDate: '',
      link: '',
      introduction: '',
      mainWork: '',
    },
  ])

  const awardList = reactive<AwardEntry[]>([])
  const selfIntro = ref('')
  const selectedTemplateKey = ref<ResumeTemplateKey>('default')
  const nextAutoSaveAt = ref<number | null>(null)
  const lastSavedAt = ref<number | null>(null)
  const lastSaveMode = ref<'auto' | 'manual' | null>(null)
  const isSaving = ref(false)
  const resumeState = {
    modules,
    selectedTemplateKey,
    basicInfo,
    educationList,
    skills,
    certificate,
    workList,
    projectList,
    awardList,
    selfIntro,
  }

  function toggleModule(key: string) {
    const mod = modules.find((m) => m.key === key)
    if (mod) mod.visible = !mod.visible
  }

  function setTemplate(key: ResumeTemplateKey) {
    selectedTemplateKey.value = key
  }

  function canMoveModule(key: string, direction: MoveDirection): boolean {
    if (key === 'basicInfo') return false
    const idx = modules.findIndex((m) => m.key === key)
    if (idx < 0) return false
    const mod = modules[idx]
    if (!mod?.visible) return false
    if (direction === 'up') return idx > 1
    return idx < modules.length - 1
  }

  function moveModule(key: string, direction: MoveDirection) {
    if (!canMoveModule(key, direction)) return
    const idx = modules.findIndex((m) => m.key === key)
    if (idx < 0) return
    const target = direction === 'up' ? idx - 1 : idx + 1
    const current = modules[idx]
    const next = modules[target]
    if (!current || !next) return
    modules[idx] = next
    modules[target] = current
  }

  function reorderModule(sourceKey: string, targetKey: string) {
    if (sourceKey === targetKey || sourceKey === 'basicInfo') return
    const sourceIndex = modules.findIndex((m) => m.key === sourceKey)
    const targetIndex = modules.findIndex((m) => m.key === targetKey)
    if (sourceIndex < 0 || targetIndex < 0) return

    const [sourceModule] = modules.splice(sourceIndex, 1)
    if (!sourceModule) return

    let nextIndex = targetKey === 'basicInfo' ? 1 : targetIndex
    if (sourceIndex < targetIndex) {
      nextIndex -= 1
    }
    nextIndex = Math.max(1, Math.min(nextIndex, modules.length))

    modules.splice(nextIndex, 0, sourceModule)
  }

  function isDefaultModuleOrder(): boolean {
    return modules.every((m, idx) => m.key === DEFAULT_MODULE_ORDER[idx])
  }

  function resetModuleOrder() {
    const indexMap = new Map<string, number>()
    DEFAULT_MODULE_ORDER.forEach((key, idx) => indexMap.set(key, idx))
    const sorted = [...modules].sort((a, b) => {
      const ai = indexMap.get(a.key)
      const bi = indexMap.get(b.key)
      if (ai === undefined && bi === undefined) return 0
      if (ai === undefined) return 1
      if (bi === undefined) return -1
      return ai - bi
    })
    modules.splice(0, modules.length, ...sorted)
  }

  function isModuleVisible(key: string): boolean {
    const mod = modules.find((m) => m.key === key)
    return mod ? mod.visible : false
  }

  function addEducation() {
    educationList.push({
      id: genId(),
      school: '',
      college: '',
      major: '',
      degree: '',
      startDate: '',
      endDate: '',
      gpa: '',
      description: '',
      type: '',
      location: '',
      schoolTag: '',
    })
  }

  function removeEducation(id: string) {
    const idx = educationList.findIndex((e) => e.id === id)
    if (idx > -1) educationList.splice(idx, 1)
  }

  function addWork() {
    workList.push({
      id: genId(),
      company: '',
      department: '',
      position: '',
      startDate: '',
      endDate: '',
      location: '',
      description: '',
    })
  }

  function removeWork(id: string) {
    const idx = workList.findIndex((e) => e.id === id)
    if (idx > -1) workList.splice(idx, 1)
  }

  function addProject() {
    projectList.push({
      id: genId(),
      name: '',
      role: '',
      startDate: '',
      endDate: '',
      link: '',
      introduction: '',
      mainWork: '',
    })
  }

  function removeProject(id: string) {
    const idx = projectList.findIndex((e) => e.id === id)
    if (idx > -1) projectList.splice(idx, 1)
  }

  function canMoveProject(id: string, direction: 'up' | 'down'): boolean {
    const idx = projectList.findIndex((e) => e.id === id)
    if (idx < 0) return false
    if (direction === 'up') return idx > 0
    return idx < projectList.length - 1
  }

  function moveProject(id: string, direction: 'up' | 'down') {
    if (!canMoveProject(id, direction)) return
    const idx = projectList.findIndex((e) => e.id === id)
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    const [item] = projectList.splice(idx, 1)
    if (item) projectList.splice(targetIdx, 0, item)
  }

  function addAward() {
    awardList.push({
      id: genId(),
      name: '',
      date: '',
      description: '',
    })
  }

  function removeAward(id: string) {
    const idx = awardList.findIndex((e) => e.id === id)
    if (idx > -1) awardList.splice(idx, 1)
  }

  const STORAGE_KEY = 'resume-builder-data'
  const AUTO_SAVE_DELAY_MS = 500
  const SAVE_LOADING_MIN_MS = 900

  const isLoggedIn = ref(false)
  const userId = ref<string | null>(null)
  const currentResumeId = ref<string | null>(null)
  const resumeVersions = ref<ResumeRecord[]>([])

  function getData() {
    return createResumeDataSnapshot(resumeState)
  }

  function loadData(data: unknown) {
    if (!data) return
    try {
      applyResumeData(resumeState, data, normalizeResumeTemplateKey)
    } catch (e) {
      console.warn('Failed to load resume data', e)
    }
  }

  const cloudManager = createResumeCloudManager({
    api: {
      signUp,
      signIn,
      signOut,
      getResumes,
      getActiveResume,
      createResume,
      updateResume,
      setActiveResume,
      deleteResume,
    },
    state: {
      isLoggedIn,
      userId,
      currentResumeId,
      resumeVersions,
    },
    getData,
    loadData,
  })

  let saveLoadingTimer: ReturnType<typeof setTimeout> | null = null

  function markSavingState() {
    isSaving.value = true
    if (saveLoadingTimer) clearTimeout(saveLoadingTimer)
    saveLoadingTimer = setTimeout(() => {
      isSaving.value = false
      saveLoadingTimer = null
    }, SAVE_LOADING_MIN_MS)
  }

  function saveToStorage(mode: 'auto' | 'manual' = 'manual') {
    if (mode === 'manual' && saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    markSavingState()
    saveResumeDataToStorage(localStorage, STORAGE_KEY, getData())
    nextAutoSaveAt.value = null
    lastSavedAt.value = Date.now()
    lastSaveMode.value = mode
  }

  function loadFromStorage() {
    const { data, error } = loadResumeDataFromStorage(localStorage, STORAGE_KEY)
    if (error) {
      console.warn('Failed to load resume data from localStorage', error)
      return
    }
    loadData(data)
  }

  loadFromStorage()

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    [
      () => JSON.stringify(basicInfo),
      () => JSON.stringify(educationList),
      skills,
      () => JSON.stringify(workList),
      () => JSON.stringify(projectList),
      () => JSON.stringify(awardList),
      selfIntro,
      selectedTemplateKey,
      () => JSON.stringify(modules),
    ],
    () => {
      if (saveTimer) clearTimeout(saveTimer)
      nextAutoSaveAt.value = Date.now() + AUTO_SAVE_DELAY_MS
      saveTimer = setTimeout(() => {
        saveTimer = null
        saveToStorage('auto')
      }, AUTO_SAVE_DELAY_MS)
    },
    { deep: true }
  )

  return {
    modules,
    selectedTemplateKey,
    basicInfo,
    educationList,
    skills,
    certificate,
    workList,
    projectList,
    awardList,
    selfIntro,
    toggleModule,
    setTemplate,
    canMoveModule,
    moveModule,
    reorderModule,
    isDefaultModuleOrder,
    resetModuleOrder,
    isModuleVisible,
    addEducation,
    removeEducation,
    addWork,
    removeWork,
    addProject,
    removeProject,
    canMoveProject,
    moveProject,
    addAward,
    removeAward,
    saveToStorage,
    autoSaveDelayMs: AUTO_SAVE_DELAY_MS,
    nextAutoSaveAt,
    lastSavedAt,
    lastSaveMode,
    isSaving,
    isLoggedIn,
    userId,
    currentResumeId,
    resumeVersions,
    getSnapshot: getData,
    login: cloudManager.login,
    register: cloudManager.register,
    logout: cloudManager.logout,
    createNewVersion: cloudManager.createNewVersion,
    switchVersion: cloudManager.switchVersion,
    removeVersion: cloudManager.removeVersion,
    saveToCloud: cloudManager.saveToCloud,
  }
})
