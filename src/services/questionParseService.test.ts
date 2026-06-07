import { describe, expect, it } from 'vitest'

import { parseProjectQuestionBatch } from '@/services/questionParseService'

describe('questionParseService', () => {
  it('parses fenced json and normalizes project-generated questions', () => {
    const raw = `补充说明
\`\`\`json
{
  "summary": "这个项目最容易被追问的是缓存一致性、削峰和异常恢复。",
  "questions": [
    {
      "chapterId": "ch9",
      "chapterName": "项目深挖",
      "title": "这个项目里你负责的核心链路是什么？",
      "difficulty": "advanced",
      "labels": ["高频追问"],
      "answer": {
        "content": "回答时按业务目标、链路拆分、核心模块和效果数据展开。",
        "followUp": [
          { "question": "你在链路里最难的点是什么？", "answer": "重点讲并发、稳定性和排障。" }
        ]
      }
    },
    {
      "chapterId": "ch9",
      "chapterName": "项目深挖",
      "title": "这个项目里你负责的核心链路是什么？",
      "difficulty": "advanced",
      "labels": ["高频追问"],
      "answer": {
        "content": "重复题，不应该重复导入。",
        "followUp": []
      }
    },
    {
      "chapterId": "ch4",
      "chapterName": "数据库 & 缓存",
      "title": "这个项目里你是怎么处理缓存一致性的？",
      "difficulty": "intermediate",
      "labels": ["深入理解"],
      "answer": {
        "content": "按更新顺序、延迟双删、重试补偿和监控告警来回答。",
        "followUp": [
          { "question": "为什么要延迟删？", "answer": "为了覆盖并发读写窗口里的脏数据风险。" }
        ]
      }
    }
  ]
}
\`\`\``

    const result = parseProjectQuestionBatch(raw, '交易平台重构')

    expect(result).not.toBeNull()
    expect(result?.projectName).toBe('交易平台重构')
    expect(result?.summary).toBe('这个项目最容易被追问的是缓存一致性、削峰和异常恢复。')
    expect(result?.questions).toHaveLength(2)
    expect(result?.questions[0]).toMatchObject({
      chapterId: 'ch9',
      labels: ['简历定制', '项目深挖', '高频追问'],
    })
    expect(result?.questions[1]).toMatchObject({
      chapterId: 'ch4',
      labels: ['简历定制', '项目深挖', '深入理解'],
    })
  })

  it('returns null when project batch contains no valid questions', () => {
    const raw = JSON.stringify({
      summary: '无有效题目',
      questions: [
        {
          chapterId: 'ch1',
          title: '',
          difficulty: 'basic',
          labels: ['项目深挖'],
          answer: {
            content: '',
            followUp: [],
          },
        },
      ],
    })

    expect(parseProjectQuestionBatch(raw, '示例项目')).toBeNull()
  })
})
