import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface TechInterviewQuestion {
  q: string
  f: number
  c: string[]
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

export type SortBy = 'frequency' | 'default'

export const useTechInterviewQuestionsStore = defineStore('techInterviewQuestions', () => {
  // 数据
  const questionsByCategory = ref<Record<string, TechInterviewQuestion[]>>({})
  const categories = ref<TechCategory[]>([])
  const companies = ref<string[]>([])
  const isLoading = ref(false)
  const isLoaded = ref(false)
  const loadError = ref('')

  // 筛选状态
  const activeCategoryId = ref<string | null>(null)
  const selectedCompanies = ref<string[]>([])
  const searchQuery = ref('')
  const sortBy = ref<SortBy>('frequency')

  // 选中题目
  const selectedQuestionId = ref<string | null>(null)
  const selectedQuestion = ref<TechInterviewQuestion | null>(null)

  // 所有题目（平铺）
  const allQuestions = computed<TechInterviewQuestion[]>(() => {
    return Object.values(questionsByCategory.value).flat()
  })

  // 筛选后的题目
  const filteredQuestions = computed<TechInterviewQuestion[]>(() => {
    let result: TechInterviewQuestion[]

    // 1. 按分类筛选
    if (activeCategoryId.value) {
      result = questionsByCategory.value[activeCategoryId.value] ?? []
    } else {
      result = allQuestions.value
    }

    // 2. 按公司筛选（OR 逻辑）
    if (selectedCompanies.value.length > 0) {
      result = result.filter((q) =>
        selectedCompanies.value.some((company) => q.c.includes(company)),
      )
    }

    // 3. 按搜索词筛选
    if (searchQuery.value.trim()) {
      const query = searchQuery.value.toLowerCase()
      result = result.filter(
        (q) =>
          q.q.toLowerCase().includes(query)
          || q.c.some((c) => c.toLowerCase().includes(query)),
      )
    }

    // 4. 排序
    if (sortBy.value === 'frequency') {
      result = [...result].sort((a, b) => b.f - a.f)
    }

    return result
  })

  // 当前分类下的公司列表（用于筛选面板）
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

  // 加载数据
  let loadPromise: Promise<void> | null = null

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

  // Actions
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

  function selectQuestion(question: TechInterviewQuestion, id: string) {
    selectedQuestionId.value = id
    selectedQuestion.value = question
  }

  function clearFilters() {
    activeCategoryId.value = null
    selectedCompanies.value = []
    searchQuery.value = ''
    sortBy.value = 'frequency'
  }

  // 选中下一个/上一个
  function selectNextQuestion() {
    const list = filteredQuestions.value
    if (list.length === 0) return
    if (!selectedQuestion.value) {
      const first = list[0]!
      selectQuestion(first, '0')
      return
    }
    const currentIdx = list.indexOf(selectedQuestion.value)
    if (currentIdx < 0 || currentIdx >= list.length - 1) return
    const nextIdx = currentIdx + 1
    const next = list[nextIdx]!
    selectQuestion(next, String(nextIdx))
  }

  function selectPrevQuestion() {
    const list = filteredQuestions.value
    if (list.length === 0) return
    if (!selectedQuestion.value) {
      const first = list[0]!
      selectQuestion(first, '0')
      return
    }
    const currentIdx = list.indexOf(selectedQuestion.value)
    if (currentIdx <= 0) return
    const prevIdx = currentIdx - 1
    const prev = list[prevIdx]!
    selectQuestion(prev, String(prevIdx))
  }

  return {
    // State
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

    // Computed
    allQuestions,
    filteredQuestions,
    availableCompaniesInCategory,

    // Actions
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
  }
})
