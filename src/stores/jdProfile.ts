import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import defaultQuestions from '@/data/jd-default-questions.json'

export interface JdQuestion {
  id: string
  jdId: string
  title: string
  difficulty: 'basic' | 'intermediate' | 'advanced'
  labels: string[]
  answer: {
    content: string
    followUp: { question: string; answer: string }[]
  }
}

export interface JdProfile {
  id: string
  name: string
  rawText: string
  createdAt: number
  questions: JdQuestion[]
}

const STORAGE_KEY = 'jd-profiles'

function loadProfiles(): JdProfile[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveProfiles(profiles: JdProfile[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
  } catch {
    // ignore
  }
}

function buildDefaultProfile(): JdProfile {
  const jdId = 'jd_default_001'
  const questions: JdQuestion[] = (defaultQuestions as Record<string, unknown>[]).map(
    (q: Record<string, unknown>, i: number) => ({
      id: `jdq_default_${i + 1}`,
      jdId,
      title: q.title as string,
      difficulty: q.difficulty as JdQuestion['difficulty'],
      labels: q.labels as string[],
      answer: q.answer as JdQuestion['answer'],
    }),
  )

  return {
    id: jdId,
    name: '资深Java工程师（互联网金融）',
    rawText: `职位：资深Java工程师（互联网金融方向）
核心：Spring Boot/Cloud/MyBatis，微服务，MySQL/Redis/Kafka/ES，高并发，CRM系统
加分项：CRM对接AI推荐引擎/智能客服/BI报表，云平台部署，DevOps/Docker/K8S，前后端协作`,
    createdAt: Date.now(),
    questions,
  }
}

export const useJdProfileStore = defineStore('jdProfile', () => {
  const stored = loadProfiles()
  const profiles = ref<JdProfile[]>(
    stored.length > 0 ? stored : [buildDefaultProfile()],
  )
  const activeProfileId = ref<string | null>(
    profiles.value[0]?.id ?? null,
  )
  const selectedQuestionId = ref<string | null>(null)

  const activeProfile = computed(() =>
    profiles.value.find((p) => p.id === activeProfileId.value) ?? null,
  )

  const selectedQuestion = computed(() => {
    if (!activeProfile.value) return null
    return (
      activeProfile.value.questions.find(
        (q) => q.id === selectedQuestionId.value,
      ) ?? null
    )
  })

  function selectProfile(id: string | null) {
    activeProfileId.value = id
    selectedQuestionId.value = null
  }

  function selectQuestion(id: string) {
    selectedQuestionId.value = id
  }

  function addProfile(name: string, rawText: string): JdProfile {
    const profile: JdProfile = {
      id: `jd_${Date.now()}`,
      name,
      rawText,
      createdAt: Date.now(),
      questions: [],
    }
    profiles.value.push(profile)
    saveProfiles(profiles.value)
    return profile
  }

  function deleteProfile(id: string) {
    const idx = profiles.value.findIndex((p) => p.id === id)
    if (idx !== -1) {
      profiles.value.splice(idx, 1)
      if (activeProfileId.value === id) {
        activeProfileId.value = profiles.value[0]?.id ?? null
        selectedQuestionId.value = null
      }
      saveProfiles(profiles.value)
    }
  }

  function addQuestion(
    jdId: string,
    question: Omit<JdQuestion, 'id' | 'jdId'>,
  ) {
    const profile = profiles.value.find((p) => p.id === jdId)
    if (!profile) return
    profile.questions.push({
      ...question,
      id: `jdq_${Date.now()}`,
      jdId,
    })
    saveProfiles(profiles.value)
  }

  function deleteQuestion(jdId: string, questionId: string) {
    const profile = profiles.value.find((p) => p.id === jdId)
    if (!profile) return
    const idx = profile.questions.findIndex((q) => q.id === questionId)
    if (idx !== -1) {
      profile.questions.splice(idx, 1)
      if (selectedQuestionId.value === questionId) {
        selectedQuestionId.value = null
      }
      saveProfiles(profiles.value)
    }
  }

  function updateProfileName(id: string, name: string) {
    const profile = profiles.value.find((p) => p.id === id)
    if (!profile) return
    profile.name = name
    saveProfiles(profiles.value)
  }

  return {
    profiles,
    activeProfileId,
    selectedQuestionId,
    activeProfile,
    selectedQuestion,
    selectProfile,
    selectQuestion,
    addProfile,
    deleteProfile,
    addQuestion,
    deleteQuestion,
    updateProfileName,
  }
})
