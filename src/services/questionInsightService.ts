import type { PracticeMastery, PracticeRecord, Question } from '@/stores/questionBank'

export interface InsightRankItem {
  key: string
  label: string
  count: number
}

export interface ReviewQueueItem {
  questionId: string
  title: string
  mastery: PracticeMastery
  updatedAt: number | null
  aiScore: number | null
  projectNames: string[]
  techStacks: string[]
}

export interface QuestionReviewInsights {
  summary: {
    totalQuestions: number
    practicedQuestions: number
    aiReviewedQuestions: number
    weakCount: number
    reviewCount: number
    masteredCount: number
    averageAiScore: number | null
  }
  weakTechStacks: InsightRankItem[]
  weakProjects: InsightRankItem[]
  weakChapters: InsightRankItem[]
  weakLabels: InsightRankItem[]
  reviewQueue: ReviewQueueItem[]
  actionItems: string[]
}

function isReviewCandidate(record: PracticeRecord): boolean {
  if (record.mastery === 'weak') return true
  return record.updatedAt !== null && record.mastery === 'practicing' && record.answer.trim() === ''
}

function getAttentionWeight(record: PracticeRecord): number {
  let weight = record.mastery === 'weak' ? 2 : 1
  if (record.aiReview && record.aiReview.overallScore < 60) weight += 1
  if (record.updatedAt !== null && record.answer.trim() === '') weight += 1
  return weight
}

function bumpRank(
  bucket: Map<string, InsightRankItem>,
  key: string,
  label: string,
  count: number,
) {
  const normalizedKey = key.trim()
  const normalizedLabel = label.trim()
  if (!normalizedKey || !normalizedLabel || count <= 0) return

  const current = bucket.get(normalizedKey)
  if (current) {
    current.count += count
    return
  }

  bucket.set(normalizedKey, {
    key: normalizedKey,
    label: normalizedLabel,
    count,
  })
}

function sortRankItems(items: Iterable<InsightRankItem>, limit = 5): InsightRankItem[] {
  return [...items]
    .sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label, 'zh-CN'))
    .slice(0, limit)
}

function roundAverage(value: number): number {
  return Math.round(value * 10) / 10
}

export function buildQuestionReviewInsights(
  questions: Question[],
  practiceRecords: Record<string, PracticeRecord>,
): QuestionReviewInsights {
  const techStackBucket = new Map<string, InsightRankItem>()
  const projectBucket = new Map<string, InsightRankItem>()
  const chapterBucket = new Map<string, InsightRankItem>()
  const labelBucket = new Map<string, InsightRankItem>()
  const reviewQueue: ReviewQueueItem[] = []

  const practicedQuestions = questions.filter((question) => practiceRecords[question.id])
  const aiReviewedRecords = practicedQuestions
    .map((question) => practiceRecords[question.id]?.aiReview?.overallScore ?? null)
    .filter((score): score is number => typeof score === 'number')

  let weakCount = 0
  let reviewCount = 0
  let masteredCount = 0

  for (const question of questions) {
    const record = practiceRecords[question.id]
    if (!record) continue

    if (record.mastery === 'weak') weakCount += 1
    if (record.mastery === 'mastered') masteredCount += 1

    const needsAttention = isReviewCandidate(record)
    if (!needsAttention) continue

    reviewCount += 1
    const weight = getAttentionWeight(record)

    for (const techStack of question.techStacks ?? []) {
      bumpRank(techStackBucket, techStack, techStack, weight)
    }

    for (const projectName of question.projectNames ?? []) {
      bumpRank(projectBucket, projectName, projectName, weight)
    }

    bumpRank(chapterBucket, question.chapterId, question.chapterId, weight)

    for (const label of question.labels) {
      if (label === '简历定制') continue
      bumpRank(labelBucket, label, label, weight)
    }

    reviewQueue.push({
      questionId: question.id,
      title: question.title,
      mastery: record.mastery,
      updatedAt: record.updatedAt,
      aiScore: record.aiReview?.overallScore ?? null,
      projectNames: question.projectNames ?? [],
      techStacks: question.techStacks ?? [],
    })
  }

  reviewQueue.sort((a, b) => {
    const masteryWeight = (item: ReviewQueueItem) => (item.mastery === 'weak' ? 0 : 1)
    return (
      masteryWeight(a) - masteryWeight(b)
      || (a.aiScore ?? 999) - (b.aiScore ?? 999)
      || (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
    )
  })

  const averageAiScore = aiReviewedRecords.length > 0
    ? roundAverage(aiReviewedRecords.reduce((sum, score) => sum + score, 0) / aiReviewedRecords.length)
    : null

  const weakTechStacks = sortRankItems(techStackBucket.values())
  const weakProjects = sortRankItems(projectBucket.values(), 4)
  const weakChapters = sortRankItems(chapterBucket.values(), 4)
  const weakLabels = sortRankItems(labelBucket.values(), 4)

  const actionItems: string[] = []

  if (reviewCount > 0) {
    actionItems.push(`先清掉 ${reviewCount} 道待复习题，优先补“薄弱”和写不出来的题。`)
  }
  if (weakTechStacks[0]) {
    actionItems.push(`技术点先补 ${weakTechStacks[0].label}，这是你当前最常卡住的方向。`)
  }
  if (weakProjects[0]) {
    actionItems.push(`项目复盘先回到 ${weakProjects[0].label}，这里最容易被继续深挖。`)
  }
  if (weakLabels[0]) {
    actionItems.push(`知识块优先强化“${weakLabels[0].label}”相关回答。`)
  }
  if (actionItems.length === 0) {
    actionItems.push('先挑 3-5 道核心题开始练，写出“我的回答”后，这里会自动形成复盘摘要。')
  }

  return {
    summary: {
      totalQuestions: questions.length,
      practicedQuestions: practicedQuestions.length,
      aiReviewedQuestions: aiReviewedRecords.length,
      weakCount,
      reviewCount,
      masteredCount,
      averageAiScore,
    },
    weakTechStacks,
    weakProjects,
    weakChapters,
    weakLabels,
    reviewQueue: reviewQueue.slice(0, 6),
    actionItems,
  }
}
