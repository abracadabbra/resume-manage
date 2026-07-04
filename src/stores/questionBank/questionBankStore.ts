import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getQuestionBankState,
  upsertQuestionBankState,
} from '@/services/supabase'
import {
  createQuestionBankCloudManager,
  type QuestionBankCloudData,
} from '../questionBankCloud'
import type { SyncConflict } from '../syncConflict'
import { useDebouncedAutoSave } from '../useDebouncedAutoSave'
import { applyQuestionFilters, type QuestionFilterState } from './filters'
import {
  clampScore,
  createEmptyPracticeRecord,
  normalizeAiAnswers,
  normalizeCloudAddedQuestions,
  normalizePracticeRecords,
  normalizeQuestion,
} from './normalizers'
import {
  cloneAiAnswers,
  clonePracticeRecords,
  loadAddedQuestions,
  loadAiAnswers,
  loadPracticeRecords,
  saveAddedQuestions,
  saveAiAnswers,
  savePracticeRecords,
} from './persistence'
import type {
  AiAnswerData,
  Chapter,
  PracticeAiReview,
  PracticeMastery,
  PracticeMasteryFilter,
  PracticeRecord,
  Question,
  QuestionBankDataset,
  QuestionDraft,
  QuestionSourceFilter,
  QuestionViewFilter,
} from './types'

async function loadBundledQuestionBankData(): Promise<QuestionBankDataset> {
  const module = await import('@/data/interview-questions.json')
  return module.default as QuestionBankDataset
}

function formatLoadError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return '题库加载失败，请稍后重试'
}

function createQuestionId(): string {
  return `added_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function getRecordTime(record: PracticeRecord): number {
  return record.updatedAt ?? record.aiReview?.updatedAt ?? 0
}

function getQuestionBankUpdatedAt(
  questions: readonly Question[],
  records: Record<string, PracticeRecord>,
): number {
  const recordUpdatedAt = Object.values(records).reduce(
    (max, record) => Math.max(max, getRecordTime(record)),
    0,
  )
  const hasAddedQuestions = questions.length > 0
  return Math.max(recordUpdatedAt, hasAddedQuestions ? Date.now() : 0)
}

function mergePracticeRecords(
  localRecords: Record<string, PracticeRecord>,
  cloudRecords: Record<string, PracticeRecord>,
): Record<string, PracticeRecord> {
  const merged = clonePracticeRecords(localRecords)

  Object.entries(cloudRecords).forEach(([questionId, cloudRecord]) => {
    const localRecord = merged[questionId]
    if (!localRecord || getRecordTime(cloudRecord) >= getRecordTime(localRecord)) {
      merged[questionId] = cloudRecord
    }
  })

  return merged
}

function mergeAiAnswers(
  localAnswers: Record<string, AiAnswerData>,
  cloudAnswers: Record<string, AiAnswerData>,
): Record<string, AiAnswerData> {
  const merged = cloneAiAnswers(localAnswers)

  Object.entries(cloudAnswers).forEach(([questionId, cloudData]) => {
    const localData = merged[questionId]
    if (!localData || cloudData.updatedAt >= localData.updatedAt) {
      merged[questionId] = cloudData
    }
  })

  return merged
}

export const useQuestionBankStore = defineStore('questionBank', () => {
  const bundledQuestions = ref<Question[]>([])
  const addedQuestions = ref<Question[]>(loadAddedQuestions())
  const chapters = ref<Chapter[]>([])
  const searchQuery = ref('')
  const activeChapterId = ref<string | null>(null)
  const difficultyFilter = ref<string | null>(null)
  const viewFilter = ref<QuestionViewFilter>('all')
  const sourceFilter = ref<QuestionSourceFilter>('all')
  const masteryFilter = ref<PracticeMasteryFilter>('all')
  const labelFilter = ref<string | null>(null)
  const projectNameFilter = ref<string | null>(null)
  const techStackFilter = ref<string | null>(null)
  const selectedQuestionId = ref<string | null>(null)
  const isLoading = ref(false)
  const isLoaded = ref(false)
  const loadError = ref('')
  const practiceRecords = ref<Record<string, PracticeRecord>>(loadPracticeRecords())
  const aiAnswers = ref<Record<string, AiAnswerData>>(loadAiAnswers())
  const cloudSyncStatus = ref<'idle' | 'pulling' | 'pushing'>('idle')
  const cloudSyncError = ref('')
  const cloudLastSyncedAt = ref<number | null>(null)
  const cloudConflict = ref<SyncConflict | null>(null)

  const questions = computed(() => [...bundledQuestions.value, ...addedQuestions.value])

  let loadPromise: Promise<void> | null = null

  function getCloudData(): QuestionBankCloudData {
    return {
      schemaVersion: 1,
      addedQuestions: addedQuestions.value.map((item) => ({ ...item })),
      practiceRecords: clonePracticeRecords(practiceRecords.value),
      aiAnswers: cloneAiAnswers(aiAnswers.value),
      updatedAt: getQuestionBankUpdatedAt(addedQuestions.value, practiceRecords.value),
    }
  }

  function loadCloudData(data: QuestionBankCloudData) {
    const cloudQuestions = normalizeCloudAddedQuestions(data.addedQuestions)
    const byId = new Map(addedQuestions.value.map((item) => [item.id, item]))

    cloudQuestions.forEach((question) => {
      byId.set(question.id, question)
    })

    addedQuestions.value = [...byId.values()]
    practiceRecords.value = mergePracticeRecords(
      practiceRecords.value,
      normalizePracticeRecords(data.practiceRecords),
    )
    if (data.aiAnswers) {
      aiAnswers.value = mergeAiAnswers(aiAnswers.value, normalizeAiAnswers(data.aiAnswers))
    }
    saveAddedQuestions(addedQuestions.value)
    savePracticeRecords(practiceRecords.value)
    saveAiAnswers(aiAnswers.value)
  }

  const cloudManager = createQuestionBankCloudManager({
    api: {
      getQuestionBankState,
      upsertQuestionBankState,
    },
    state: {
      cloudSyncStatus,
      cloudSyncError,
      cloudLastSyncedAt,
      cloudConflict,
    },
    getData: getCloudData,
    loadData: loadCloudData,
  })

  // Debounced auto-save (unified via useDebouncedAutoSave)
  useDebouncedAutoSave({
    delayMs: 500,
    getSnapshot: () => addedQuestions.value,
    onScheduled: () => {},
    onSave: () => saveAddedQuestions(addedQuestions.value),
  })

  useDebouncedAutoSave({
    delayMs: 500,
    getSnapshot: () => practiceRecords.value,
    onScheduled: () => {},
    onSave: () => savePracticeRecords(practiceRecords.value),
  })

  useDebouncedAutoSave({
    delayMs: 500,
    getSnapshot: () => aiAnswers.value,
    onScheduled: () => {},
    onSave: () => saveAiAnswers(aiAnswers.value),
  })

  function isQuestionReviewCandidate(questionId: string): boolean {
    const record = practiceRecords.value[questionId]
    if (!record) return false
    if (record.mastery === 'weak') return true
    return record.updatedAt !== null && record.mastery === 'practicing' && record.answer.trim() === ''
  }

  const filteredQuestions = computed(() => {
    const filters: QuestionFilterState = {
      searchQuery: searchQuery.value,
      activeChapterId: activeChapterId.value,
      difficulty: difficultyFilter.value,
      view: viewFilter.value,
      source: sourceFilter.value,
      mastery: masteryFilter.value,
      label: labelFilter.value,
      projectName: projectNameFilter.value,
      techStack: techStackFilter.value,
    }
    return applyQuestionFilters(questions.value, filters, {
      getPracticeRecord,
      isReviewCandidate: isQuestionReviewCandidate,
    })
  })

  const selectedQuestion = computed(() =>
    questions.value.find((q) => q.id === selectedQuestionId.value) ?? null
  )

  const activeChapter = computed(() =>
    chapters.value.find((c) => c.id === activeChapterId.value) ?? null
  )

  const questionCountByChapter = computed(() => {
    const map: Record<string, number> = {}
    for (const q of questions.value) {
      map[q.chapterId] = (map[q.chapterId] ?? 0) + 1
    }
    return map
  })

  const reviewQuestionCount = computed(
    () => questions.value.filter((item) => isQuestionReviewCandidate(item.id)).length,
  )

  const availableLabels = computed(() =>
    [...new Set(questions.value.flatMap((item) => item.labels))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
  )

  const availableProjectNames = computed(() =>
    [...new Set(questions.value.flatMap((item) => item.projectNames ?? []))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
  )

  const availableTechStacks = computed(() =>
    [...new Set(questions.value.flatMap((item) => item.techStacks ?? []))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
  )

  const selectedQuestionIndex = computed(() =>
    filteredQuestions.value.findIndex((item) => item.id === selectedQuestionId.value),
  )

  function selectQuestion(id: string) {
    selectedQuestionId.value = id
  }

  function selectNextQuestion() {
    if (filteredQuestions.value.length === 0) return
    if (!selectedQuestionId.value) {
      selectedQuestionId.value = filteredQuestions.value[0]?.id ?? null
      return
    }
    const currentIndex = selectedQuestionIndex.value
    if (currentIndex < 0) {
      selectedQuestionId.value = filteredQuestions.value[0]?.id ?? null
      return
    }
    const nextIndex = Math.min(currentIndex + 1, filteredQuestions.value.length - 1)
    selectedQuestionId.value = filteredQuestions.value[nextIndex]?.id ?? selectedQuestionId.value
  }

  function selectPreviousQuestion() {
    if (filteredQuestions.value.length === 0) return
    if (!selectedQuestionId.value) {
      selectedQuestionId.value = filteredQuestions.value[0]?.id ?? null
      return
    }
    const currentIndex = selectedQuestionIndex.value
    if (currentIndex < 0) {
      selectedQuestionId.value = filteredQuestions.value[0]?.id ?? null
      return
    }
    const prevIndex = Math.max(currentIndex - 1, 0)
    selectedQuestionId.value = filteredQuestions.value[prevIndex]?.id ?? selectedQuestionId.value
  }

  function selectChapter(id: string | null) {
    activeChapterId.value = id
    selectedQuestionId.value = null
  }

  function setSearchQuery(q: string) {
    searchQuery.value = q
  }

  function setDifficultyFilter(d: string | null) {
    difficultyFilter.value = d
  }

  function setViewFilter(view: QuestionViewFilter) {
    viewFilter.value = view
  }

  function setSourceFilter(source: QuestionSourceFilter) {
    sourceFilter.value = source
  }

  function setMasteryFilter(mastery: PracticeMasteryFilter) {
    masteryFilter.value = mastery
  }

  function setLabelFilter(label: string | null) {
    labelFilter.value = label
  }

  function setProjectNameFilter(projectName: string | null) {
    projectNameFilter.value = projectName
  }

  function setTechStackFilter(techStack: string | null) {
    techStackFilter.value = techStack
  }

  function clearAdvancedFilters() {
    difficultyFilter.value = null
    sourceFilter.value = 'all'
    masteryFilter.value = 'all'
    labelFilter.value = null
    projectNameFilter.value = null
    techStackFilter.value = null
  }

  function createAddedQuestion(question: QuestionDraft, stagedQuestions: Question[] = []): Question {
    const nextNumber =
      [...questions.value, ...stagedQuestions]
        .filter((item) => item.chapterId === question.chapterId)
        .reduce((max, item) => Math.max(max, item.number), 0) + 1

    return normalizeQuestion({
      ...question,
      id: createQuestionId(),
      number: nextNumber,
    }, question.source ?? 'manual')
  }

  function addQuestion(question: QuestionDraft) {
    const created = createAddedQuestion(question)
    addedQuestions.value.push(created)
    return created
  }

  function addQuestions(questionList: QuestionDraft[]) {
    const stagedQuestions: Question[] = []
    for (const question of questionList) {
      stagedQuestions.push(createAddedQuestion(question, stagedQuestions))
    }
    addedQuestions.value.push(...stagedQuestions)
    return stagedQuestions
  }

  function getPracticeRecord(questionId: string): PracticeRecord {
    return practiceRecords.value[questionId] ?? createEmptyPracticeRecord()
  }

  function getAiAnswerData(questionId: string): AiAnswerData | null {
    return aiAnswers.value[questionId] ?? null
  }

  function saveAiAnswerData(questionId: string, data: AiAnswerData) {
    aiAnswers.value = { ...aiAnswers.value, [questionId]: data }
  }

  function clearAiAnswerData(questionId: string) {
    const { [questionId]: _removed, ...rest } = aiAnswers.value
    aiAnswers.value = rest
  }

  function upsertPracticeRecord(questionId: string, updates: Partial<Omit<PracticeRecord, 'updatedAt'>>) {
    const current = getPracticeRecord(questionId)
    const nextMastery =
      updates.mastery
      ?? (current.mastery === 'unpracticed'
        && ((typeof updates.answer === 'string' && updates.answer.trim() !== '')
          || (typeof updates.notes === 'string' && updates.notes.trim() !== ''))
        ? 'practicing'
        : current.mastery)
    const next: PracticeRecord = {
      answer: updates.answer ?? current.answer,
      notes: updates.notes ?? current.notes,
      mastery: nextMastery,
      updatedAt: Date.now(),
      aiReview: updates.aiReview ?? current.aiReview,
    }

    if (
      !next.answer.trim()
      && !next.notes.trim()
      && next.mastery === 'unpracticed'
      && next.aiReview === null
    ) {
      const { [questionId]: _removed, ...rest } = practiceRecords.value
      practiceRecords.value = rest
      return
    }

    practiceRecords.value = {
      ...practiceRecords.value,
      [questionId]: next,
    }
  }

  function setPracticeMastery(questionId: string, mastery: PracticeMastery) {
    const current = getPracticeRecord(questionId)
    upsertPracticeRecord(questionId, {
      answer: current.answer,
      notes: current.notes,
      mastery,
      aiReview: current.aiReview,
    })
  }

  function batchSetPracticeMastery(questionIds: string[], mastery: PracticeMastery) {
    const uniqueIds = [...new Set(questionIds.map((item) => item.trim()).filter(Boolean))]
    for (const questionId of uniqueIds) {
      setPracticeMastery(questionId, mastery)
    }
  }

  function savePracticeAiReview(
    questionId: string,
    review: Omit<PracticeAiReview, 'updatedAt'>,
  ) {
    const current = getPracticeRecord(questionId)
    const normalizedReview: PracticeAiReview = {
      ...review,
      overallScore: clampScore(review.overallScore),
      completenessScore: clampScore(review.completenessScore),
      accuracyScore: clampScore(review.accuracyScore),
      depthScore: clampScore(review.depthScore),
      deliveryScore: clampScore(review.deliveryScore),
      strengths: review.strengths.map((item) => item.trim()).filter(Boolean),
      improvements: review.improvements.map((item) => item.trim()).filter(Boolean),
      summary: review.summary.trim(),
      improvedAnswer: review.improvedAnswer.trim(),
      updatedAt: Date.now(),
    }

    let inferredMastery = current.mastery
    if (normalizedReview.overallScore < 60) {
      inferredMastery = 'weak'
    } else if (normalizedReview.overallScore >= 85 && current.mastery !== 'weak') {
      inferredMastery = 'mastered'
    } else if (
      current.mastery === 'unpracticed'
      && (current.answer.trim() !== '' || current.notes.trim() !== '')
    ) {
      inferredMastery = 'practicing'
    }

    upsertPracticeRecord(questionId, {
      answer: current.answer,
      notes: current.notes,
      mastery: inferredMastery,
      aiReview: normalizedReview,
    })
  }

  async function ensureBundledQuestionsLoaded(
    loader: () => Promise<QuestionBankDataset> = loadBundledQuestionBankData,
  ) {
    if (isLoaded.value) return
    if (loadPromise) return loadPromise

    isLoading.value = true
    loadError.value = ''

    loadPromise = (async () => {
      try {
        const dataset = await loader()
        chapters.value = [...dataset.chapters]
        bundledQuestions.value = dataset.questions.map((item) => normalizeQuestion(item, 'bundled'))
        isLoaded.value = true
      } catch (error) {
        loadError.value = formatLoadError(error)
      } finally {
        isLoading.value = false
        loadPromise = null
      }
    })()

    return loadPromise
  }

  return {
    chapters,
    questions,
    bundledQuestions,
    addedQuestions,
    searchQuery,
    activeChapterId,
    difficultyFilter,
    viewFilter,
    sourceFilter,
    masteryFilter,
    labelFilter,
    projectNameFilter,
    techStackFilter,
    selectedQuestionId,
    isLoading,
    isLoaded,
    loadError,
    practiceRecords,
    aiAnswers,
    cloudSyncStatus,
    cloudSyncError,
    cloudLastSyncedAt,
    cloudConflict,
    filteredQuestions,
    selectedQuestionIndex,
    selectedQuestion,
    activeChapter,
    questionCountByChapter,
    reviewQuestionCount,
    availableLabels,
    availableProjectNames,
    availableTechStacks,
    selectQuestion,
    selectNextQuestion,
    selectPreviousQuestion,
    selectChapter,
    setSearchQuery,
    setDifficultyFilter,
    setViewFilter,
    setSourceFilter,
    setMasteryFilter,
    setLabelFilter,
    setProjectNameFilter,
    setTechStackFilter,
    clearAdvancedFilters,
    addQuestion,
    addQuestions,
    getPracticeRecord,
    upsertPracticeRecord,
    setPracticeMastery,
    batchSetPracticeMastery,
    savePracticeAiReview,
    isQuestionReviewCandidate,
    getAiAnswerData,
    saveAiAnswerData,
    clearAiAnswerData,
    ensureBundledQuestionsLoaded,
    pushToCloud: cloudManager.pushToCloud,
    pullFromCloud: cloudManager.pullFromCloud,
    resolveConflictWithCloud: cloudManager.resolveConflictWithCloud,
    resolveConflictWithLocal: cloudManager.resolveConflictWithLocal,
    getCloudData,
  }
})
