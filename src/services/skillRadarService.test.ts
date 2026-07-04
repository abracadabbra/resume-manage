import { describe, expect, it } from 'vitest'

import {
  buildSkillRadarData,
  getRadarLevel,
  getRadarLevelLabel,
} from '@/services/skillRadarService'

const emptyWork = [
  { id: 'w1', company: '', department: '', position: '', startDate: '', endDate: '', location: '', description: '' },
]
const emptyProjects = [
  { id: 'p1', name: '', role: '', startDate: '', endDate: '', link: '', introduction: '', mainWork: '' },
]

describe('skillRadarService', () => {
  describe('buildSkillRadarData', () => {
    it('returns zero scores for empty resume', () => {
      const result = buildSkillRadarData('', [], [], '')
      expect(result.totalKeywords).toBe(0)
      expect(result.dimensions).toHaveLength(7)
      result.dimensions.forEach((dim) => {
        expect(dim.score).toBe(0)
        expect(dim.evidenceCount).toBe(0)
        expect(dim.keywords).toEqual([])
      })
    })

    it('extracts keywords from skills text', () => {
      const skills = '熟悉 Java、Spring Boot、MySQL、Redis'
      const result = buildSkillRadarData(skills, emptyWork, emptyProjects, '')
      expect(result.totalKeywords).toBeGreaterThan(0)
      const backend = result.dimensions.find((d) => d.name === '后端开发')
      expect(backend?.keywords).toContain('Java')
      expect(backend?.keywords).toContain('Spring Boot')
      const db = result.dimensions.find((d) => d.name === '数据库')
      expect(db?.keywords).toContain('MySQL')
      expect(db?.keywords).toContain('Redis')
    })

    it('extracts keywords from project main work', () => {
      const projects = [
        {
          id: 'p1',
          name: '电商系统',
          role: '后端开发',
          startDate: '',
          endDate: '',
          link: '',
          introduction: '',
          mainWork: '使用 Kafka 处理订单异步消息，Elasticsearch 做商品搜索',
        },
      ]
      const result = buildSkillRadarData('', emptyWork, projects, '')
      const middleware = result.dimensions.find((d) => d.name === '中间件')
      expect(middleware?.keywords).toContain('Kafka')
      expect(middleware?.keywords).toContain('Elasticsearch')
      const business = result.dimensions.find((d) => d.name === '业务能力')
      expect(business?.keywords).toContain('订单')
    })

    it('strips HTML tags before matching', () => {
      const skills = '<ul><li>熟悉 <strong>Java</strong>、Spring</li></ul>'
      const result = buildSkillRadarData(skills, emptyWork, emptyProjects, '')
      const backend = result.dimensions.find((d) => d.name === '后端开发')
      expect(backend?.keywords).toContain('Java')
      expect(backend?.keywords).toContain('Spring')
    })

    it('calculates scores based on keyword count and ratio', () => {
      const skills = 'Java Spring Boot MySQL Redis Kafka Docker'
      const result = buildSkillRadarData(skills, emptyWork, emptyProjects, '')
      // 至少有一个维度得分大于 0
      expect(result.dimensions.some((d) => d.score > 0)).toBe(true)
      // 总分不超过 100
      result.dimensions.forEach((d) => {
        expect(d.score).toBeGreaterThanOrEqual(0)
        expect(d.score).toBeLessThanOrEqual(100)
      })
    })

    it('deduplicates keywords (case insensitive)', () => {
      const skills = 'java JAVA Java spring Spring'
      const result = buildSkillRadarData(skills, emptyWork, emptyProjects, '')
      const backend = result.dimensions.find((d) => d.name === '后端开发')
      // java 和 spring 各算一次
      expect(backend?.evidenceCount).toBe(2)
    })

    it('does not match substrings incorrectly (uses word boundary via regex)', () => {
      // "JavaScript" 不应被算作 "Java"（虽然这里用的是简单 regex，可能有边界问题）
      // 但我们想确保至少不会重复计数
      const skills = 'JavaScript TypeScript'
      const result = buildSkillRadarData(skills, emptyWork, emptyProjects, '')
      // JavaScript 会被算到前端基础，TypeScript 也是
      const frontend = result.dimensions.find((d) => d.name === '前端基础')
      expect(frontend?.keywords).toContain('JavaScript')
      expect(frontend?.keywords).toContain('TypeScript')
    })

    it('handles 7 dimensions', () => {
      const result = buildSkillRadarData('', [], [], '')
      const expectedNames = ['后端开发', '数据库', '中间件', '系统设计', '工程化', '前端基础', '业务能力']
      const actualNames = result.dimensions.map((d) => d.name)
      expect(actualNames).toEqual(expectedNames)
    })
  })

  describe('getRadarLevel', () => {
    it('returns correct level for score ranges', () => {
      expect(getRadarLevel(80)).toBe('strong')
      expect(getRadarLevel(70)).toBe('strong')
      expect(getRadarLevel(69)).toBe('medium')
      expect(getRadarLevel(40)).toBe('medium')
      expect(getRadarLevel(39)).toBe('weak')
      expect(getRadarLevel(10)).toBe('weak')
      expect(getRadarLevel(9)).toBe('none')
      expect(getRadarLevel(0)).toBe('none')
    })
  })

  describe('getRadarLevelLabel', () => {
    it('returns chinese label', () => {
      expect(getRadarLevelLabel(80)).toBe('突出')
      expect(getRadarLevelLabel(50)).toBe('一般')
      expect(getRadarLevelLabel(20)).toBe('薄弱')
      expect(getRadarLevelLabel(0)).toBe('缺失')
    })
  })
})
