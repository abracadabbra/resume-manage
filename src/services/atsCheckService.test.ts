import { describe, expect, it } from 'vitest'

import {
  runAtsCheck,
  getAtsScoreLevel,
  getAtsScoreLabel,
  getAtsSeverityLabel,
  type AtsCheckInput,
} from '@/services/atsCheckService'

function createMinimalInput(overrides: Partial<AtsCheckInput> = {}): AtsCheckInput {
  return {
    basicInfo: {
      name: '张三',
      phone: '13800138000',
      email: 'zhangsan@example.com',
      age: '',
      gender: '',
      location: '',
      jobTitle: 'Java 工程师',
      educationLevel: '本科',
      avatar: '',
      workYears: '5',
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
    },
    educationList: [
      {
        id: 'e1',
        school: '清华大学',
        college: '',
        major: '计算机科学',
        degree: '本科',
        startDate: '2015-09',
        endDate: '2019-06',
        gpa: '',
        description: '',
        type: '',
        location: '',
        schoolTag: '',
      },
    ],
    workList: [
      {
        id: 'w1',
        company: 'ACME',
        department: '',
        position: '后端工程师',
        startDate: '2019-07',
        endDate: '至今',
        location: '',
        description: '负责后端开发',
      },
    ],
    projectList: [],
    awardList: [],
    skills: '熟悉 Java、Spring Boot、MySQL、Redis 等后端技术栈',
    selfIntro: '5 年后端开发经验',
    ...overrides,
  }
}

describe('atsCheckService', () => {
  describe('runAtsCheck', () => {
    it('returns high score for well-formed resume', () => {
      const result = runAtsCheck(createMinimalInput())
      expect(result.overallScore).toBeGreaterThanOrEqual(85)
      expect(result.criticalCount).toBe(0)
    })

    it('flags missing name as critical', () => {
      const input = createMinimalInput({
        basicInfo: {
          ...createMinimalInput().basicInfo,
          name: '',
        },
      })
      const result = runAtsCheck(input)
      expect(result.criticalCount).toBeGreaterThanOrEqual(1)
      expect(result.issues.some((i) => i.field === 'name' && i.severity === 'critical')).toBe(true)
    })

    it('flags invalid phone format as critical', () => {
      const input = createMinimalInput({
        basicInfo: {
          ...createMinimalInput().basicInfo,
          phone: '12345',
        },
      })
      const result = runAtsCheck(input)
      expect(result.issues.some((i) => i.field === 'phone' && i.severity === 'critical')).toBe(true)
    })

    it('flags empty phone as critical', () => {
      const input = createMinimalInput({
        basicInfo: {
          ...createMinimalInput().basicInfo,
          phone: '',
        },
      })
      const result = runAtsCheck(input)
      expect(result.criticalCount).toBeGreaterThanOrEqual(1)
    })

    it('flags invalid email format as warning', () => {
      const input = createMinimalInput({
        basicInfo: {
          ...createMinimalInput().basicInfo,
          email: 'not-an-email',
        },
      })
      const result = runAtsCheck(input)
      expect(result.issues.some((i) => i.field === 'email' && i.severity === 'warning')).toBe(true)
    })

    it('does not flag empty email (optional)', () => {
      const input = createMinimalInput({
        basicInfo: {
          ...createMinimalInput().basicInfo,
          email: '',
        },
      })
      const result = runAtsCheck(input)
      expect(result.issues.some((i) => i.field === 'email')).toBe(false)
    })

    it('flags missing job title as warning', () => {
      const input = createMinimalInput({
        basicInfo: {
          ...createMinimalInput().basicInfo,
          jobTitle: '',
        },
      })
      const result = runAtsCheck(input)
      expect(result.issues.some((i) => i.field === 'jobTitle' && i.severity === 'warning')).toBe(true)
    })

    it('flags empty education list as warning', () => {
      const input = createMinimalInput({ educationList: [] })
      const result = runAtsCheck(input)
      expect(result.issues.some((i) => i.category === '教育经历' && i.severity === 'warning')).toBe(true)
    })

    it('flags empty skills as warning', () => {
      const input = createMinimalInput({ skills: '' })
      const result = runAtsCheck(input)
      expect(result.issues.some((i) => i.field === 'skills' && i.severity === 'warning')).toBe(true)
    })

    it('flags overly brief skills as info', () => {
      const input = createMinimalInput({ skills: 'Java' })
      const result = runAtsCheck(input)
      expect(result.issues.some((i) => i.field === 'skills' && i.severity === 'info')).toBe(true)
    })

    it('flags invalid date format as warning', () => {
      const input = createMinimalInput({
        workList: [
          {
            id: 'w1',
            company: 'ACME',
            department: '',
            position: '工程师',
            startDate: '2019年7月',
            endDate: '现在工作',
            location: '',
            description: '开发',
          },
        ],
      })
      const result = runAtsCheck(input)
      expect(result.issues.some((i) => i.category === '工作经历' && i.severity === 'warning')).toBe(true)
    })

    it('accepts YYYY-MM date format', () => {
      const input = createMinimalInput({
        workList: [
          {
            id: 'w1',
            company: 'ACME',
            department: '',
            position: '工程师',
            startDate: '2019-07',
            endDate: '至今',
            location: '',
            description: '开发',
          },
        ],
      })
      const result = runAtsCheck(input)
      expect(result.issues.some((i) => i.category === '工作经历' && i.field?.includes('startDate'))).toBe(false)
    })

    it('flags html table as warning', () => {
      const input = createMinimalInput({
        skills: '<table><tr><td>Java</td></tr></table>',
      })
      const result = runAtsCheck(input)
      expect(result.issues.some((i) => i.category === '内容格式' && i.problem.includes('表格'))).toBe(true)
    })

    it('flags html img as warning', () => {
      const input = createMinimalInput({
        selfIntro: '<img src="avatar.png" alt="头像"/>',
      })
      const result = runAtsCheck(input)
      expect(result.issues.some((i) => i.category === '内容格式' && i.problem.includes('图片'))).toBe(true)
    })

    it('flags overly long self intro as info', () => {
      const longIntro = '我'.repeat(600)
      const input = createMinimalInput({ selfIntro: longIntro })
      const result = runAtsCheck(input)
      expect(result.issues.some((i) => i.category === '自我介绍' && i.severity === 'info')).toBe(true)
    })

    it('sorts issues by severity (critical first)', () => {
      const input = createMinimalInput({
        basicInfo: {
          ...createMinimalInput().basicInfo,
          name: '',
          phone: '',
          workYears: '', // info
        },
        skills: '', // warning
      })
      const result = runAtsCheck(input)
      const severities = result.issues.map((i) => i.severity)
      // critical 应该在前面
      const firstCriticalIdx = severities.indexOf('critical')
      const firstWarningIdx = severities.indexOf('warning')
      const firstInfoIdx = severities.indexOf('info')
      expect(firstCriticalIdx).toBeGreaterThanOrEqual(0)
      expect(firstWarningIdx).toBeGreaterThanOrEqual(0)
      expect(firstInfoIdx).toBeGreaterThanOrEqual(0)
      expect(firstCriticalIdx).toBeLessThanOrEqual(firstWarningIdx)
      expect(firstWarningIdx).toBeLessThanOrEqual(firstInfoIdx)
    })

    it('clamps score to 0-100', () => {
      // 构造大量问题让分数为 0
      const input = createMinimalInput({
        basicInfo: {
          name: '',
          phone: '',
          email: 'invalid',
          jobTitle: '',
          educationLevel: '',
          workYears: '',
          age: '',
          gender: '',
          location: '',
          avatar: '',
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
        },
        educationList: [],
        workList: [],
        projectList: [],
        skills: '',
        selfIntro: '',
      })
      const result = runAtsCheck(input)
      expect(result.overallScore).toBeGreaterThanOrEqual(0)
      expect(result.overallScore).toBeLessThanOrEqual(100)
    })

    it('returns summary with score', () => {
      const result = runAtsCheck(createMinimalInput())
      expect(result.summary).toContain(result.overallScore.toString())
    })
  })

  describe('getAtsScoreLevel', () => {
    it('returns correct level for score ranges', () => {
      expect(getAtsScoreLevel(95)).toBe('excellent')
      expect(getAtsScoreLevel(80)).toBe('good')
      expect(getAtsScoreLevel(65)).toBe('fair')
      expect(getAtsScoreLevel(50)).toBe('weak')
      expect(getAtsScoreLevel(20)).toBe('poor')
    })
  })

  describe('getAtsScoreLabel', () => {
    it('returns chinese label', () => {
      expect(getAtsScoreLabel(95)).toBe('优秀')
      expect(getAtsScoreLabel(80)).toBe('良好')
      expect(getAtsScoreLabel(65)).toBe('合格')
      expect(getAtsScoreLabel(50)).toBe('较弱')
      expect(getAtsScoreLabel(20)).toBe('严重不足')
    })
  })

  describe('getAtsSeverityLabel', () => {
    it('returns chinese label', () => {
      expect(getAtsSeverityLabel('critical')).toBe('严重')
      expect(getAtsSeverityLabel('warning')).toBe('警告')
      expect(getAtsSeverityLabel('info')).toBe('建议')
    })
  })
})
