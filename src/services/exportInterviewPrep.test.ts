import { describe, expect, it } from 'vitest'

import {
  buildInterviewPrepHtmlDocument,
  filterPreparedQuestions,
  generateInterviewPrepMarkdown,
} from '@/services/exportInterviewPrep'
import type { Chapter, PracticeRecord, Question } from '@/stores/questionBank'

const chapters: Chapter[] = [
  {
    id: 'ch9',
    name: '项目深挖',
    shortName: '项目',
    order: 9,
    questionCount: 2,
  },
]

function createQuestion(overrides: Partial<Question>): Question {
  return {
    id: 'q-default',
    chapterId: 'ch9',
    number: 1,
    title: '默认题目',
    difficulty: 'intermediate',
    labels: ['高频追问'],
    source: 'bundled',
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
    answer: '',
    notes: '',
    mastery: 'unpracticed',
    updatedAt: null,
    aiReview: null,
    ...overrides,
  }
}

describe('exportInterviewPrep', () => {
  it('filters only prepared or non-bundled questions for export', () => {
    const questions: Question[] = [
      createQuestion({ id: 'q1', source: 'bundled' }),
      createQuestion({ id: 'q2', source: 'bundled' }),
      createQuestion({ id: 'q3', source: 'resume-generated' }),
    ]

    const records = {
      q2: createRecord({
        answer: '我练过这题',
        mastery: 'practicing',
        updatedAt: 1,
      }),
    }

    expect(filterPreparedQuestions(questions, records).map((item) => item.id)).toEqual(['q2', 'q3'])
  })

  it('generates markdown interview prep package with summary and question details', () => {
    const questions: Question[] = [
      createQuestion({
        id: 'q1',
        number: 3,
        title: '订单中台里 Redis 缓存一致性怎么做？',
        difficulty: 'advanced',
        labels: ['项目深挖', '高频追问'],
        source: 'project-generated',
        projectNames: ['订单中台'],
        techStacks: ['Redis', 'MySQL'],
        answer: {
          content: '先讲双写顺序，再讲延迟双删和补偿机制。',
          followUp: [
            {
              question: '删除缓存失败怎么办？',
              answer: '靠重试和异步补偿兜底。',
            },
          ],
        },
      }),
    ]

    const records = {
      q1: createRecord({
        answer: '我会先讲写库删缓存，再补充延迟双删。',
        notes: '线上异常补偿还要再背一下。',
        mastery: 'weak',
        updatedAt: new Date('2026-06-06T15:30:00+08:00').getTime(),
        aiReview: {
          overallScore: 58,
          completenessScore: 55,
          accuracyScore: 60,
          depthScore: 54,
          deliveryScore: 63,
          summary: '主干答到了，但异常场景讲得还不够扎实。',
          strengths: ['主流程还算清楚'],
          improvements: ['补缓存删除失败的兜底方案'],
          improvedAnswer: '建议按主链路、异常兜底、监控告警三个层次回答。',
          updatedAt: new Date('2026-06-06T15:40:00+08:00').getTime(),
        },
      }),
    }

    const result = generateInterviewPrepMarkdown({
      displayName: '沈涛',
      scopeLabel: '当前筛选下的已准备题',
      questions,
      chapters,
      practiceRecords: records,
      generatedAt: new Date('2026-06-06T16:00:00+08:00'),
    })

    expect(result).toContain('# 沈涛｜面试准备包')
    expect(result).toContain('- 导出范围：当前筛选下的已准备题')
    expect(result).toContain('## 复盘摘要')
    expect(result).toContain('### Q3｜订单中台里 Redis 缓存一致性怎么做？')
    expect(result).toContain('- 来源：项目生成')
    expect(result).toContain('- 项目：订单中台')
    expect(result).toContain('#### 我的回答')
    expect(result).toContain('#### 练习备注')
    expect(result).toContain('#### AI 点评')
    expect(result).toContain('#### 优化后回答')
    expect(result).toContain('删除缓存失败怎么办？')
  })

  it('renders interview prep html document from markdown', () => {
    const html = buildInterviewPrepHtmlDocument(
      '沈涛｜面试准备包',
      '# 沈涛｜面试准备包\n\n## 题目清单\n\n### Q1｜Redis\n\n#### 我的回答\n\n我会先讲主链路。',
    )

    expect(html).toContain('class="prep-export"')
    expect(html).toContain('<h1>沈涛｜面试准备包</h1>')
    expect(html).toContain('<h2>题目清单</h2>')
    expect(html).toContain('<h3>Q1｜Redis</h3>')
    expect(html).toContain('<h4>我的回答</h4>')
    expect(html).toContain('我会先讲主链路。')
  })
})
