import { describe, expect, it } from 'vitest'

import {
  parseAnswerScoreResult,
  getAnswerScoreLevel,
} from '@/services/answerScoreService'

describe('answerScoreService', () => {
  describe('parseAnswerScoreResult', () => {
    it('parses valid result with all fields', () => {
      const raw = JSON.stringify({
        overallScore: 78,
        level: '良好',
        dimensions: [
          { name: '完整性', score: 16, comment: '覆盖主要关键点' },
          { name: '技术深度', score: 14, comment: '讲到原理' },
          { name: '实践经验', score: 16, comment: '有项目举例' },
          { name: '表达逻辑', score: 18, comment: '逻辑清晰' },
          { name: '亮点加分', score: 14, comment: '有量化数据' },
        ],
        strengths: ['量化数据充分', '结构清晰'],
        weaknesses: ['缺少对比方案'],
        improvedAnswer: '可以补充 trade-off 思考...',
        summary: '回答整体良好，逻辑清晰，但缺少对比方案。',
      })

      const result = parseAnswerScoreResult(raw)
      expect(result).not.toBeNull()
      expect(result!.overallScore).toBe(78)
      expect(result!.level).toBe('良好')
      expect(result!.dimensions).toHaveLength(5)
      expect(result!.strengths).toEqual(['量化数据充分', '结构清晰'])
      expect(result!.weaknesses).toEqual(['缺少对比方案'])
      expect(result!.improvedAnswer).toContain('trade-off')
    })

    it('parses result wrapped in markdown code fence', () => {
      const inner = {
        overallScore: 90,
        level: '优秀',
        dimensions: [{ name: '完整性', score: 18, comment: '完整' }],
        strengths: [],
        weaknesses: [],
        improvedAnswer: '',
        summary: '优秀',
      }
      const raw = '```json\n' + JSON.stringify(inner) + '\n```'

      const result = parseAnswerScoreResult(raw)
      expect(result).not.toBeNull()
      expect(result!.overallScore).toBe(90)
    })

    it('returns null for missing dimensions', () => {
      const raw = JSON.stringify({
        overallScore: 78,
        level: '良好',
        dimensions: [],
      })

      const result = parseAnswerScoreResult(raw)
      expect(result).toBeNull()
    })

    it('returns null for invalid JSON', () => {
      expect(parseAnswerScoreResult('not json')).toBeNull()
      expect(parseAnswerScoreResult('')).toBeNull()
    })

    it('clamps scores to valid range', () => {
      const raw = JSON.stringify({
        overallScore: 150,
        level: '良好',
        dimensions: [
          { name: '完整性', score: 30, comment: '完整' },
          { name: '技术深度', score: -5, comment: '差' },
        ],
      })

      const result = parseAnswerScoreResult(raw)
      expect(result).not.toBeNull()
      expect(result!.overallScore).toBe(100)
      expect(result!.dimensions[0]?.score).toBe(20)
      expect(result!.dimensions[1]?.score).toBe(0)
    })

    it('filters out dimensions without name', () => {
      const raw = JSON.stringify({
        overallScore: 78,
        level: '良好',
        dimensions: [
          { name: '', score: 16, comment: '完整' },
          { name: '技术深度', score: 14, comment: '差' },
          { score: 10, comment: '无名字' },
        ],
      })

      const result = parseAnswerScoreResult(raw)
      expect(result).not.toBeNull()
      expect(result!.dimensions).toHaveLength(1)
      expect(result!.dimensions[0]?.name).toBe('技术深度')
    })

    it('normalizes non-array strengths/weaknesses to empty array', () => {
      const raw = JSON.stringify({
        overallScore: 78,
        level: '良好',
        dimensions: [{ name: '完整性', score: 16, comment: '完整' }],
        strengths: 'not an array',
        weaknesses: null,
      })

      const result = parseAnswerScoreResult(raw)
      expect(result).not.toBeNull()
      expect(result!.strengths).toEqual([])
      expect(result!.weaknesses).toEqual([])
    })

    it('falls back to default level/summary when missing', () => {
      const raw = JSON.stringify({
        dimensions: [{ name: '完整性', score: 16, comment: '完整' }],
      })

      const result = parseAnswerScoreResult(raw)
      expect(result).not.toBeNull()
      expect(result!.level).toBe('未评级')
      expect(result!.summary).toBe('已生成评分报告')
      expect(result!.overallScore).toBe(0)
    })

    it('trims strings', () => {
      const raw = JSON.stringify({
        overallScore: 80,
        level: '  良好  ',
        dimensions: [{ name: '  完整性  ', score: 16, comment: '  完整  ' }],
        strengths: ['  亮点1  ', ''],
        weaknesses: ['  待改进  '],
        improvedAnswer: '  参考答案  ',
        summary: '  评价  ',
      })

      const result = parseAnswerScoreResult(raw)
      expect(result).not.toBeNull()
      expect(result!.level).toBe('良好')
      expect(result!.dimensions[0]?.name).toBe('完整性')
      expect(result!.dimensions[0]?.comment).toBe('完整')
      expect(result!.strengths).toEqual(['亮点1'])
      expect(result!.weaknesses).toEqual(['待改进'])
      expect(result!.improvedAnswer).toBe('参考答案')
      expect(result!.summary).toBe('评价')
    })
  })

  describe('getAnswerScoreLevel', () => {
    it('returns correct level for score ranges', () => {
      expect(getAnswerScoreLevel(95)).toBe('excellent')
      expect(getAnswerScoreLevel(90)).toBe('excellent')
      expect(getAnswerScoreLevel(89)).toBe('good')
      expect(getAnswerScoreLevel(75)).toBe('good')
      expect(getAnswerScoreLevel(74)).toBe('fair')
      expect(getAnswerScoreLevel(60)).toBe('fair')
      expect(getAnswerScoreLevel(59)).toBe('weak')
      expect(getAnswerScoreLevel(40)).toBe('weak')
      expect(getAnswerScoreLevel(39)).toBe('poor')
      expect(getAnswerScoreLevel(0)).toBe('poor')
    })
  })
})
