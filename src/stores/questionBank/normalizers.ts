import {
  buildQuestionSearchText,
  extractTechStacksFromText,
  normalizeStringList,
} from '@/services/questionMetaService'
import type {
  AiAnswerData,
  PracticeAiReview,
  PracticeRecord,
  Question,
  QuestionSource,
} from './types'

export const AI_GENERATED_SOURCES: QuestionSource[] = ['resume-generated', 'project-generated', 'interview-review']

export function clampScore(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function inferQuestionSource(labels: string[] = [], fallback: QuestionSource = 'manual'): QuestionSource {
  return labels.includes('简历定制') ? 'resume-generated' : fallback
}

export function createEmptyPracticeRecord(): PracticeRecord {
  return {
    answer: '',
    notes: '',
    mastery: 'unpracticed',
    updatedAt: null,
    aiReview: null,
  }
}

export function normalizeAiReview(input: unknown): PracticeAiReview | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Partial<PracticeAiReview>

  return {
    overallScore: clampScore(record.overallScore),
    completenessScore: clampScore(record.completenessScore),
    accuracyScore: clampScore(record.accuracyScore),
    depthScore: clampScore(record.depthScore),
    deliveryScore: clampScore(record.deliveryScore),
    summary: String(record.summary ?? '').trim(),
    strengths: Array.isArray(record.strengths)
      ? record.strengths.map((item) => String(item).trim()).filter(Boolean)
      : [],
    improvements: Array.isArray(record.improvements)
      ? record.improvements.map((item) => String(item).trim()).filter(Boolean)
      : [],
    improvedAnswer: String(record.improvedAnswer ?? '').trim(),
    updatedAt:
      typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
        ? record.updatedAt
        : null,
  }
}

export function normalizePracticeRecord(input: unknown): PracticeRecord {
  if (!input || typeof input !== 'object') return createEmptyPracticeRecord()
  const record = input as Partial<PracticeRecord>

  return {
    answer: String(record.answer ?? ''),
    notes: String(record.notes ?? ''),
    mastery:
      record.mastery === 'practicing'
      || record.mastery === 'mastered'
      || record.mastery === 'weak'
        ? record.mastery
        : 'unpracticed',
    updatedAt:
      typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
        ? record.updatedAt
        : null,
    aiReview: normalizeAiReview(record.aiReview),
  }
}

export function normalizePracticeRecords(input: unknown): Record<string, PracticeRecord> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}

  return Object.fromEntries(
    Object.entries(input).map(([questionId, record]) => [
      questionId,
      normalizePracticeRecord(record),
    ]),
  )
}

export function normalizeQuestion(input: Question, fallbackSource: QuestionSource): Question {
  const normalizedLabels = normalizeStringList(input.labels)
  const normalizedProjectNames = normalizeStringList(input.projectNames)
  const normalizedTechStacks = normalizeStringList(input.techStacks)
  const text = buildQuestionSearchText({
    title: input.title,
    answer: input.answer,
    labels: normalizedLabels,
    projectNames: normalizedProjectNames,
    techStacks: normalizedTechStacks,
  })

  return {
    ...input,
    labels: normalizedLabels,
    source: input.source ?? inferQuestionSource(normalizedLabels, fallbackSource),
    projectNames: normalizedProjectNames,
    techStacks: normalizedTechStacks.length > 0 ? normalizedTechStacks : extractTechStacksFromText(text),
  }
}

export function normalizeAiAnswers(input: unknown): Record<string, AiAnswerData> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const record = input as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(record).map(([questionId, data]) => [
      questionId,
      normalizeAiAnswerData(data),
    ]),
  )
}

export function normalizeAiAnswerData(input: unknown): AiAnswerData {
  if (!input || typeof input !== 'object') {
    return { answer: '', conversations: [], updatedAt: 0 }
  }
  const data = input as Partial<AiAnswerData>
  return {
    answer: String(data.answer ?? ''),
    conversations: Array.isArray(data.conversations) ? data.conversations : [],
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
  }
}

export function normalizeCloudAddedQuestions(input: unknown): Question[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((item): item is Question => Boolean(item && typeof item === 'object'))
    .map((item) => normalizeQuestion(item, item.source ?? 'manual'))
}
