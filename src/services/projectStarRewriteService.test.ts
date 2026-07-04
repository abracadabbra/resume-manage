import { describe, expect, it } from 'vitest'

import { parseProjectStarRewriteResult } from '@/services/projectStarRewriteService'

describe('projectStarRewriteService', () => {
  describe('parseProjectStarRewriteResult', () => {
    it('parses valid json with introduction and mainWork', () => {
      const raw = JSON.stringify({
        introduction: '<p>项目介绍</p>',
        mainWork: '<ul><li>工作内容</li></ul>',
        summary: '重写说明',
      })

      const result = parseProjectStarRewriteResult(raw)

      expect(result).not.toBeNull()
      expect(result?.introduction).toBe('<p>项目介绍</p>')
      expect(result?.mainWork).toBe('<ul><li>工作内容</li></ul>')
      expect(result?.summary).toBe('重写说明')
    })

    it('parses fenced json block', () => {
      const raw = '```json\n' + JSON.stringify({
        introduction: '<p>intro</p>',
        mainWork: '<ul><li>work</li></ul>',
        summary: '说明',
      }) + '\n```'

      const result = parseProjectStarRewriteResult(raw)

      expect(result).not.toBeNull()
      expect(result?.introduction).toBe('<p>intro</p>')
    })

    it('returns null when both introduction and mainWork are empty', () => {
      const raw = JSON.stringify({
        introduction: '',
        mainWork: '',
        summary: '说明',
      })

      const result = parseProjectStarRewriteResult(raw)
      expect(result).toBeNull()
    })

    it('handles missing summary field with default', () => {
      const raw = JSON.stringify({
        introduction: '<p>intro</p>',
        mainWork: '<ul><li>work</li></ul>',
      })

      const result = parseProjectStarRewriteResult(raw)

      expect(result).not.toBeNull()
      expect(result?.summary).toBe('已按 STAR 结构重写')
    })

    it('strips code block markers from html output', () => {
      // 模拟 AI 在 JSON 字符串外层包裹代码块标记
      const inner = JSON.stringify({
        introduction: '<p>intro</p>',
        mainWork: '<ul><li>work</li></ul>',
        summary: '',
      })
      const raw = '```json\n' + inner + '\n```'

      const result = parseProjectStarRewriteResult(raw)

      expect(result).not.toBeNull()
      expect(result?.introduction).toBe('<p>intro</p>')
    })

    it('strips html/body wrapper tags', () => {
      const raw = JSON.stringify({
        introduction: '<html><body><p>intro</p></body></html>',
        mainWork: '<ul><li>work</li></ul>',
        summary: '',
      })

      const result = parseProjectStarRewriteResult(raw)

      expect(result).not.toBeNull()
      expect(result?.introduction).toBe('<p>intro</p>')
    })

    it('returns null on invalid json', () => {
      const result = parseProjectStarRewriteResult('not json at all')
      expect(result).toBeNull()
    })
  })
})
