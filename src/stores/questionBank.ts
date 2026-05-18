import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import questionData from '@/data/interview-questions.json'

export interface Question {
  id: string
  chapterId: string
  number: number
  title: string
  difficulty: 'basic' | 'intermediate' | 'advanced'
  labels: string[]
  answer: {
    content: string
    followUp: { question: string; answer: string }[]
  }
}

export interface Chapter {
  id: string
  name: string
  shortName: string
  order: number
  questionCount: number
}

const STORAGE_KEY = 'question-bank-added-questions'

function loadAddedQuestions(): Question[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveAddedQuestions(questions: Question[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(questions))
  } catch {
    // ignore
  }
}

export const useQuestionBankStore = defineStore('questionBank', () => {
  const bundledQuestions = ref<Question[]>(questionData.questions as Question[])
  const addedQuestions = ref<Question[]>(loadAddedQuestions())

  const chapters = ref<Chapter[]>(questionData.chapters)
  const searchQuery = ref('')
  const activeChapterId = ref<string | null>(null)
  const difficultyFilter = ref<string | null>(null)
  const selectedQuestionId = ref<string | null>(null)

  const questions = computed(() => [...bundledQuestions.value, ...addedQuestions.value])

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

  const filteredQuestions = computed(() => {
    let result = questions.value

    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.answer.content.toLowerCase().includes(q)
      )
    }

    if (activeChapterId.value) {
      result = result.filter((item) => item.chapterId === activeChapterId.value)
    }

    if (difficultyFilter.value) {
      result = result.filter((item) => item.difficulty === difficultyFilter.value)
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

  function selectQuestion(id: string) {
    selectedQuestionId.value = id
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

  function addQuestion(question: Omit<Question, 'id' | 'number'>) {
    const chapterQuestions = addedQuestions.value.filter((q) => q.chapterId === question.chapterId)
    addedQuestions.value.push({
      ...question,
      id: `added_${Date.now()}`,
      number: chapterQuestions.length + 1,
    })
  }

  return {
    chapters,
    questions,
    bundledQuestions,
    addedQuestions,
    searchQuery,
    activeChapterId,
    difficultyFilter,
    selectedQuestionId,
    filteredQuestions,
    selectedQuestion,
    activeChapter,
    questionCountByChapter,
    selectQuestion,
    selectChapter,
    setSearchQuery,
    setDifficultyFilter,
    addQuestion,
  }
})
