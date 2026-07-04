import { describe, expect, it } from 'vitest'

import {
  extractResumeTechKeywords,
  findKeywordsInJd,
  highlightJdKeywords,
} from '@/services/jdKeywordHighlight'

describe('jdKeywordHighlight', () => {
  describe('extractResumeTechKeywords', () => {
    it('returns empty set when resume is empty', () => {
      const result = extractResumeTechKeywords({
        skills: '',
        workList: [],
        projectList: [],
      })
      expect(result.size).toBe(0)
    })

    it('extracts keywords from skills text', () => {
      const result = extractResumeTechKeywords({
        skills: '熟悉 Java、Spring Boot、MySQL、Redis',
        workList: [],
        projectList: [],
      })
      expect(result.has('java')).toBe(true)
      expect(result.has('spring boot')).toBe(true)
      expect(result.has('mysql')).toBe(true)
      expect(result.has('redis')).toBe(true)
    })

    it('extracts keywords from project entries (html stripped)', () => {
      const result = extractResumeTechKeywords({
        skills: '',
        workList: [],
        projectList: [
          {
            id: 'p1',
            name: '订单系统',
            role: '后端',
            startDate: '',
            endDate: '',
            link: '',
            introduction: '<p>使用 Kafka 和 Elasticsearch</p>',
            mainWork: '<ul><li>用 Docker 部署</li></ul>',
          },
        ],
      })
      expect(result.has('kafka')).toBe(true)
      expect(result.has('elasticsearch')).toBe(true)
      expect(result.has('docker')).toBe(true)
    })

    it('extracts keywords from work entries', () => {
      const result = extractResumeTechKeywords({
        skills: '',
        workList: [
          {
            id: 'w1',
            company: 'ACME',
            department: '',
            position: 'Java 工程师',
            startDate: '',
            endDate: '',
            location: '',
            description: '负责 Spring Cloud 微服务',
          },
        ],
        projectList: [],
      })
      expect(result.has('java')).toBe(true)
      expect(result.has('spring cloud')).toBe(true)
    })

    it('is case-insensitive', () => {
      const result = extractResumeTechKeywords({
        skills: 'JAVA, MYsql, REDIS',
        workList: [],
        projectList: [],
      })
      expect(result.has('java')).toBe(true)
      expect(result.has('mysql')).toBe(true)
      expect(result.has('redis')).toBe(true)
    })
  })

  describe('findKeywordsInJd', () => {
    it('returns empty array when JD text is empty', () => {
      const result = findKeywordsInJd('', new Set())
      expect(result).toEqual([])
    })

    it('counts keyword occurrences and marks covered status', () => {
      const resumeKeywords = new Set(['java', 'mysql', 'redis'])
      const jdText = '需要 Java 经验，熟悉 MySQL 和 Spring Boot，有 Kafka 加分'

      const result = findKeywordsInJd(jdText, resumeKeywords)

      const javaMatch = result.find((m) => m.keyword === 'Java')
      expect(javaMatch).toBeDefined()
      expect(javaMatch?.covered).toBe(true)
      expect(javaMatch?.count).toBe(1)

      const springBootMatch = result.find((m) => m.keyword === 'Spring Boot')
      expect(springBootMatch).toBeDefined()
      expect(springBootMatch?.covered).toBe(false)

      const kafkaMatch = result.find((m) => m.keyword === 'Kafka')
      expect(kafkaMatch).toBeDefined()
      expect(kafkaMatch?.covered).toBe(false)
    })

    it('sorts by count descending', () => {
      const jdText = 'Java Java Java MySQL MySQL Redis'
      const result = findKeywordsInJd(jdText, new Set())
      const counts = result.map((m) => m.count)
      // 应该是 3, 2, 1
      expect(counts).toEqual([3, 2, 1])
    })
  })

  describe('highlightJdKeywords', () => {
    it('returns single plain segment when no keyword matches', () => {
      const segments = highlightJdKeywords('普通文本无关键词', new Set())
      expect(segments).toHaveLength(1)
      expect(segments[0]!.keyword).toBeNull()
      expect(segments[0]!.text).toBe('普通文本无关键词')
    })

    it('returns single segment when text is empty', () => {
      const segments = highlightJdKeywords('', new Set())
      expect(segments).toEqual([])
    })

    it('splits text into plain and keyword segments', () => {
      const resumeKeywords = new Set(['java'])
      const segments = highlightJdKeywords(
        '需要 Java 经验，熟悉 Spring Boot',
        resumeKeywords,
      )

      // 期望 5 段：前文本 / Java / 中间文本 / Spring Boot / 后文本
      const keywordSegments = segments.filter((s) => s.keyword !== null)
      expect(keywordSegments).toHaveLength(2)

      const javaSeg = keywordSegments.find((s) => s.keyword === 'Java')
      expect(javaSeg?.covered).toBe(true)

      const springBootSeg = keywordSegments.find((s) => s.keyword === 'Spring Boot')
      expect(springBootSeg?.covered).toBe(false)
    })

    it('handles keyword at start and end of text', () => {
      const segments = highlightJdKeywords('Java 和 MySQL', new Set())
      const keywordSegments = segments.filter((s) => s.keyword !== null)
      expect(keywordSegments).toHaveLength(2)
    })

    it('preserves original keyword casing in segment text', () => {
      const segments = highlightJdKeywords('使用 SPRING BOOT 框架', new Set())
      const springBootSeg = segments.find((s) => s.keyword === 'SPRING BOOT')
      expect(springBootSeg).toBeDefined()
      expect(springBootSeg?.text).toBe('SPRING BOOT')
    })
  })
})
