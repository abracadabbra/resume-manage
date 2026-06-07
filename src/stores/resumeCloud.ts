import type { ResumeRecord } from '@/services/supabase'

type ValueRef<T> = { value: T }

interface AuthUser {
  id: string
}

interface AuthResponse {
  data?: {
    user?: AuthUser | null
  } | null
  error?: unknown
}

export interface ResumeCloudState {
  isLoggedIn: ValueRef<boolean>
  userId: ValueRef<string | null>
  currentResumeId: ValueRef<string | null>
  resumeVersions: ValueRef<ResumeRecord[]>
}

export interface ResumeCloudApi {
  signUp(email: string, password: string): Promise<AuthResponse>
  signIn(email: string, password: string): Promise<AuthResponse>
  signOut(): Promise<unknown>
  getResumes(userId: string): Promise<ResumeRecord[]>
  getActiveResume(userId: string): Promise<ResumeRecord | null>
  createResume(userId: string, name: string, data: unknown): Promise<ResumeRecord>
  updateResume(id: string, data: unknown): Promise<ResumeRecord>
  setActiveResume(userId: string, resumeId: string): Promise<void>
  deleteResume(id: string): Promise<void>
}

export interface ResumeCloudManagerOptions {
  api: ResumeCloudApi
  state: ResumeCloudState
  getData: () => unknown
  loadData: (data: unknown) => void
}

function requireUserId(state: ResumeCloudState): string {
  const userId = state.userId.value
  if (!userId) {
    throw new Error('Not logged in')
  }
  return userId
}

export function createResumeCloudManager(options: ResumeCloudManagerOptions) {
  const { api, state, getData, loadData } = options

  async function loadResumes() {
    const userId = state.userId.value
    if (!userId) return

    state.resumeVersions.value = await api.getResumes(userId)

    const active = await api.getActiveResume(userId)
    state.currentResumeId.value = active?.id ?? null
    if (active) {
      loadData(active.data)
    }
  }

  async function login(email: string, password: string) {
    const { data, error } = await api.signIn(email, password)
    if (error) throw error
    if (data?.user) {
      state.userId.value = data.user.id
      state.isLoggedIn.value = true
      await loadResumes()
    }
  }

  async function register(email: string, password: string) {
    const { data, error } = await api.signUp(email, password)
    if (error) throw error
    if (data?.user) {
      state.userId.value = data.user.id
      state.isLoggedIn.value = true
    }
  }

  async function logout() {
    await api.signOut()
    state.userId.value = null
    state.isLoggedIn.value = false
    state.currentResumeId.value = null
    state.resumeVersions.value = []
  }

  async function saveToCloud(name?: string) {
    const userId = requireUserId(state)
    const data = getData()

    if (state.currentResumeId.value) {
      await api.updateResume(state.currentResumeId.value, data)
    } else if (name) {
      const resume = await api.createResume(userId, name, data)
      state.currentResumeId.value = resume.id
    }

    await loadResumes()
  }

  async function createNewVersion(name: string) {
    const userId = requireUserId(state)
    const data = getData()
    const resume = await api.createResume(userId, name, data)
    state.currentResumeId.value = resume.id
    await loadResumes()
  }

  async function switchVersion(resumeId: string) {
    const userId = state.userId.value
    if (!userId) return

    await api.setActiveResume(userId, resumeId)
    state.currentResumeId.value = resumeId
    await loadResumes()
  }

  async function removeVersion(resumeId: string) {
    await api.deleteResume(resumeId)
    if (state.currentResumeId.value === resumeId) {
      state.currentResumeId.value = null
    }
    await loadResumes()
  }

  return {
    login,
    register,
    logout,
    loadResumes,
    saveToCloud,
    createNewVersion,
    switchVersion,
    removeVersion,
  }
}
