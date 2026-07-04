import { buildQuestionSearchText } from '@/services/questionMetaService'
import { AI_GENERATED_SOURCES, inferQuestionSource } from './normalizers'
import type {
  PracticeMasteryFilter,
  PracticeRecord,
  Question,
  QuestionSourceFilter,
  QuestionViewFilter,
} from './types'

export interface QuestionFilterState {
  searchQuery: string
  activeChapterId: string | null
  difficulty: string | null
  view: QuestionViewFilter
  source: QuestionSourceFilter
  mastery: PracticeMasteryFilter
  label: string | null
  projectName: string | null
  techStack: string | null
}

export interface ApplyQuestionFiltersHelpers {
  getPracticeRecord: (questionId: string) => PracticeRecord
  isReviewCandidate: (questionId: string) => boolean
}

/**
 * 单次遍历过滤题库。所有 filter 条件在一次 filter 调用中合并判断，
 * 避免多次创建中间数组。逻辑与原 7 层串行 filter 完全等价。
 */
export function applyQuestionFilters(
  questions: readonly Question[],
  filters: QuestionFilterState,
  helpers: ApplyQuestionFiltersHelpers,
): Question[] {
  const searchQuery = filters.searchQuery ? filters.searchQuery.toLowerCase() : ''

  return questions.filter((item) => {
    if (searchQuery && !buildQuestionSearchText(item).toLowerCase().includes(searchQuery)) {
      return false
    }

    if (filters.activeChapterId && item.chapterId !== filters.activeChapterId) {
      return false
    }

    if (filters.difficulty && item.difficulty !== filters.difficulty) {
      return false
    }

    if (filters.source !== 'all' && item.source !== filters.source) {
      return false
    }

    if (filters.mastery !== 'all' && helpers.getPracticeRecord(item.id).mastery !== filters.mastery) {
      return false
    }

    if (filters.label && !item.labels.includes(filters.label)) {
      return false
    }

    if (filters.projectName && !(item.projectNames?.includes(filters.projectName) ?? false)) {
      return false
    }

    if (filters.techStack && !(item.techStacks?.includes(filters.techStack) ?? false)) {
      return false
    }

    if (filters.view === 'resume-generated') {
      const isAiGenerated =
        AI_GENERATED_SOURCES.includes(item.source ?? inferQuestionSource(item.labels, 'manual'))
        || item.labels.includes('简历定制')
      if (!isAiGenerated) return false
    }

    if (filters.view === 'review' && !helpers.isReviewCandidate(item.id)) {
      return false
    }

    return true
  })
}
