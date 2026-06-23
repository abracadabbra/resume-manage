import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { loadJson, saveJson } from '@/services/safeStorage'
import type { ChatMessage } from '@/services/aiClient'
import aiAnswersFile from '@/data/ai-answers.json'

export interface TechInterviewQuestion {
  id: string
  q: string
  f: number
  c: string[]
  techField?: string
  noteId?: string
  noteTitle?: string
  link?: string
  position?: string
  round?: string
  publishedAt?: string
}

export interface TechCategory {
  id: string
  name: string
  count: number
}

interface TechInterviewData {
  companies: string[]
  categories: TechCategory[]
  questions: Record<string, TechInterviewQuestion[]>
}

export interface AiAnswerData {
  answer: string
  conversations: ChatMessage[]
  updatedAt: number
}

export type SortBy = 'frequency' | 'default'

const TECH_INTERVIEW_AI_ANSWERS_KEY = 'tech-interview-ai-answers'
const TECH_INTERVIEW_SCHEMA_VERSION = 2

interface AiAnswersStorageData {
  schemaVersion: number
  answers: Record<string, AiAnswerData>
}

function normalizeAiAnswerData(input: unknown): AiAnswerData {
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

function normalizeAiAnswers(input: unknown): Record<string, AiAnswerData> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const record = input as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(record).map(([k, v]) => [k, normalizeAiAnswerData(v)]),
  )
}

export const useTechInterviewQuestionsStore = defineStore('techInterviewQuestions', () => {
  const questionsByCategory = ref<Record<string, TechInterviewQuestion[]>>({})
  const categories = ref<TechCategory[]>([])
  const companies = ref<string[]>([])
  const isLoading = ref(false)
  const isLoaded = ref(false)
  const loadError = ref('')

  const activeCategoryId = ref<string | null>(null)
  const selectedCompanies = ref<string[]>([])
  const searchQuery = ref('')
  const sortBy = ref<SortBy>('frequency')

  const selectedQuestionId = ref<string | null>(null)
  const selectedQuestion = ref<TechInterviewQuestion | null>(null)

  const aiAnswers = ref<Record<string, AiAnswerData>>(loadAiAnswers())

  const allQuestions = computed<TechInterviewQuestion[]>(() => {
    return Object.values(questionsByCategory.value).flat()
  })

  const filteredQuestions = computed<TechInterviewQuestion[]>(() => {
    let result: TechInterviewQuestion[]

    if (activeCategoryId.value) {
      result = questionsByCategory.value[activeCategoryId.value] ?? []
    } else {
      result = allQuestions.value
    }

    if (selectedCompanies.value.length > 0) {
      result = result.filter((q) =>
        selectedCompanies.value.some((company) => q.c.includes(company)),
      )
    }

    if (searchQuery.value.trim()) {
      const query = searchQuery.value.toLowerCase()
      result = result.filter(
        (q) =>
          q.q.toLowerCase().includes(query)
          || q.c.some((c) => c.toLowerCase().includes(query)),
      )
    }

    if (sortBy.value === 'frequency') {
      result = [...result].sort((a, b) => b.f - a.f)
    }

    return result
  })

  const availableCompaniesInCategory = computed(() => {
    const companyCount: Record<string, number> = {}
    const source = activeCategoryId.value
      ? questionsByCategory.value[activeCategoryId.value] ?? []
      : allQuestions.value

    for (const q of source) {
      for (const c of q.c) {
        companyCount[c] = (companyCount[c] ?? 0) + 1
      }
    }

    return Object.entries(companyCount)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }))
  })

  let loadPromise: Promise<void> | null = null

  function loadAiAnswers(): Record<string, AiAnswerData> {
    const value = loadJson<AiAnswersStorageData | Record<string, AiAnswerData>>(
      localStorage,
      TECH_INTERVIEW_AI_ANSWERS_KEY,
      {},
    ).value
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    if ('answers' in value && 'schemaVersion' in value) {
      return normalizeAiAnswers((value as AiAnswersStorageData).answers)
    }
    return normalizeAiAnswers(value)
  }

  function saveAiAnswers(answers: Record<string, AiAnswerData>) {
    saveJson(localStorage, TECH_INTERVIEW_AI_ANSWERS_KEY, {
      schemaVersion: TECH_INTERVIEW_SCHEMA_VERSION,
      answers,
    } satisfies AiAnswersStorageData)
  }

  function loadAiAnswersFromFile(): Record<string, AiAnswerData> {
    return normalizeAiAnswers(aiAnswersFile)
  }

  async function ensureLoaded() {
    if (isLoaded.value) return
    if (loadPromise) return loadPromise

    isLoading.value = true
    loadError.value = ''

    loadPromise = (async () => {
      try {
        const module = await import('@/data/tech-interview-questions.json')
        const data = module.default as TechInterviewData
        questionsByCategory.value = data.questions
        categories.value = data.categories
        companies.value = data.companies

        const fileAnswers = loadAiAnswersFromFile()
        for (const [k, v] of Object.entries(fileAnswers)) {
          if (!aiAnswers.value[k]) {
            aiAnswers.value[k] = v
          }
        }

        isLoaded.value = true
      } catch (error) {
        loadError.value = error instanceof Error ? error.message : '题库加载失败'
      } finally {
        isLoading.value = false
        loadPromise = null
      }
    })()

    return loadPromise
  }

  let aiAnswersSaveTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    aiAnswers,
    () => {
      if (aiAnswersSaveTimer) clearTimeout(aiAnswersSaveTimer)
      aiAnswersSaveTimer = setTimeout(() => {
        saveAiAnswers(aiAnswers.value)
      }, 500)
    },
    { deep: true },
  )

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

  function selectCategory(id: string | null) {
    activeCategoryId.value = id
    selectedQuestionId.value = null
    selectedQuestion.value = null
  }

  function toggleCompany(company: string) {
    const idx = selectedCompanies.value.indexOf(company)
    if (idx >= 0) {
      selectedCompanies.value.splice(idx, 1)
    } else {
      selectedCompanies.value.push(company)
    }
  }

  function clearCompanyFilter() {
    selectedCompanies.value = []
  }

  function setSearchQuery(q: string) {
    searchQuery.value = q
  }

  function setSortBy(sort: SortBy) {
    sortBy.value = sort
  }

  function selectQuestion(question: TechInterviewQuestion) {
    selectedQuestionId.value = question.id
    selectedQuestion.value = question
  }

  function clearFilters() {
    activeCategoryId.value = null
    selectedCompanies.value = []
    searchQuery.value = ''
    sortBy.value = 'frequency'
  }

  function selectNextQuestion() {
    const list = filteredQuestions.value
    if (list.length === 0) return
    if (!selectedQuestion.value) {
      selectQuestion(list[0]!)
      return
    }
    const currentIdx = list.findIndex((q) => q.id === selectedQuestion.value?.id)
    if (currentIdx < 0 || currentIdx >= list.length - 1) return
    selectQuestion(list[currentIdx + 1]!)
  }

  function selectPrevQuestion() {
    const list = filteredQuestions.value
    if (list.length === 0) return
    if (!selectedQuestion.value) {
      selectQuestion(list[0]!)
      return
    }
    const currentIdx = list.findIndex((q) => q.id === selectedQuestion.value?.id)
    if (currentIdx <= 0) return
    selectQuestion(list[currentIdx - 1]!)
  }

  return {
    questionsByCategory,
    categories,
    companies,
    isLoading,
    isLoaded,
    loadError,
    activeCategoryId,
    selectedCompanies,
    searchQuery,
    sortBy,
    selectedQuestionId,
    selectedQuestion,
    aiAnswers,
    allQuestions,
    filteredQuestions,
    availableCompaniesInCategory,
    ensureLoaded,
    selectCategory,
    toggleCompany,
    clearCompanyFilter,
    setSearchQuery,
    setSortBy,
    selectQuestion,
    clearFilters,
    selectNextQuestion,
    selectPrevQuestion,
    getAiAnswerData,
    saveAiAnswerData,
    clearAiAnswerData,
  }
})