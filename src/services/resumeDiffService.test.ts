import { describe, expect, it } from 'vitest'

import { buildResumeDiff } from '@/services/resumeDiffService'
import { RESUME_DRAFT_SCHEMA_VERSION, type ResumeDraftData } from '@/stores/resumePersistence'

function createResumeData(overrides: Partial<ResumeDraftData> = {}): ResumeDraftData {
  return {
    schemaVersion: RESUME_DRAFT_SCHEMA_VERSION,
    modules: [
      { key: 'basicInfo', label: '基本信息', icon: 'user', visible: true },
      { key: 'education', label: '教育经历', icon: 'education', visible: true },
      { key: 'skills', label: '专业技能', icon: 'skills', visible: true },
      { key: 'workExperience', label: '工作经历', icon: 'work', visible: true },
      { key: 'projectExperience', label: '项目经历', icon: 'project', visible: true },
      { key: 'selfIntro', label: '个人简介', icon: 'intro', visible: false },
    ],
    selectedTemplateKey: 'default',
    basicInfo: {
      name: '沈涛',
      phone: '13800000000',
      email: 'tao@example.com',
      age: '',
      gender: '',
      location: '杭州',
      jobTitle: 'Java 后端工程师',
      educationLevel: '本科',
      avatar: '',
      workYears: '3 年',
      currentStatus: '在职',
      expectedLocation: '上海',
      expectedSalary: '30k-40k',
      website: '',
      wechat: '',
      currentCity: '',
      github: '',
      blog: '',
      line1: '',
      line2: '',
      line3: '',
      line4: '',
    },
    educationList: [
      {
        id: 'edu-1',
        school: '浙江大学',
        college: '计算机学院',
        major: '软件工程',
        degree: '本科',
        startDate: '2018-09',
        endDate: '2022-06',
        gpa: '',
        description: '',
        type: '',
        location: '杭州',
        schoolTag: '985',
      },
    ],
    skills: 'Java\nSpring Boot\nMySQL',
    certificate: '',
    workList: [
      {
        id: 'work-1',
        company: '曹操出行',
        department: '平台研发',
        position: '后端工程师',
        startDate: '2022-07',
        endDate: '至今',
        location: '杭州',
        description: '负责订单链路性能优化',
      },
    ],
    projectList: [
      {
        id: 'project-1',
        name: '订单中台',
        role: '后端负责人',
        startDate: '2023-01',
        endDate: '2024-03',
        link: '',
        introduction: '承接订单核心链路',
        mainWork: '负责缓存一致性与高可用改造',
      },
    ],
    awardList: [],
    selfIntro: '专注于高并发后端系统建设。',
    ...overrides,
  }
}

describe('resumeDiffService', () => {
  it('detects layout, field and collection changes between two resume snapshots', () => {
    const before = createResumeData()
    const after = createResumeData({
      modules: [
        { key: 'basicInfo', label: '基本信息', icon: 'user', visible: true },
        { key: 'skills', label: '专业技能', icon: 'skills', visible: true },
        { key: 'education', label: '教育经历', icon: 'education', visible: true },
        { key: 'workExperience', label: '工作经历', icon: 'work', visible: true },
        { key: 'projectExperience', label: '项目经历', icon: 'project', visible: true },
        { key: 'selfIntro', label: '个人简介', icon: 'intro', visible: true },
      ],
      selectedTemplateKey: 'blue-linear',
      basicInfo: {
        ...before.basicInfo,
        phone: '13900000000',
        expectedSalary: '35k-45k',
      },
      skills: 'Java\nSpring Boot\nMySQL\nRedis',
      workList: [
        {
          ...before.workList[0]!,
          description: '负责订单链路性能优化与容量治理',
        },
      ],
      projectList: [],
      awardList: [
        {
          id: 'award-1',
          name: '年度优秀员工',
          date: '2025-01',
          description: '推动核心链路稳定性治理落地',
        },
      ],
    })

    const diff = buildResumeDiff(before, after)

    expect(diff.hasChanges).toBe(true)
    expect(diff.summary).toEqual({
      sectionCount: 6,
      fieldChangeCount: 16,
      addedEntryCount: 1,
      removedEntryCount: 1,
      updatedEntryCount: 1,
    })
    expect(diff.sections.map((section) => section.key)).toEqual([
      'layout',
      'basicInfo',
      'skills',
      'workExperience',
      'projectExperience',
      'awards',
    ])
    expect(diff.sections[0]?.fields.map((field) => field.label)).toEqual([
      '模板',
      '可见模块顺序',
      '隐藏模块',
    ])
    expect(diff.sections[1]?.fields).toEqual([
      expect.objectContaining({
        key: 'phone',
        before: '13800000000',
        after: '13900000000',
      }),
      expect.objectContaining({
        key: 'expectedSalary',
        before: '30k-40k',
        after: '35k-45k',
      }),
    ])
    expect(diff.sections[3]?.entries[0]).toEqual(
      expect.objectContaining({
        title: '曹操出行',
        kind: 'changed',
      }),
    )
    expect(diff.sections[4]?.entries[0]).toEqual(
      expect.objectContaining({
        title: '订单中台',
        kind: 'removed',
      }),
    )
    expect(diff.sections[5]?.entries[0]).toEqual(
      expect.objectContaining({
        title: '年度优秀员工',
        kind: 'added',
      }),
    )
  })

  it('returns an empty diff for identical snapshots', () => {
    const snapshot = createResumeData()

    expect(buildResumeDiff(snapshot, snapshot)).toEqual({
      hasChanges: false,
      summary: {
        sectionCount: 0,
        fieldChangeCount: 0,
        addedEntryCount: 0,
        removedEntryCount: 0,
        updatedEntryCount: 0,
      },
      sections: [],
    })
  })
})
