import type { ResumeRecord } from '@/services/supabase'
import {
  createSyncConflict,
  decideSyncDecision,
  type SyncConflict,
} from './syncConflict'

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
  cloudLastSyncedAt: ValueRef<number | null>
  cloudConflict: ValueRef<SyncConflict | null>
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
  getLocalUpdatedAt?: () => number
}

function requireUserId(state: ResumeCloudState): string {
  const userId = state.userId.value
  if (!userId) {
    throw new Error('Not logged in')
  }
  return userId
}

function getCloudUpdatedAt(record: ResumeRecord): number {
  const timestamp = new Date(record.updated_at).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function createResumeCloudManager(options: ResumeCloudManagerOptions) {
  const { api, state, getData, loadData, getLocalUpdatedAt = () => 0 } = options

  function shouldUseCloud(record: ResumeRecord): boolean {
    const localUpdatedAt = getLocalUpdatedAt()
    const cloudUpdatedAt = getCloudUpdatedAt(record)
    const decision = decideSyncDecision({
      localUpdatedAt,
      cloudUpdatedAt,
      lastSyncedAt: state.cloudLastSyncedAt.value,
    })

    if (decision === 'conflict') {
      state.cloudConflict.value = createSyncConflict({
        localUpdatedAt,
        cloudUpdatedAt,
        lastSyncedAt: state.cloudLastSyncedAt.value,
      })
      return false
    }

    state.cloudConflict.value = null
    return decision === 'use-cloud'
  }

  async function loadResumes() {
    const userId = state.userId.value
    if (!userId) return

    state.resumeVersions.value = await api.getResumes(userId)

    const active = await api.getActiveResume(userId)
    state.currentResumeId.value = active?.id ?? null
    if (active && shouldUseCloud(active)) {
      loadData(active.data)
      state.cloudLastSyncedAt.value = getCloudUpdatedAt(active)
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
    state.cloudLastSyncedAt.value = null
    state.cloudConflict.value = null
  }

  async function saveToCloud(name?: string) {
    const userId = requireUserId(state)
    const data = getData()

    if (state.currentResumeId.value) {
      const active = await api.getActiveResume(userId)
      if (active && active.id === state.currentResumeId.value) {
        const localUpdatedAt = getLocalUpdatedAt()
        const cloudUpdatedAt = getCloudUpdatedAt(active)
        const decision = decideSyncDecision({
          localUpdatedAt,
          cloudUpdatedAt,
          lastSyncedAt: state.cloudLastSyncedAt.value,
        })
        if (decision === 'conflict') {
          state.cloudConflict.value = createSyncConflict({
            localUpdatedAt,
            cloudUpdatedAt,
            lastSyncedAt: state.cloudLastSyncedAt.value,
          })
          return active
        }
      }

      const resume = await api.updateResume(state.currentResumeId.value, data)
      state.cloudConflict.value = null
      state.cloudLastSyncedAt.value = getCloudUpdatedAt(resume)
    } else if (name) {
      const resume = await api.createResume(userId, name, data)
      state.currentResumeId.value = resume.id
      state.cloudConflict.value = null
      state.cloudLastSyncedAt.value = getCloudUpdatedAt(resume)
    }

    await loadResumes()
  }

  async function createNewVersion(name: string) {
    const userId = requireUserId(state)
    const data = getData()
    const resume = await api.createResume(userId, name, data)
    state.currentResumeId.value = resume.id
    state.cloudConflict.value = null
    state.cloudLastSyncedAt.value = getCloudUpdatedAt(resume)
    await loadResumes()
  }

  // AI Generated Start
  async function switchVersion(resumeId: string) {
    const userId = state.userId.value
    if (!userId) return

    await api.setActiveResume(userId, resumeId)
    state.currentResumeId.value = resumeId
    state.resumeVersions.value = await api.getResumes(userId)

    const target =
      state.resumeVersions.value.find((resume) => resume.id === resumeId) ??
      (await api.getActiveResume(userId))

    if (!target) return

    loadData(target.data)
    state.cloudConflict.value = null
    state.cloudLastSyncedAt.value = getCloudUpdatedAt(target)
  }
  // AI Generated End

  async function removeVersion(resumeId: string) {
    await api.deleteResume(resumeId)
    if (state.currentResumeId.value === resumeId) {
      state.currentResumeId.value = null
    }
    await loadResumes()
  }

  async function resolveConflictWithCloud() {
    const userId = requireUserId(state)
    const active = await api.getActiveResume(userId)
    if (!active) {
      state.cloudConflict.value = null
      state.cloudLastSyncedAt.value = null
      return null
    }

    state.currentResumeId.value = active.id
    loadData(active.data)
    state.cloudConflict.value = null
    state.cloudLastSyncedAt.value = getCloudUpdatedAt(active)
    await loadResumes()
    return active
  }

  async function resolveConflictWithLocal(name?: string) {
    const userId = requireUserId(state)
    const data = getData()
    const resume = state.currentResumeId.value
      ? await api.updateResume(state.currentResumeId.value, data)
      : await api.createResume(userId, name ?? '当前简历', data)

    state.currentResumeId.value = resume.id
    state.cloudConflict.value = null
    state.cloudLastSyncedAt.value = getCloudUpdatedAt(resume)
    await loadResumes()
    return resume
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
    resolveConflictWithCloud,
    resolveConflictWithLocal,
  }
}
