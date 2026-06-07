import { describe, expect, it } from 'vitest'

import { parseInterviewReviewQuestionBatch } from '@/services/interviewReviewQuestionService'

describe('interviewReviewQuestionService', () => {
  it('parses fenced json and deduplicates review questions', () => {
    const raw = `这里是复盘结果
\`\`\`json
{
  "summary": "项目讲得不够落地，Redis 和并发细节需要补。",
  "questions": [
    {
      "chapterId": "ch4",
      "chapterName": "数据库 & 缓存",
      "title": "Redis 淘汰策略和持久化你在项目里是怎么选的？",
      "difficulty": "advanced",
      "labels": ["简历定制", "高频追问"],
      "answer": {
        "content": "先结合项目场景说明容量模型，再讲淘汰策略、持久化和恢复取舍。",
        "followUp": [
          { "question": "为什么不用 allkeys-lru？", "answer": "因为要看热点分布和数据价值。" }
        ]
      }
    },
    {
      "chapterId": "ch4",
      "chapterName": "数据库 & 缓存",
      "title": "Redis 淘汰策略和持久化你在项目里是怎么选的？",
      "difficulty": "advanced",
      "labels": ["简历定制", "高频追问"],
      "answer": {
        "content": "重复题目，不应该重复导入。",
        "followUp": []
      }
    },
    {
      "chapterId": "ch1",
      "chapterName": "Java 基础 & 并发",
      "title": "你在项目里怎么解释线程池参数和拒绝策略的选择？",
      "difficulty": "intermediate",
      "labels": ["项目深挖"],
      "answer": {
        "content": "回答时按核心线程数、队列、最大线程数、拒绝策略和压测依据展开。",
        "followUp": [
          { "question": "高峰期队列堆积怎么办？", "answer": "结合限流、扩容和降级方案处理。" }
        ]
      }
    }
  ]
}
\`\`\``

    const result = parseInterviewReviewQuestionBatch(raw)

    expect(result).not.toBeNull()
    expect(result?.summary).toBe('项目讲得不够落地，Redis 和并发细节需要补。')
    expect(result?.questions).toHaveLength(2)
    expect(result?.questions[0]).toMatchObject({
      chapterId: 'ch4',
      title: 'Redis 淘汰策略和持久化你在项目里是怎么选的？',
      labels: ['简历定制', '高频追问'],
    })
    expect(result?.questions[1]).toMatchObject({
      chapterId: 'ch1',
      title: '你在项目里怎么解释线程池参数和拒绝策略的选择？',
      labels: ['简历定制', '项目深挖'],
    })
  })

  it('returns null when no valid review questions can be extracted', () => {
    const raw = JSON.stringify({
      summary: '这次面试没有可用题目',
      questions: [
        {
          chapterId: 'ch1',
          chapterName: 'Java 基础 & 并发',
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

    expect(parseInterviewReviewQuestionBatch(raw)).toBeNull()
  })
})
