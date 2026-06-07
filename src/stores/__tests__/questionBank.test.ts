import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

import {
  getQuestionBankState,
  upsertQuestionBankState,
} from '@/services/supabase'
import type { Chapter, Question } from '@/stores/questionBank'
import { useQuestionBankStore } from '@/stores/questionBank'

vi.mock('@/services/supabase', () => ({
  getQuestionBankState: vi.fn(),
  upsertQuestionBankState: vi.fn(),
}))

const STORAGE_KEY = 'question-bank-added-questions'
const PRACTICE_STORAGE_KEY = 'question-bank-practice-records'

function createStorage(initial: Record<string, string> = {}) {
  const memory = new Map<string, string>(Object.entries(initial))
  return {
    getItem(key: string) {
      return memory.get(key) ?? null
    },
    setItem(key: string, value: string) {
      memory.set(key, value)
    },
    removeItem(key: string) {
      memory.delete(key)
    },
    clear() {
      memory.clear()
    },
  }
}

function createDataset() {
  const chapters: Chapter[] = [
    {
      id: 'ch1',
      name: 'Java 基础',
      shortName: 'Java',
      order: 1,
      questionCount: 1,
    },
  ]

  const questions: Question[] = [
    {
      id: 'ch1_q1',
      chapterId: 'ch1',
      number: 1,
      title: '线程池核心参数有哪些？',
      difficulty: 'basic',
      labels: ['必须掌握'],
      answer: {
        content: '答案内容',
        followUp: [],
      },
    },
  ]

  return { chapters, questions }
}

describe('questionBank store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useRealTimers()
    vi.stubGlobal('localStorage', createStorage())
    vi.mocked(getQuestionBankState).mockReset()
    vi.mocked(upsertQuestionBankState).mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('loads bundled questions only once and keeps local added questions', async () => {
    const addedQuestion = [
      {
        id: 'added_1',
        chapterId: 'ch1',
        number: 1,
        title: '本地新增题',
        difficulty: 'advanced',
        labels: ['自定义'],
        answer: {
          content: '本地答案',
          followUp: [],
        },
      },
    ]
    vi.stubGlobal(
      'localStorage',
      createStorage({
        [STORAGE_KEY]: JSON.stringify(addedQuestion),
      }),
    )

    const store = useQuestionBankStore()
    const dataset = createDataset()
    const loader = vi.fn().mockResolvedValue(dataset)

    await store.ensureBundledQuestionsLoaded(loader)
    await store.ensureBundledQuestionsLoaded(loader)

    expect(loader).toHaveBeenCalledTimes(1)
    expect(store.isLoaded).toBe(true)
    expect(store.loadError).toBe('')
    expect(store.chapters).toEqual(dataset.chapters)
    expect(store.bundledQuestions).toEqual(
      dataset.questions.map((item) => ({
        ...item,
        source: 'bundled',
        projectNames: [],
        techStacks: [],
      })),
    )
    expect(store.addedQuestions).toEqual(
      addedQuestion.map((item) => ({
        ...item,
        source: 'manual',
        projectNames: [],
        techStacks: [],
      })),
    )
    expect(store.questions).toHaveLength(2)
  })

  it('reuses the in-flight loader promise for concurrent requests', async () => {
    const store = useQuestionBankStore()
    const dataset = createDataset()
    let resolveLoader: ((value: typeof dataset) => void) | null = null
    const loader = vi.fn(
      () =>
        new Promise<typeof dataset>((resolve) => {
          resolveLoader = resolve
        }),
    )

    const first = store.ensureBundledQuestionsLoaded(loader)
    const second = store.ensureBundledQuestionsLoaded(loader)

    expect(loader).toHaveBeenCalledTimes(1)
    expect(store.isLoading).toBe(true)

    resolveLoader?.(dataset)
    await Promise.all([first, second])

    expect(store.isLoaded).toBe(true)
    expect(store.questions).toHaveLength(1)
  })

  it('records load error and can retry successfully', async () => {
    const store = useQuestionBankStore()
    const failLoader = vi.fn().mockRejectedValue(new Error('boom'))

    await store.ensureBundledQuestionsLoaded(failLoader)

    expect(store.isLoaded).toBe(false)
    expect(store.isLoading).toBe(false)
    expect(store.loadError).toBe('boom')

    const dataset = createDataset()
    const successLoader = vi.fn().mockResolvedValue(dataset)
    await store.ensureBundledQuestionsLoaded(successLoader)

    expect(successLoader).toHaveBeenCalledTimes(1)
    expect(store.isLoaded).toBe(true)
    expect(store.loadError).toBe('')
    expect(store.questions).toHaveLength(1)
  })

  it('persists added questions after bundled data loads', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('localStorage', createStorage())

    const store = useQuestionBankStore()
    await store.ensureBundledQuestionsLoaded(vi.fn().mockResolvedValue(createDataset()))

    store.addQuestion({
      chapterId: 'ch1',
      title: '新增一道题',
      difficulty: 'intermediate',
      labels: ['手动录入'],
      answer: {
        content: '新增答案',
        followUp: [],
      },
    })

    await nextTick()
    await vi.advanceTimersByTimeAsync(500)

    const stored = localStorage.getItem(STORAGE_KEY)
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored ?? '[]')).toHaveLength(1)
    expect(store.questions).toHaveLength(2)
  })

  it('assigns continuous numbers when adding multiple questions into a chapter', async () => {
    const store = useQuestionBankStore()
    await store.ensureBundledQuestionsLoaded(vi.fn().mockResolvedValue(createDataset()))

    const imported = store.addQuestions([
      {
        chapterId: 'ch1',
        title: '第一道批量题',
        difficulty: 'basic',
        labels: ['简历定制'],
        answer: {
          content: '答案一',
          followUp: [],
        },
      },
      {
        chapterId: 'ch1',
        title: '第二道批量题',
        difficulty: 'advanced',
        labels: ['简历定制'],
        answer: {
          content: '答案二',
          followUp: [],
        },
      },
    ])

    expect(imported.map((item) => item.number)).toEqual([2, 3])
  })

  it('filters resume-generated questions separately', async () => {
    const store = useQuestionBankStore()
    await store.ensureBundledQuestionsLoaded(vi.fn().mockResolvedValue(createDataset()))

    store.addQuestion({
      chapterId: 'ch1',
      title: '简历定制追问题',
      difficulty: 'intermediate',
      labels: ['简历定制', '项目深挖'],
      answer: {
        content: '定制答案',
        followUp: [],
      },
    })

    expect(store.filteredQuestions).toHaveLength(2)

    store.setViewFilter('resume-generated')

    expect(store.filteredQuestions).toHaveLength(1)
    expect(store.filteredQuestions[0]?.title).toBe('简历定制追问题')
  })

  it('includes all ai-generated sources in the generated-question view', async () => {
    const store = useQuestionBankStore()
    await store.ensureBundledQuestionsLoaded(vi.fn().mockResolvedValue(createDataset()))

    store.addQuestions([
      {
        chapterId: 'ch1',
        title: '简历生成题',
        difficulty: 'intermediate',
        labels: ['简历定制'],
        source: 'resume-generated',
        answer: {
          content: '简历生成答案',
          followUp: [],
        },
      },
      {
        chapterId: 'ch1',
        title: '项目生成题',
        difficulty: 'advanced',
        labels: ['简历定制', '项目深挖'],
        source: 'project-generated',
        answer: {
          content: '项目生成答案',
          followUp: [],
        },
      },
      {
        chapterId: 'ch1',
        title: '面试复盘题',
        difficulty: 'advanced',
        labels: ['简历定制', '高频追问'],
        source: 'interview-review',
        answer: {
          content: '面试复盘答案',
          followUp: [],
        },
      },
    ])

    store.setViewFilter('resume-generated')

    expect(store.filteredQuestions.map((item) => item.title)).toEqual([
      '简历生成题',
      '项目生成题',
      '面试复盘题',
    ])
  })

  it('normalizes metadata and supports combined advanced filters', async () => {
    const store = useQuestionBankStore()
    await store.ensureBundledQuestionsLoaded(vi.fn().mockResolvedValue(createDataset()))

    const [targetQuestion] = store.addQuestions([
      {
        chapterId: 'ch1',
        title: '订单中台里 Redis 缓存一致性怎么做？',
        difficulty: 'advanced',
        labels: ['项目深挖', '高频追问', '项目深挖'],
        source: 'project-generated',
        projectNames: ['订单中台', '订单中台'],
        answer: {
          content: '我会先讲 MySQL 与 Redis 的双写顺序，再讲延迟双删和兜底补偿。',
          followUp: [],
        },
      },
      {
        chapterId: 'ch1',
        title: 'Kafka 消息堆积怎么排查？',
        difficulty: 'advanced',
        labels: ['高频追问'],
        source: 'resume-generated',
        projectNames: ['内容平台'],
        answer: {
          content: '先看消费速度，再看分区与消息体大小。',
          followUp: [],
        },
      },
      {
        chapterId: 'ch1',
        title: '线程池参数为什么这样配置？',
        difficulty: 'basic',
        labels: ['必须掌握'],
        source: 'manual',
        answer: {
          content: '要结合任务类型、CPU 核数和队列策略。',
          followUp: [],
        },
      },
    ])

    expect(targetQuestion).toMatchObject({
      labels: ['项目深挖', '高频追问'],
      projectNames: ['订单中台'],
      techStacks: ['MySQL', 'Redis'],
      source: 'project-generated',
    })

    store.setPracticeMastery(targetQuestion.id, 'weak')
    store.setSearchQuery('缓存一致性')
    store.setDifficultyFilter('advanced')
    store.setSourceFilter('project-generated')
    store.setMasteryFilter('weak')
    store.setLabelFilter('项目深挖')
    store.setProjectNameFilter('订单中台')
    store.setTechStackFilter('Redis')

    expect(store.filteredQuestions).toHaveLength(1)
    expect(store.filteredQuestions[0]?.title).toBe('订单中台里 Redis 缓存一致性怎么做？')

    store.clearAdvancedFilters()

    expect(store.difficultyFilter).toBeNull()
    expect(store.sourceFilter).toBe('all')
    expect(store.masteryFilter).toBe('all')
    expect(store.labelFilter).toBeNull()
    expect(store.projectNameFilter).toBeNull()
    expect(store.techStackFilter).toBeNull()
    expect(store.searchQuery).toBe('缓存一致性')
  })

  it('persists practice records locally', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('localStorage', createStorage())

    const store = useQuestionBankStore()
    await store.ensureBundledQuestionsLoaded(vi.fn().mockResolvedValue(createDataset()))

    store.upsertPracticeRecord('ch1_q1', {
      answer: '我会先讲线程池的七个核心参数',
      notes: '拒绝策略还要再补一遍',
    })

    expect(store.getPracticeRecord('ch1_q1')).toEqual({
      answer: '我会先讲线程池的七个核心参数',
      notes: '拒绝策略还要再补一遍',
      mastery: 'practicing',
      updatedAt: expect.any(Number),
      aiReview: null,
    })

    await nextTick()
    await vi.advanceTimersByTimeAsync(500)

    const stored = localStorage.getItem('question-bank-practice-records')
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored ?? '{}')).toMatchObject({
      ch1_q1: {
        answer: '我会先讲线程池的七个核心参数',
        notes: '拒绝策略还要再补一遍',
        mastery: 'practicing',
      },
    })
  })

  it('navigates through filtered questions with next and previous selection helpers', async () => {
    const store = useQuestionBankStore()
    await store.ensureBundledQuestionsLoaded(vi.fn().mockResolvedValue(createDataset()))

    const imported = store.addQuestions([
      {
        chapterId: 'ch1',
        title: '第一道扩展题',
        difficulty: 'basic',
        labels: ['高频追问'],
        answer: {
          content: '答案一',
          followUp: [],
        },
      },
      {
        chapterId: 'ch1',
        title: '第二道扩展题',
        difficulty: 'advanced',
        labels: ['高频追问'],
        answer: {
          content: '答案二',
          followUp: [],
        },
      },
    ])

    expect(store.selectedQuestionIndex).toBe(-1)

    store.selectNextQuestion()
    expect(store.selectedQuestionId).toBe('ch1_q1')
    expect(store.selectedQuestionIndex).toBe(0)

    store.selectNextQuestion()
    expect(store.selectedQuestionId).toBe(imported[0]?.id)
    expect(store.selectedQuestionIndex).toBe(1)

    store.selectNextQuestion()
    expect(store.selectedQuestionId).toBe(imported[1]?.id)
    expect(store.selectedQuestionIndex).toBe(2)

    store.selectPreviousQuestion()
    expect(store.selectedQuestionId).toBe(imported[0]?.id)

    store.setDifficultyFilter('advanced')
    expect(store.filteredQuestions).toHaveLength(1)

    store.selectPreviousQuestion()
    expect(store.selectedQuestionId).toBe(imported[1]?.id)
    expect(store.selectedQuestionIndex).toBe(0)
  })

  it('updates mastery for multiple questions at once', async () => {
    const store = useQuestionBankStore()
    await store.ensureBundledQuestionsLoaded(vi.fn().mockResolvedValue(createDataset()))

    const imported = store.addQuestions([
      {
        chapterId: 'ch1',
        title: '批量题一',
        difficulty: 'basic',
        labels: ['高频追问'],
        answer: {
          content: '答案一',
          followUp: [],
        },
      },
      {
        chapterId: 'ch1',
        title: '批量题二',
        difficulty: 'intermediate',
        labels: ['项目深挖'],
        answer: {
          content: '答案二',
          followUp: [],
        },
      },
    ])

    store.batchSetPracticeMastery(
      imported.map((item) => item.id),
      'practicing',
    )

    expect(store.getPracticeRecord(imported[0]!.id).mastery).toBe('practicing')
    expect(store.getPracticeRecord(imported[1]!.id).mastery).toBe('practicing')
  })

  it('collects weak questions into review view', async () => {
    const store = useQuestionBankStore()
    await store.ensureBundledQuestionsLoaded(vi.fn().mockResolvedValue(createDataset()))

    store.setPracticeMastery('ch1_q1', 'weak')

    expect(store.reviewQuestionCount).toBe(1)

    store.setViewFilter('review')

    expect(store.filteredQuestions).toHaveLength(1)
    expect(store.filteredQuestions[0]?.id).toBe('ch1_q1')
  })

  it('saves ai review and updates mastery by score', async () => {
    const store = useQuestionBankStore()
    await store.ensureBundledQuestionsLoaded(vi.fn().mockResolvedValue(createDataset()))

    store.upsertPracticeRecord('ch1_q1', {
      answer: '线程池有核心线程数、最大线程数和队列。',
    })

    store.savePracticeAiReview('ch1_q1', {
      overallScore: 52,
      completenessScore: 48,
      accuracyScore: 60,
      depthScore: 45,
      deliveryScore: 55,
      summary: '回答抓到主干，但细节明显不够。',
      strengths: ['能先说出核心参数'],
      improvements: ['要补拒绝策略触发时机'],
      improvedAnswer: '建议按参数定义、流转流程、拒绝策略三个层次回答。',
    })

    expect(store.getPracticeRecord('ch1_q1')).toMatchObject({
      mastery: 'weak',
      aiReview: {
        overallScore: 52,
        completenessScore: 48,
        accuracyScore: 60,
        depthScore: 45,
        deliveryScore: 55,
        summary: '回答抓到主干，但细节明显不够。',
        strengths: ['能先说出核心参数'],
        improvements: ['要补拒绝策略触发时机'],
        improvedAnswer: '建议按参数定义、流转流程、拒绝策略三个层次回答。',
        updatedAt: expect.any(Number),
      },
    })
  })

  it('keeps ai review when practice answer is updated later', async () => {
    const store = useQuestionBankStore()
    await store.ensureBundledQuestionsLoaded(vi.fn().mockResolvedValue(createDataset()))

    store.upsertPracticeRecord('ch1_q1', {
      answer: '第一版回答',
    })

    store.savePracticeAiReview('ch1_q1', {
      overallScore: 88,
      completenessScore: 86,
      accuracyScore: 90,
      depthScore: 85,
      deliveryScore: 87,
      summary: '回答完整度不错，还可以更口语化。',
      strengths: ['结构清晰'],
      improvements: ['可以再补一个业务场景'],
      improvedAnswer: '建议先讲线程池参数，再讲任务提交流转和拒绝策略。',
    })

    store.upsertPracticeRecord('ch1_q1', {
      answer: '我采用优化后的版本来重新回答。',
    })

    expect(store.getPracticeRecord('ch1_q1')).toMatchObject({
      answer: '我采用优化后的版本来重新回答。',
      aiReview: {
        overallScore: 88,
        summary: '回答完整度不错，还可以更口语化。',
        improvedAnswer: '建议先讲线程池参数，再讲任务提交流转和拒绝策略。',
      },
    })
  })

  it('uploads added questions and practice records to cloud', async () => {
    vi.mocked(upsertQuestionBankState).mockImplementation(async (userId, data) => ({
      user_id: userId,
      data,
      updated_at: '2026-06-07T10:00:00.000Z',
    }))

    const store = useQuestionBankStore()
    await store.ensureBundledQuestionsLoaded(vi.fn().mockResolvedValue(createDataset()))

    const created = store.addQuestion({
      chapterId: 'ch1',
      title: '云端同步题',
      difficulty: 'intermediate',
      labels: ['手动录入'],
      answer: {
        content: '同步答案',
        followUp: [],
      },
    })
    store.upsertPracticeRecord(created.id, {
      answer: '我的同步回答',
      notes: '同步备注',
    })

    await store.pushToCloud('user-1')

    expect(upsertQuestionBankState).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        schemaVersion: 1,
        addedQuestions: [
          expect.objectContaining({
            id: created.id,
            title: '云端同步题',
          }),
        ],
        practiceRecords: {
          [created.id]: expect.objectContaining({
            answer: '我的同步回答',
            notes: '同步备注',
            mastery: 'practicing',
          }),
        },
        updatedAt: expect.any(Number),
      }),
    )
    expect(store.cloudSyncStatus).toBe('idle')
    expect(store.cloudSyncError).toBe('')
    expect(store.cloudLastSyncedAt).toBe(new Date('2026-06-07T10:00:00.000Z').getTime())
  })

  it('pulls cloud data and merges local records without deleting local questions', async () => {
    const localQuestion = {
      id: 'added_local',
      chapterId: 'ch1',
      number: 2,
      title: '本地保留题',
      difficulty: 'basic',
      labels: ['本地'],
      answer: {
        content: '本地答案',
        followUp: [],
      },
    }
    vi.stubGlobal(
      'localStorage',
      createStorage({
        [STORAGE_KEY]: JSON.stringify([localQuestion]),
        [PRACTICE_STORAGE_KEY]: JSON.stringify({
          ch1_q1: {
            answer: '本地较旧回答',
            notes: '',
            mastery: 'practicing',
            updatedAt: 100,
            aiReview: null,
          },
          added_local: {
            answer: '本地自定义题回答',
            notes: '',
            mastery: 'mastered',
            updatedAt: 300,
            aiReview: null,
          },
        }),
      }),
    )
    setActivePinia(createPinia())

    vi.mocked(getQuestionBankState).mockResolvedValue({
      user_id: 'user-1',
      updated_at: '2026-06-07T11:00:00.000Z',
      data: {
        schemaVersion: 1,
        updatedAt: 200,
        addedQuestions: [
          {
            id: 'added_cloud',
            chapterId: 'ch1',
            number: 3,
            title: '云端新增题',
            difficulty: 'advanced',
            labels: ['云端'],
            source: 'manual',
            projectNames: [],
            techStacks: [],
            answer: {
              content: '云端答案',
              followUp: [],
            },
          },
        ],
        practiceRecords: {
          ch1_q1: {
            answer: '云端较新回答',
            notes: '云端备注',
            mastery: 'weak',
            updatedAt: 200,
            aiReview: null,
          },
          added_local: {
            answer: '云端较旧回答',
            notes: '',
            mastery: 'weak',
            updatedAt: 50,
            aiReview: null,
          },
        },
      },
    })

    const store = useQuestionBankStore()
    await store.pullFromCloud('user-1')

    expect(store.addedQuestions.map((item) => item.id)).toEqual([
      'added_local',
      'added_cloud',
    ])
    expect(store.getPracticeRecord('ch1_q1')).toMatchObject({
      answer: '云端较新回答',
      notes: '云端备注',
      mastery: 'weak',
      updatedAt: 200,
    })
    expect(store.getPracticeRecord('added_local')).toMatchObject({
      answer: '本地自定义题回答',
      mastery: 'mastered',
      updatedAt: 300,
    })
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toHaveLength(2)
    expect(JSON.parse(localStorage.getItem(PRACTICE_STORAGE_KEY) ?? '{}')).toMatchObject({
      ch1_q1: {
        answer: '云端较新回答',
      },
      added_local: {
        answer: '本地自定义题回答',
      },
    })
  })

  it('records cloud sync errors without changing status permanently', async () => {
    vi.mocked(getQuestionBankState).mockRejectedValue(new Error('network down'))

    const store = useQuestionBankStore()

    await expect(store.pullFromCloud('user-1')).rejects.toThrow('network down')

    expect(store.cloudSyncStatus).toBe('idle')
    expect(store.cloudSyncError).toBe('network down')
  })
})
