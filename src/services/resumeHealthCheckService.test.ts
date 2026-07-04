import { describe, expect, it } from 'vitest'

import {
  parseResumeHealthCheckResult,
  getHealthScoreLevel,
  getHealthScoreLabel,
  getHealthModuleLabel,
} from '@/services/resumeHealthCheckService'

describe('resumeHealthCheckService', () => {
  describe('parseResumeHealthCheckResult', () => {
    it('parses valid full report', () => {
      const raw = JSON.stringify({
        overallScore: 78,
        summary: '总体良好，建议补充量化数据',
        moduleScores: [
          { module: 'basicInfo', score: 90, advice: '很完整' },
          { module: 'workExperience', score: 65, advice: '补充量化成果' },
        ],
        issues: [
          {
            severity: 'high',
            module: 'workExperience',
            problem: '工作描述缺少量化数据',
            suggestion: '补充 QPS、提升比例等数据',
          },
          {
            severity: 'low',
            module: 'skills',
            problem: '技能列表过长',
            suggestion: '按熟练度分级',
          },
        ],
        highlights: [
          { content: '项目A量化了 QPS 从 500 到 3000', reason: '量化数据可信' },
        ],
      })

      const result = parseResumeHealthCheckResult(raw)

      expect(result).not.toBeNull()
      expect(result?.overallScore).toBe(78)
      expect(result?.summary).toBe('总体良好，建议补充量化数据')
      expect(result?.moduleScores).toHaveLength(2)
      expect(result?.moduleScores[0]).toEqual({
        module: 'basicInfo',
        score: 90,
        advice: '很完整',
      })
      expect(result?.issues).toHaveLength(2)
      expect(result?.issues[0]!.severity).toBe('high')
      expect(result?.highlights).toHaveLength(1)
    })

    it('parses fenced json block', () => {
      const raw = '```json\n' + JSON.stringify({
        overallScore: 60,
        summary: '合格',
        moduleScores: [{ module: 'basicInfo', score: 60, advice: 'advice' }],
        issues: [],
        highlights: [],
      }) + '\n```'

      const result = parseResumeHealthCheckResult(raw)
      expect(result).not.toBeNull()
      expect(result?.overallScore).toBe(60)
    })

    it('clamps score to 0-100 range', () => {
      const raw = JSON.stringify({
        overallScore: 150,
        summary: '',
        moduleScores: [{ module: 'basicInfo', score: 50, advice: 'a' }],
        issues: [],
        highlights: [],
      })

      const result = parseResumeHealthCheckResult(raw)
      expect(result?.overallScore).toBe(100)
    })

    it('clamps negative score to 0', () => {
      const raw = JSON.stringify({
        overallScore: -10,
        summary: '',
        moduleScores: [{ module: 'basicInfo', score: 50, advice: 'a' }],
        issues: [],
        highlights: [],
      })

      const result = parseResumeHealthCheckResult(raw)
      expect(result?.overallScore).toBe(0)
    })

    it('normalizes invalid module name to basicInfo', () => {
      const raw = JSON.stringify({
        overallScore: 60,
        summary: '',
        moduleScores: [{ module: 'invalidModule', score: 50, advice: '' }],
        issues: [],
        highlights: [],
      })

      const result = parseResumeHealthCheckResult(raw)
      expect(result?.moduleScores[0]!.module).toBe('basicInfo')
    })

    it('normalizes severity values', () => {
      const raw = JSON.stringify({
        overallScore: 60,
        summary: '',
        moduleScores: [],
        issues: [
          { severity: '严重', module: 'basicInfo', problem: 'p1', suggestion: 's1' },
          { severity: 'high', module: 'basicInfo', problem: 'p2', suggestion: 's2' },
          { severity: 'unknown', module: 'basicInfo', problem: 'p3', suggestion: 's3' },
        ],
        highlights: [],
      })

      const result = parseResumeHealthCheckResult(raw)
      expect(result?.issues[0]!.severity).toBe('high')
      expect(result?.issues[1]!.severity).toBe('high')
      expect(result?.issues[2]!.severity).toBe('medium')
    })

    it('returns null when all sections empty', () => {
      const raw = JSON.stringify({
        overallScore: 50,
        summary: '',
        moduleScores: [],
        issues: [],
        highlights: [],
      })

      const result = parseResumeHealthCheckResult(raw)
      expect(result).toBeNull()
    })

    it('uses default summary when empty', () => {
      const raw = JSON.stringify({
        overallScore: 60,
        summary: '',
        moduleScores: [{ module: 'basicInfo', score: 60, advice: 'a' }],
        issues: [],
        highlights: [],
      })

      const result = parseResumeHealthCheckResult(raw)
      expect(result?.summary).toBe('已生成简历体检报告')
    })

    it('returns null on invalid json', () => {
      const result = parseResumeHealthCheckResult('invalid json')
      expect(result).toBeNull()
    })

    it('filters out empty issue records', () => {
      const raw = JSON.stringify({
        overallScore: 60,
        summary: '',
        moduleScores: [],
        issues: [
          { severity: '', module: '', problem: '', suggestion: '' },
          { severity: 'high', module: 'basicInfo', problem: 'p', suggestion: 's' },
        ],
        highlights: [],
      })

      const result = parseResumeHealthCheckResult(raw)
      expect(result?.issues).toHaveLength(1)
    })
  })

  describe('getHealthScoreLevel', () => {
    it('returns excellent for 90+', () => {
      expect(getHealthScoreLevel(90)).toBe('excellent')
      expect(getHealthScoreLevel(100)).toBe('excellent')
    })

    it('returns good for 75-89', () => {
      expect(getHealthScoreLevel(75)).toBe('good')
      expect(getHealthScoreLevel(89)).toBe('good')
    })

    it('returns fair for 60-74', () => {
      expect(getHealthScoreLevel(60)).toBe('fair')
      expect(getHealthScoreLevel(74)).toBe('fair')
    })

    it('returns weak for 40-59', () => {
      expect(getHealthScoreLevel(40)).toBe('weak')
      expect(getHealthScoreLevel(59)).toBe('weak')
    })

    it('returns poor for <40', () => {
      expect(getHealthScoreLevel(39)).toBe('poor')
      expect(getHealthScoreLevel(0)).toBe('poor')
    })
  })

  describe('getHealthScoreLabel', () => {
    it('returns correct chinese label', () => {
      expect(getHealthScoreLabel(95)).toBe('优秀')
      expect(getHealthScoreLabel(80)).toBe('良好')
      expect(getHealthScoreLabel(65)).toBe('合格')
      expect(getHealthScoreLabel(50)).toBe('较弱')
      expect(getHealthScoreLabel(20)).toBe('严重不足')
    })
  })

  describe('getHealthModuleLabel', () => {
    it('returns chinese label for known module', () => {
      expect(getHealthModuleLabel('basicInfo')).toBe('基本信息')
      expect(getHealthModuleLabel('workExperience')).toBe('工作经历')
      expect(getHealthModuleLabel('projectExperience')).toBe('项目经历')
    })

    it('returns original key for unknown module', () => {
      expect(getHealthModuleLabel('unknown')).toBe('unknown')
    })
  })
})
