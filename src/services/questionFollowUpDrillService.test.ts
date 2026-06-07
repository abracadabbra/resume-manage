import { describe, expect, it } from 'vitest'

import {
  buildFallbackFollowUpDrillPlan,
  normalizeFollowUpDrillPlan,
} from '@/services/questionFollowUpDrillService'
import type { Question } from '@/stores/questionBank'

function createQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    chapterId: 'ch9',
    number: 1,
    title: '你们项目里的 Redis 缓存一致性怎么做？',
    difficulty: 'advanced',
    labels: ['项目深挖'],
    source: 'project-generated',
    projectNames: ['订单中台'],
    techStacks: ['Redis', 'MySQL'],
    answer: {
      content: '先讲读写路径，再讲延迟双删、重试补偿和监控兜底。',
      followUp: [
        {
          question: '如果删除缓存失败了，你怎么兜底？',
          answer: '可以通过重试队列、订阅 binlog 或定时补偿任务兜底。',
        },
        {
          question: '高并发下为什么不用先删缓存再写库？',
          answer: '因为会放大并发窗口，容易让旧值重新回填到缓存。',
        },
      ],
    },
    ...overrides,
  }
}

describe('questionFollowUpDrillService', () => {
  it('builds a fallback drill plan when built-in follow-ups are enough', () => {
    const question = createQuestion({
      answer: {
        content: '主答案',
        followUp: [
          { question: '追问1', answer: '答案1' },
          { question: '追问2', answer: '答案2' },
          { question: '追问3', answer: '答案3' },
        ],
      },
    })

    const result = buildFallbackFollowUpDrillPlan(question)

    expect(result).toEqual({
      summary: '已基于题库内置追问整理出 4 轮训练，可直接开始演练。',
      rounds: [
        {
          question: '你们项目里的 Redis 缓存一致性怎么做？',
          focus: '主问题',
          referenceAnswer: '主答案',
        },
        {
          question: '追问1',
          focus: '第一层追问',
          referenceAnswer: '答案1',
        },
        {
          question: '追问2',
          focus: '第二层追问',
          referenceAnswer: '答案2',
        },
        {
          question: '追问3',
          focus: '继续深挖',
          referenceAnswer: '答案3',
        },
      ],
    })
  })

  it('returns null when fallback rounds are less than three', () => {
    const question = createQuestion({
      answer: {
        content: '主答案',
        followUp: [{ question: '追问1', answer: '答案1' }],
      },
    })

    expect(buildFallbackFollowUpDrillPlan(question)).toBeNull()
  })

  it('normalizes ai follow-up drill payload', () => {
    const raw = {
      summary: '主要考察候选人是否能把缓存一致性讲到线上兜底。',
      rounds: [
        {
          question: '第1轮问题',
          focus: '主问题',
          referenceAnswer: '答案1',
        },
        {
          question: '第2轮问题',
          focus: '异常处理',
          referenceAnswer: '答案2',
        },
        {
          question: '第3轮问题',
          focus: '',
          referenceAnswer: '答案3',
        },
      ],
    }

    expect(normalizeFollowUpDrillPlan(raw)).toEqual({
      summary: '主要考察候选人是否能把缓存一致性讲到线上兜底。',
      rounds: [
        {
          question: '第1轮问题',
          focus: '主问题',
          referenceAnswer: '答案1',
        },
        {
          question: '第2轮问题',
          focus: '异常处理',
          referenceAnswer: '答案2',
        },
        {
          question: '第3轮问题',
          focus: '继续深挖',
          referenceAnswer: '答案3',
        },
      ],
    })
  })
})
