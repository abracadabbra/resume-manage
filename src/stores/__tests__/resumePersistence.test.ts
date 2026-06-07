import { describe, expect, it } from 'vitest'

import type {
  AwardEntry,
  BasicInfo,
  EducationEntry,
  ModuleConfig,
  ProjectEntry,
  WorkEntry,
} from '@/stores/resume'
import {
  applyResumeData,
  createResumeDataSnapshot,
  loadResumeDataFromStorage,
  normalizeModuleConfigs,
  saveResumeDataToStorage,
  type KeyValueStorage,
  type ResumeMutableState,
} from '@/stores/resumePersistence'

const fallbackModules: ModuleConfig[] = [
  { key: 'basicInfo', label: '基本信息', icon: 'base', visible: true },
  { key: 'education', label: '教育经历', icon: 'edu', visible: true },
  { key: 'skills', label: '专业技能', icon: 'skill', visible: true },
  { key: 'certificate', label: '技能证书', icon: 'cert', visible: false },
  { key: 'workExperience', label: '工作经历', icon: 'work', visible: true },
  { key: 'projectExperience', label: '项目经历', icon: 'project', visible: true },
]

function createBasicInfo(): BasicInfo {
  return {
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
  }
}

function createEducationList(): EducationEntry[] {
  return [
    {
      id: 'edu-1',
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
  ]
}

function createWorkList(): WorkEntry[] {
  return [
    {
      id: 'work-1',
      company: '',
      department: '',
      position: '',
      startDate: '',
      endDate: '',
      location: '',
      description: '',
    },
  ]
}

function createProjectList(): ProjectEntry[] {
  return [
    {
      id: 'project-1',
      name: '',
      role: '',
      startDate: '',
      endDate: '',
      link: '',
      introduction: '',
      mainWork: '',
    },
  ]
}

function createAwardList(): AwardEntry[] {
  return []
}

function createState(): ResumeMutableState {
  return {
    modules: fallbackModules.map((module) => ({ ...module })),
    selectedTemplateKey: { value: 'default' },
    basicInfo: createBasicInfo(),
    educationList: createEducationList(),
    skills: { value: '' },
    certificate: { value: '' },
    workList: createWorkList(),
    projectList: createProjectList(),
    awardList: createAwardList(),
    selfIntro: { value: '' },
  }
}

function createMemoryStorage(initialValue?: string): KeyValueStorage {
  const memory = new Map<string, string>()
  if (initialValue !== undefined) {
    memory.set('resume-key', initialValue)
  }
  return {
    getItem(key) {
      return memory.get(key) ?? null
    },
    setItem(key, value) {
      memory.set(key, value)
    },
  }
}

describe('resumePersistence', () => {
  it('creates a detached resume snapshot', () => {
    const state = createState()
    state.basicInfo.name = 'Alice'
    state.skills.value = 'TypeScript'

    const snapshot = createResumeDataSnapshot(state)
    snapshot.basicInfo.name = 'Bob'
    snapshot.modules[0]!.label = 'changed'

    expect(state.basicInfo.name).toBe('Alice')
    expect(state.modules[0]!.label).toBe('基本信息')
  })

  it('normalizes module order with basic info first and missing modules appended', () => {
    const normalized = normalizeModuleConfigs(
      [
        { key: 'skills', label: '技能', icon: 's', visible: false },
        { key: 'projectExperience', label: '项目', icon: 'p', visible: true },
        { key: 'basicInfo', label: '基础', icon: 'b', visible: true },
        { key: 'skills', label: '重复技能', icon: 's2', visible: true },
        { key: 'unknown', label: '未知', icon: 'u', visible: true },
      ],
      fallbackModules,
    )

    expect(normalized.map((module) => module.key)).toEqual([
      'basicInfo',
      'skills',
      'projectExperience',
      'education',
      'certificate',
      'workExperience',
    ])
  })

  it('applies legacy resume data into mutable state', () => {
    const state = createState()

    applyResumeData(
      state,
      {
        modules: [
          { key: 'projectExperience', label: '项目经历', icon: 'project', visible: true },
          { key: 'education', label: '教育经历', icon: 'education', visible: false },
        ],
        selectedTemplateId: 'classic-blue',
        basicInfo: { name: 'Alice', line4: 'Backend Engineer' },
        skills: 'Vue 3 / TypeScript',
        certificate: 'PMP',
        workList: [
          {
            id: 'work-2',
            company: 'OpenAI',
            department: 'Platform',
            position: 'Engineer',
            startDate: '2024-01',
            endDate: '2026-01',
            location: 'Remote',
            description: 'Build tools',
          },
        ],
      },
      (value) => (value === 'classic-blue' ? 'blue-linear' : 'default'),
    )

    expect(state.selectedTemplateKey.value).toBe('blue-linear')
    expect(state.basicInfo.name).toBe('Alice')
    expect(state.basicInfo.line4).toBe('Backend Engineer')
    expect(state.skills.value).toBe('Vue 3 / TypeScript')
    expect(state.certificate.value).toBe('PMP')
    expect(state.workList[0]?.company).toBe('OpenAI')
    expect(state.modules.map((module) => module.key)).toEqual([
      'basicInfo',
      'projectExperience',
      'education',
      'skills',
      'certificate',
      'workExperience',
    ])
  })

  it('round-trips resume data through storage', () => {
    const state = createState()
    state.basicInfo.name = 'Alice'
    state.selfIntro.value = 'Hello'
    const storage = createMemoryStorage()

    saveResumeDataToStorage(storage, 'resume-key', createResumeDataSnapshot(state))
    const { data, error } = loadResumeDataFromStorage(storage, 'resume-key')

    expect(error).toBeNull()
    expect(data).toEqual({
      modules: fallbackModules,
      selectedTemplateKey: 'default',
      basicInfo: expect.objectContaining({ name: 'Alice' }),
      educationList: createEducationList(),
      skills: '',
      certificate: '',
      workList: createWorkList(),
      projectList: createProjectList(),
      awardList: [],
      selfIntro: 'Hello',
    })
  })

  it('returns an error for invalid storage payloads', () => {
    const storage = createMemoryStorage('{bad json')

    const { data, error } = loadResumeDataFromStorage(storage, 'resume-key')

    expect(data).toBeNull()
    expect(error).toBeInstanceOf(Error)
  })
})
