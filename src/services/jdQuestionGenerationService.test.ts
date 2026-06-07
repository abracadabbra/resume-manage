import { describe, expect, it } from 'vitest'

import { parseJdQuestionBatch } from '@/services/jdQuestionGenerationService'

describe('jdQuestionGenerationService', () => {
  it('parses fenced json and deduplicates jd questions', () => {
    const raw = `说明文字
\`\`\`json
{
  "summary": "这个 JD 更看重分布式、高并发和项目落地细节。",
  "questions": [
    {
      "chapterId": "ch10",
      "chapterName": "系统设计",
      "title": "如果让你设计一个支持高并发下单的系统，你会怎么做？",
      "difficulty": "advanced",
      "labels": ["简历定制", "设计能力"],
      "answer": {
        "content": "先按流量入口、库存扣减、异步化、幂等和降级保护来拆。",
        "followUp": [
          { "question": "库存一致性如何保证？", "answer": "结合预扣库存、消息补偿和最终一致性。" }
        ]
      }
    },
    {
      "chapterId": "ch10",
      "chapterName": "系统设计",
      "title": "如果让你设计一个支持高并发下单的系统，你会怎么做？",
      "difficulty": "advanced",
      "labels": ["简历定制", "设计能力"],
      "answer": {
        "content": "重复题不应该保留。",
        "followUp": []
      }
    },
    {
      "chapterId": "ch4",
      "chapterName": "数据库 & 缓存",
      "title": "JD 强调 Redis 和 MySQL，你在项目里是怎么做缓存一致性的？",
      "difficulty": "intermediate",
      "labels": ["高频追问"],
      "answer": {
        "content": "按更新顺序、失效策略、重试补偿和监控告警来回答。",
        "followUp": [
          { "question": "为什么不直接双写？", "answer": "双写窗口仍会有时序问题，需要配合失效与补偿。" }
        ]
      }
    }
  ]
}
\`\`\``

    const result = parseJdQuestionBatch(raw)

    expect(result).not.toBeNull()
    expect(result?.summary).toBe('这个 JD 更看重分布式、高并发和项目落地细节。')
    expect(result?.questions).toHaveLength(2)
    expect(result?.questions[0]).toMatchObject({
      chapterId: 'ch10',
      labels: ['简历定制', '设计能力'],
    })
    expect(result?.questions[1]).toMatchObject({
      chapterId: 'ch4',
      labels: ['简历定制', '高频追问'],
    })
  })

  it('returns null when batch contains no valid questions', () => {
    const raw = JSON.stringify({
      summary: '无有效题目',
      questions: [
        {
          chapterId: 'ch1',
          title: '',
          difficulty: 'basic',
          labels: ['简历定制'],
          answer: {
            content: '',
            followUp: [],
          },
        },
      ],
    })

    expect(parseJdQuestionBatch(raw)).toBeNull()
  })
})
