import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { loadJson, saveJson } from '@/services/safeStorage'
import type { ChatMessage } from '@/services/aiClient'
import { useTechInterviewCloud, type CloudStoreAdapter } from './techInterviewCloud'
import { useTechInterviewSyncState } from './techInterviewSyncState'
import { fetchQuestionsAll, fetchAiAnswerByQid, deleteConversations } from '@/services/techInterviewSupabaseApi'
import { normalizeTechField, TECH_FIELD_CATEGORIES } from '@/services/techFieldCategory'
import {
  getCachedAiAnswer,
  setCachedAiAnswer,
} from '@/services/techInterviewAiAnswerCache'
import { useAuthStore } from './auth'

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

export type PracticeMastery = 'unpracticed' | 'practicing' | 'mastered' | 'weak'

export interface PracticeRecord {
  mastery: PracticeMastery
  answer: string
  notes: string
  updatedAt: number | null
}

export type SortBy = 'frequency' | 'default'

const TECH_INTERVIEW_PRACTICE_KEY = 'tech-interview-practice-records'

const TECH_INTERVIEW_AI_ANSWERS_KEY = 'tech-interview-ai-answers'
const TECH_INTERVIEW_AI_CONVERSATIONS_KEY = 'tech-interview-ai-conversations'
const TECH_INTERVIEW_SCHEMA_VERSION = 2

/** v3：AI 公共答案（仅 answer + updatedAt） */
export interface AiAnswer {
  answer: string
  updatedAt: number
}

/** v3 兼容：旧版 AiAnswerData（answer + conversations）— UI 改完前先保留 */
export interface AiAnswerData {
  answer: string
  conversations: ChatMessage[]
  updatedAt: number
}

export interface AiConversations {
  conversations: ChatMessage[]
  updatedAt: number
}

interface AiAnswersStorageData {
  schemaVersion: number
  answers: Record<string, AiAnswerData>
}

interface AiConversationsStorageData {
  schemaVersion: number
  conversations: Record<string, AiConversations>
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

function normalizeConversations(input: unknown): AiConversations {
  if (!input || typeof input !== 'object') {
    return { conversations: [], updatedAt: 0 }
  }
  const data = input as Partial<AiConversations>
  return {
    conversations: Array.isArray(data.conversations) ? data.conversations : [],
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
  }
}

function normalizeConversationsMap(input: unknown): Record<string, AiConversations> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const record = input as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(record).map(([k, v]) => [k, normalizeConversations(v)]),
  )
}

function loadPracticeRecords(): Record<string, PracticeRecord> {
  const value = loadJson<Record<string, PracticeRecord>>(localStorage, TECH_INTERVIEW_PRACTICE_KEY, {}).value
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, normalizePracticeRecord(v)]),
  )
}

function savePracticeRecords(records: Record<string, PracticeRecord>) {
  saveJson(localStorage, TECH_INTERVIEW_PRACTICE_KEY, records)
}

function normalizePracticeRecord(input: unknown): PracticeRecord {
  if (!input || typeof input !== 'object') {
    return { mastery: 'unpracticed', answer: '', notes: '', updatedAt: null }
  }
  const r = input as Partial<PracticeRecord>
  const validMasteries = ['unpracticed', 'practicing', 'mastered', 'weak']
  return {
    mastery: validMasteries.includes(r.mastery ?? '') ? r.mastery as PracticeMastery : 'unpracticed',
    answer: String(r.answer ?? ''),
    notes: String(r.notes ?? ''),
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : null,
  }
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

  /** 虚拟分类标识：薄弱题库 */
  const WEAK_CATEGORY_ID = '__weak__'

  /** 搜索防抖：避免打字时频繁重算大列表 */
  const searchQueryDebounced = ref('')
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
  watch(searchQuery, (val) => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
    searchDebounceTimer = setTimeout(() => {
      searchQueryDebounced.value = val
    }, 150)
  })

  const selectedQuestionId = ref<string | null>(null)
  const selectedQuestion = ref<TechInterviewQuestion | null>(null)

  const aiAnswers = ref<Record<string, AiAnswerData>>(loadAiAnswers())
  /** 缓存的 AI 答案题目 ID，上限 300 防无限增长 */
  const aiAnswersLoaded = ref<Set<string>>(new Set())
  const MAX_AI_LOADED = 300

  const aiConversations = ref<Record<string, AiConversations>>(loadAiConversations())
  const practiceRecords = ref<Record<string, PracticeRecord>>(loadPracticeRecords())

  const allQuestions = computed<TechInterviewQuestion[]>(() => {
    return Object.values(questionsByCategory.value).flat()
  })

  /** 薄弱题库：高频 + 未熟练/薄弱（按 mention_count 倒序） */
  const weakQuestions = computed<TechInterviewQuestion[]>(() => {
    const filtered = allQuestions.value.filter((q) => {
      if (q.f < 3) return false
      const mastery = practiceRecords.value[q.id]?.mastery ?? 'unpracticed'
      return mastery === 'unpracticed' || mastery === 'weak'
    })
    // spread+sort 兼容当前 TS lib 配置，V8 in-place stable sort 开销可控
    return [...filtered].sort((a, b) => b.f - a.f)
  })

  const filteredQuestions = computed<TechInterviewQuestion[]>(() => {
    let result: TechInterviewQuestion[]

    if (activeCategoryId.value === WEAK_CATEGORY_ID) {
      result = weakQuestions.value
    } else if (activeCategoryId.value) {
      result = questionsByCategory.value[activeCategoryId.value] ?? []
    } else {
      result = allQuestions.value
    }

    if (selectedCompanies.value.length > 0) {
      result = result.filter((q) =>
        selectedCompanies.value.some((company) => q.c.includes(company)),
      )
    }

    if (searchQueryDebounced.value.trim()) {
      const query = searchQueryDebounced.value.toLowerCase()
      result = result.filter(
        (q) =>
          q.q.toLowerCase().includes(query)
          || q.c.some((c) => c.toLowerCase().includes(query)),
      )
    }

    if (sortBy.value === 'frequency') {
      // 标准 [...].sort 在 V8 中是 in-place stable sort，开销可控；这里保留 spread 以避免 TS lib 升级
      result = [...result].sort((a, b) => b.f - a.f)
    }

    return result
  })

  /** 过滤列表的 id 数组（用于 O(1) 跳转） */
  const filteredIdList = computed(() => filteredQuestions.value.map(q => q.id))

  const availableCompaniesInCategory = computed(() => {
    const companyCount: Record<string, number> = {}
    const source = activeCategoryId.value
      ? activeCategoryId.value === '__weak__'
        ? weakQuestions.value
        : questionsByCategory.value[activeCategoryId.value] ?? []
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

  function loadAiConversations(): Record<string, AiConversations> {
    const value = loadJson<AiConversationsStorageData | Record<string, AiConversations>>(
      localStorage,
      TECH_INTERVIEW_AI_CONVERSATIONS_KEY,
      {},
    ).value
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    if ('conversations' in value && 'schemaVersion' in value) {
      return normalizeConversationsMap((value as AiConversationsStorageData).conversations)
    }
    return normalizeConversationsMap(value)
  }

  function saveAiConversations(conversations: Record<string, AiConversations>) {
    saveJson(localStorage, TECH_INTERVIEW_AI_CONVERSATIONS_KEY, {
      schemaVersion: TECH_INTERVIEW_SCHEMA_VERSION,
      conversations,
    } satisfies AiConversationsStorageData)
  }

  async function ensureLoaded() {
    if (isLoaded.value) return
    if (loadPromise) return loadPromise

    isLoading.value = true
    loadError.value = ''

    loadPromise = (async () => {
      try {
        // 优先从 Supabase 拉全量题目
        const rows = await fetchQuestionsAll()

        // 按 tech_field 分组，提取 companies 列表
        const byCategory: Record<string, TechInterviewQuestion[]> = {}
        const categorySet = new Map<string, number>()
        const companySet = new Set<string>()

        for (const row of rows) {
          const q: TechInterviewQuestion = {
            id: row.id,
            q: row.question_text,
            f: row.mention_count,
            c: row.companies ?? [],
            techField: row.tech_field ?? undefined,
            noteId: row.note_id ?? undefined,
            noteTitle: row.note_title ?? undefined,
            link: row.link ?? undefined,
            position: row.position ?? undefined,
            round: row.round ?? undefined,
            publishedAt: row.published_at ?? undefined,
          }

          const cat = normalizeTechField(row.tech_field)
          if (!byCategory[cat]) byCategory[cat] = []
          byCategory[cat].push(q)

          categorySet.set(cat, (categorySet.get(cat) ?? 0) + 1)
          for (const co of row.companies ?? []) companySet.add(co)
        }

        questionsByCategory.value = byCategory
        categories.value = Array.from(categorySet)
          // 按 17 个大类的 UI 顺序排，未在白名单的兜底类排最后
          .sort(([a], [b]) => {
            const order = (n: string) => {
              const idx = TECH_FIELD_CATEGORIES.indexOf(n as never)
              return idx === -1 ? TECH_FIELD_CATEGORIES.length : idx
            }
            return order(a) - order(b)
          })
          .map(([name, count]) => ({ id: name, name, count }))
        companies.value = Array.from(companySet).sort()

        isLoaded.value = true
      } catch {
        // Fallback: 从本地 JSON 加载（Supabase 未配置或离线时）
        try {
          const module = await import('@/data/tech-interview-questions.json')
          const data = module.default as TechInterviewData
          questionsByCategory.value = data.questions
          categories.value = data.categories
          companies.value = data.companies
          isLoaded.value = true
        } catch {
          loadError.value = '题库加载失败'
        }
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

  let practiceSaveTimer: ReturnType<typeof setTimeout> | null = null

  /** 切分类别时清空已加载标记，避免内存泄漏 */
  watch(activeCategoryId, () => {
    aiAnswersLoaded.value = new Set()
  })
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

  let aiConversationsSaveTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    aiConversations,
    () => {
      if (aiConversationsSaveTimer) clearTimeout(aiConversationsSaveTimer)
      aiConversationsSaveTimer = setTimeout(() => {
        saveAiConversations(aiConversations.value)
      }, 500)
    },
    { deep: true },
  )

  // ---------- Cloud 注入 ----------

  const syncState = useTechInterviewSyncState()

  const adapter: CloudStoreAdapter = {
    userId: () => currentUserId.value,
    getPractice: (qid) => {
      const r = practiceRecords.value[qid]
      if (!r) return null
      return { mastery: r.mastery, answer: r.answer, notes: r.notes, updatedAt: r.updatedAt }
    },
    setPractice: (qid, snap) => {
      practiceRecords.value = {
        ...practiceRecords.value,
        [qid]: {
          mastery: snap.mastery,
          answer: snap.answer,
          notes: snap.notes,
          updatedAt: snap.updatedAt,
        },
      }
    },
    getConversation: (qid) => {
      const c = aiConversations.value[qid]
      if (!c) return null
      return { conversations: c.conversations, updatedAt: c.updatedAt }
    },
    setConversation: (qid, snap) => {
      const updatedAt = snap.updatedAt ?? Date.now()
      aiConversations.value = {
        ...aiConversations.value,
        [qid]: { conversations: snap.conversations as ChatMessage[], updatedAt },
      }
    },
    setAiAnswer: (qid, _answer, updatedAt) => {
      const existing = aiAnswers.value[qid]
      if (!existing) return
      aiAnswers.value = {
        ...aiAnswers.value,
        [qid]: { ...existing, updatedAt },
      }
    },
  }

  const cloud = useTechInterviewCloud(adapter)

  // ---------- Auth 联动 ----------

  /** 当前登录用户 ID（由 Auth 注入；未登录时为 null） */
  const currentUserId = ref<string | null>(null)
  function setCurrentUserId(userId: string | null) {
    currentUserId.value = userId
  }

  /**
   * 跨 store 监听 Auth 状态变化：
   * - 登录 → 同步 userId + 若已启用云同步则后台 pull
   * - 登出 → 清空 userId（保留本地 store 数据，不删除）
   */
  const authStore = useAuthStore()
  watch(
    () => authStore.userId,
    (id, prevId) => {
      currentUserId.value = id
      if (id && id !== prevId && syncState.state.value.enabled) {
        void cloud.pull()
      }
    },
    { immediate: true },
  )

  function getPracticeRecord(questionId: string): PracticeRecord {
    return practiceRecords.value[questionId] ?? { mastery: 'unpracticed', answer: '', notes: '', updatedAt: null }
  }

  function setPracticeMastery(questionId: string, mastery: PracticeMastery) {
    const current = getPracticeRecord(questionId)
    practiceRecords.value = {
      ...practiceRecords.value,
      [questionId]: { ...current, mastery, updatedAt: Date.now() },
    }
    cloud.schedulePush(questionId, 'practice')
  }

  function setPracticeAnswer(questionId: string, answer: string) {
    const current = getPracticeRecord(questionId)
    practiceRecords.value = {
      ...practiceRecords.value,
      [questionId]: { ...current, answer, updatedAt: Date.now() },
    }
    cloud.schedulePush(questionId, 'practice')
  }

  function setPracticeNotes(questionId: string, notes: string) {
    const current = getPracticeRecord(questionId)
    practiceRecords.value = {
      ...practiceRecords.value,
      [questionId]: { ...current, notes, updatedAt: Date.now() },
    }
    cloud.schedulePush(questionId, 'practice')
  }

  function getConversations(questionId: string): AiConversations | null {
    return aiConversations.value[questionId] ?? null
  }

  function addConversationMessage(questionId: string, message: ChatMessage) {
    const current = aiConversations.value[questionId] ?? { conversations: [], updatedAt: 0 }
    aiConversations.value = {
      ...aiConversations.value,
      [questionId]: {
        conversations: [...current.conversations, message],
        updatedAt: Date.now(),
      },
    }
    cloud.schedulePush(questionId, 'conversation')
  }

  function clearConversations(questionId: string) {
    const { [questionId]: _removed, ...rest } = aiConversations.value
    aiConversations.value = rest
    // 取消待推送队列，防止删除后又被推上云
    syncState.unschedulePush(questionId, 'conversation')
    // 异步从云端删除（不阻塞 UI）
    const uid = currentUserId.value
    if (uid) void deleteConversations(questionId, uid)
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

  function setSelectedCompanies(companies: string[]) {
    selectedCompanies.value = [...companies]
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
    loadAiAnswerIfNeeded(question.id)
  }

  /** 懒加载：先查 IDB 命中直接落内存；未命中才走网络，并回写 IDB */
  async function loadAiAnswerIfNeeded(questionId: string) {
    if (aiAnswersLoaded.value.has(questionId)) return
    // Bounded cache：Set 超过上限时淘汰最早的（Set 保留插入顺序）
    if (aiAnswersLoaded.value.size >= MAX_AI_LOADED) {
      const iter = aiAnswersLoaded.value.values()
      for (let i = 0; i < MAX_AI_LOADED / 2; i++) {
        const { value, done } = iter.next()
        if (done) break
        aiAnswersLoaded.value.delete(value!)
      }
    }
    aiAnswersLoaded.value.add(questionId)

    const existing = aiAnswers.value[questionId]
    if (existing?.answer) return // 已有 answer（本地编辑过）

    // 1) 先看 IndexedDB 缓存
    try {
      const cached = await getCachedAiAnswer(questionId)
      if (cached) {
        aiAnswers.value = {
          ...aiAnswers.value,
          [questionId]: { answer: cached, conversations: [], updatedAt: Date.now() },
        }
        return
      }
    } catch {
      console.warn('[TechQuestions] IDB 读缓存失败', questionId)
      // 继续走网络
    }

    // 2) 网络拉取 + 回写 IDB
    try {
      const answer = await fetchAiAnswerByQid(questionId)
      if (answer) {
        aiAnswers.value = {
          ...aiAnswers.value,
          [questionId]: { answer, conversations: [], updatedAt: Date.now() },
        }
        // 异步回写，不阻塞 UI
        void setCachedAiAnswer(questionId, answer)
      }
    } catch {
      console.warn('[TechQuestions] 网络拉取 AI 答案失败', questionId)
      // 静默失败，不阻塞用户
    }
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
    const idMap = new Map(filteredIdList.value.map((id, i) => [id, i]))
    const currentIdx = idMap.get(selectedQuestion.value.id) ?? -1
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
    const idMap = new Map(filteredIdList.value.map((id, i) => [id, i]))
    const currentIdx = idMap.get(selectedQuestion.value.id) ?? -1
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
    searchQueryDebounced,
    selectedQuestionId,
    selectedQuestion,
    aiAnswers,
    aiConversations,
    practiceRecords,
    allQuestions,
    filteredQuestions,
    filteredIdList,
    availableCompaniesInCategory,
    weakQuestions,
    ensureLoaded,
    selectCategory,
    toggleCompany,
    clearCompanyFilter,
    setSelectedCompanies,
    setSearchQuery,
    setSortBy,
    selectQuestion,
    clearFilters,
    selectNextQuestion,
    selectPrevQuestion,
    getAiAnswerData,
    saveAiAnswerData,
    clearAiAnswerData,
    loadAiAnswerIfNeeded,
    getConversations,
    addConversationMessage,
    clearConversations,
    getPracticeRecord,
    setPracticeMastery,
    setPracticeAnswer,
    setPracticeNotes,
    // 云同步
    setCurrentUserId,
    cloudSyncStatus: cloud.status,
    cloudConflicts: cloud.conflicts,
    cloud,
    syncState,
  }
})