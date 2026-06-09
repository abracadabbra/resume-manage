import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import {
  buildQuestionSearchText,
  extractTechStacksFromText,
  normalizeStringList,
} from '@/services/questionMetaService'
import {
  getQuestionBankState,
  upsertQuestionBankState,
} from '@/services/supabase'
import { loadJson, saveJson } from '@/services/safeStorage'
import {
  createQuestionBankCloudManager,
  type QuestionBankCloudData,
} from './questionBankCloud'
import type { SyncConflict } from './syncConflict'

export interface Question {
  id: string
  chapterId: string
  number: number
  title: string
  difficulty: 'basic' | 'intermediate' | 'advanced'
  labels: string[]
  source?: QuestionSource
  projectNames?: string[]
  techStacks?: string[]
  answer: {
    content: string
    followUp: { question: string; answer: string }[]
  }
}

export type QuestionDraft = Omit<Question, 'id' | 'number'>
export type QuestionSource = 'bundled' | 'manual' | 'resume-generated' | 'project-generated' | 'interview-review'
export type QuestionViewFilter = 'all' | 'resume-generated' | 'review'
export type PracticeMastery = 'unpracticed' | 'practicing' | 'mastered' | 'weak'
export type QuestionSourceFilter = 'all' | QuestionSource
export type PracticeMasteryFilter = 'all' | PracticeMastery

export interface PracticeAiReview {
  overallScore: number
  completenessScore: number
  accuracyScore: number
  depthScore: number
  deliveryScore: number
  summary: string
  strengths: string[]
  improvements: string[]
  improvedAnswer: string
  updatedAt: number | null
}

export interface PracticeRecord {
  answer: string
  notes: string
  mastery: PracticeMastery
  updatedAt: number | null
  aiReview: PracticeAiReview | null
}

export interface Chapter {
  id: string
  name: string
  shortName: string
  order: number
  questionCount: number
}

interface QuestionBankDataset {
  chapters: Chapter[]
  questions: Question[]
}

const STORAGE_KEY = 'question-bank-added-questions'
const PRACTICE_STORAGE_KEY = 'question-bank-practice-records'
const QUESTION_BANK_LOCAL_SCHEMA_VERSION = 1
const AI_GENERATED_SOURCES: QuestionSource[] = ['resume-generated', 'project-generated', 'interview-review']

interface AddedQuestionsStorageData {
  schemaVersion: typeof QUESTION_BANK_LOCAL_SCHEMA_VERSION
  questions: Question[]
}

interface PracticeRecordsStorageData {
  schemaVersion: typeof QUESTION_BANK_LOCAL_SCHEMA_VERSION
  records: Record<string, PracticeRecord>
}

function clampScore(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function inferQuestionSource(labels: string[] = [], fallback: QuestionSource = 'manual'): QuestionSource {
  return labels.includes('简历定制') ? 'resume-generated' : fallback
}

function createEmptyPracticeRecord(): PracticeRecord {
  return {
    answer: '',
    notes: '',
    mastery: 'unpracticed',
    updatedAt: null,
    aiReview: null,
  }
}

function normalizeAiReview(input: unknown): PracticeAiReview | null {
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

function normalizePracticeRecord(input: unknown): PracticeRecord {
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

function normalizePracticeRecords(input: unknown): Record<string, PracticeRecord> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}

  return Object.fromEntries(
    Object.entries(input).map(([questionId, record]) => [
      questionId,
      normalizePracticeRecord(record),
    ]),
  )
}

function normalizeQuestion(input: Question, fallbackSource: QuestionSource): Question {
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

function loadAddedQuestions(): Question[] {
  const value = loadJson<AddedQuestionsStorageData | Question[]>(localStorage, STORAGE_KEY, []).value
  const questions = Array.isArray(value) ? value : Array.isArray(value.questions) ? value.questions : []
  return questions.map((item) => normalizeQuestion(item, 'manual'))
}

function saveAddedQuestions(questions: Question[]) {
  saveJson(localStorage, STORAGE_KEY, {
    schemaVersion: QUESTION_BANK_LOCAL_SCHEMA_VERSION,
    questions,
  } satisfies AddedQuestionsStorageData)
}

function loadPracticeRecords(): Record<string, PracticeRecord> {
  const value = loadJson<PracticeRecordsStorageData | Record<string, PracticeRecord>>(
    localStorage,
    PRACTICE_STORAGE_KEY,
    {},
  ).value
  const records =
    value && typeof value === 'object' && !Array.isArray(value) && 'records' in value
      ? value.records
      : value
  return normalizePracticeRecords(records)
}

function savePracticeRecords(records: Record<string, PracticeRecord>) {
  saveJson(localStorage, PRACTICE_STORAGE_KEY, {
    schemaVersion: QUESTION_BANK_LOCAL_SCHEMA_VERSION,
    records,
  } satisfies PracticeRecordsStorageData)
}

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

function clonePracticeRecords(records: Record<string, PracticeRecord>): Record<string, PracticeRecord> {
  return Object.fromEntries(
    Object.entries(records).map(([questionId, record]) => [
      questionId,
      {
        ...record,
        aiReview: record.aiReview
          ? {
              ...record.aiReview,
              strengths: [...record.aiReview.strengths],
              improvements: [...record.aiReview.improvements],
            }
          : null,
      },
    ]),
  )
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

function normalizeCloudAddedQuestions(input: unknown): Question[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((item): item is Question => Boolean(item && typeof item === 'object'))
    .map((item) => normalizeQuestion(item, item.source ?? 'manual'))
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
    saveAddedQuestions(addedQuestions.value)
    savePracticeRecords(practiceRecords.value)
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

  // Debounced auto-save
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    addedQuestions,
    () => {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        saveAddedQuestions(addedQuestions.value)
      }, 500)
    },
    { deep: true },
  )

  let practiceSaveTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    practiceRecords,
    () => {
      if (practiceSaveTimer) clearTimeout(practiceSaveTimer)
      practiceSaveTimer = setTimeout(() => {
        savePracticeRecords(practiceRecords.value)
      }, 500)
    },
    { deep: true },
  )

  function isQuestionReviewCandidate(questionId: string): boolean {
    const record = practiceRecords.value[questionId]
    if (!record) return false
    if (record.mastery === 'weak') return true
    return record.updatedAt !== null && record.mastery === 'practicing' && record.answer.trim() === ''
  }

  const filteredQuestions = computed(() => {
    let result = questions.value

    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
      result = result.filter(
        (item) => buildQuestionSearchText(item).toLowerCase().includes(q),
      )
    }

    if (activeChapterId.value) {
      result = result.filter((item) => item.chapterId === activeChapterId.value)
    }

    if (difficultyFilter.value) {
      result = result.filter((item) => item.difficulty === difficultyFilter.value)
    }

    if (sourceFilter.value !== 'all') {
      result = result.filter((item) => item.source === sourceFilter.value)
    }

    if (masteryFilter.value !== 'all') {
      result = result.filter((item) => getPracticeRecord(item.id).mastery === masteryFilter.value)
    }

    if (labelFilter.value) {
      result = result.filter((item) => item.labels.includes(labelFilter.value!))
    }

    if (projectNameFilter.value) {
      result = result.filter((item) => item.projectNames?.includes(projectNameFilter.value!) ?? false)
    }

    if (techStackFilter.value) {
      result = result.filter((item) => item.techStacks?.includes(techStackFilter.value!) ?? false)
    }

    if (viewFilter.value === 'resume-generated') {
      result = result.filter(
        (item) => AI_GENERATED_SOURCES.includes(item.source ?? inferQuestionSource(item.labels, 'manual')) || item.labels.includes('简历定制'),
      )
    }

    if (viewFilter.value === 'review') {
      result = result.filter((item) => isQuestionReviewCandidate(item.id))
    }

    return result
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
    ensureBundledQuestionsLoaded,
    pushToCloud: cloudManager.pushToCloud,
    pullFromCloud: cloudManager.pullFromCloud,
    resolveConflictWithCloud: cloudManager.resolveConflictWithCloud,
    resolveConflictWithLocal: cloudManager.resolveConflictWithLocal,
    getCloudData,
  }
})
