import { describe, expect, it } from 'vitest'

import {
  buildQuestionReviewInsights,
} from '@/services/questionInsightService'
import type { PracticeRecord, Question } from '@/stores/questionBank'

function createQuestion(overrides: Partial<Question>): Question {
  return {
    id: 'q-default',
    chapterId: 'ch1',
    number: 1,
    title: '默认题目',
    difficulty: 'intermediate',
    labels: ['高频追问'],
    source: 'manual',
    projectNames: [],
    techStacks: [],
    answer: {
      content: '参考答案',
      followUp: [],
    },
    ...overrides,
  }
}

function createRecord(overrides: Partial<PracticeRecord>): PracticeRecord {
  return {
    answer: '我的回答',
    notes: '',
    mastery: 'practicing',
    updatedAt: 1,
    aiReview: null,
    ...overrides,
  }
}

describe('questionInsightService', () => {
  it('aggregates weak tech stacks, projects and review queue', () => {
    const questions: Question[] = [
      createQuestion({
        id: 'q1',
        chapterId: 'ch9',
        title: '订单中台里 Redis 缓存一致性怎么做？',
        labels: ['项目深挖', '高频追问'],
        projectNames: ['订单中台'],
        techStacks: ['Redis'],
      }),
      createQuestion({
        id: 'q2',
        chapterId: 'ch10',
        title: 'Kafka 消息堆积怎么排查？',
        labels: ['深入理解'],
        projectNames: ['订单中台'],
        techStacks: ['Kafka'],
      }),
      createQuestion({
        id: 'q3',
        chapterId: 'ch1',
        title: '线程池参数为什么这样配置？',
        labels: ['必须掌握'],
        techStacks: ['Java'],
      }),
    ]

    const practiceRecords = {
      q1: createRecord({
        mastery: 'weak',
        aiReview: {
          overallScore: 52,
          completenessScore: 50,
          accuracyScore: 55,
          depthScore: 48,
          deliveryScore: 58,
          summary: 'Redis 细节不够落地。',
          strengths: [],
          improvements: [],
          improvedAnswer: '改进答案',
          updatedAt: 100,
        },
      }),
      q2: createRecord({
        answer: '',
        mastery: 'practicing',
        updatedAt: 80,
      }),
      q3: createRecord({
        mastery: 'mastered',
        aiReview: {
          overallScore: 88,
          completenessScore: 86,
          accuracyScore: 89,
          depthScore: 87,
          deliveryScore: 90,
          summary: '不错',
          strengths: [],
          improvements: [],
          improvedAnswer: '改进答案',
          updatedAt: 120,
        },
      }),
    }

    const result = buildQuestionReviewInsights(questions, practiceRecords)

    expect(result.summary).toEqual({
      totalQuestions: 3,
      practicedQuestions: 3,
      aiReviewedQuestions: 2,
      weakCount: 1,
      reviewCount: 2,
      masteredCount: 1,
      averageAiScore: 70,
    })
    expect(result.weakTechStacks[0]).toEqual({
      key: 'Redis',
      label: 'Redis',
      count: 3,
    })
    expect(result.weakProjects[0]).toEqual({
      key: '订单中台',
      label: '订单中台',
      count: 5,
    })
    expect(result.weakChapters.map((item) => item.key)).toEqual(['ch9', 'ch10'])
    expect(result.weakLabels.map((item) => item.label)).toEqual(['高频追问', '项目深挖', '深入理解'])
    expect(result.reviewQueue.map((item) => item.questionId)).toEqual(['q1', 'q2'])
    expect(result.actionItems).toHaveLength(4)
  })

  it('returns onboarding guidance when there is no practice data yet', () => {
    const questions: Question[] = [
      createQuestion({
        id: 'q1',
        title: '还没练过的题',
      }),
    ]

    const result = buildQuestionReviewInsights(questions, {})

    expect(result.summary.practicedQuestions).toBe(0)
    expect(result.reviewQueue).toEqual([])
    expect(result.actionItems).toEqual([
      '先挑 3-5 道核心题开始练，写出“我的回答”后，这里会自动形成复盘摘要。',
    ])
  })
})
