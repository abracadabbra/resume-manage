import type { PracticeRecord, Question } from '@/stores/questionBank'
import {
  createSyncConflict,
  decideSyncDecision,
  type SyncConflict,
} from './syncConflict'

type ValueRef<T> = { value: T }

export interface QuestionBankCloudData {
  schemaVersion: 1
  addedQuestions: Question[]
  practiceRecords: Record<string, PracticeRecord>
  updatedAt: number
}

export interface QuestionBankCloudRecord {
  user_id: string
  data: QuestionBankCloudData
  updated_at: string
}

export interface QuestionBankCloudState {
  cloudSyncStatus: ValueRef<'idle' | 'pulling' | 'pushing'>
  cloudSyncError: ValueRef<string>
  cloudLastSyncedAt: ValueRef<number | null>
  cloudConflict: ValueRef<SyncConflict | null>
}

export interface QuestionBankCloudApi {
  getQuestionBankState(userId: string): Promise<QuestionBankCloudRecord | null>
  upsertQuestionBankState(userId: string, data: QuestionBankCloudData): Promise<QuestionBankCloudRecord>
}

export interface QuestionBankCloudManagerOptions {
  api: QuestionBankCloudApi
  state: QuestionBankCloudState
  getData: () => QuestionBankCloudData
  loadData: (data: QuestionBankCloudData) => void
}

function requireUserId(userId: string | null | undefined): string {
  if (!userId) {
    throw new Error('请先登录后再同步题库')
  }
  return userId
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return fallback
}

function getCloudUpdatedAt(record: QuestionBankCloudRecord): number {
  const dataUpdatedAt = record.data.updatedAt
  if (typeof dataUpdatedAt === 'number' && Number.isFinite(dataUpdatedAt)) {
    return dataUpdatedAt
  }
  return new Date(record.updated_at).getTime()
}

function setConflictError(state: QuestionBankCloudState) {
  state.cloudSyncError.value = '检测到本地和云端都有更新，请先选择保留本地或使用云端，避免覆盖。'
}

export function createQuestionBankCloudManager(options: QuestionBankCloudManagerOptions) {
  const { api, state, getData, loadData } = options

  async function pushToCloud(userIdValue: string | null | undefined) {
    const userId = requireUserId(userIdValue)
    state.cloudSyncStatus.value = 'pushing'
    state.cloudSyncError.value = ''
    state.cloudConflict.value = null

    try {
      const localData = getData()
      const cloudRecord = await api.getQuestionBankState(userId)
      if (cloudRecord) {
        const cloudUpdatedAt = getCloudUpdatedAt(cloudRecord)
        const decision = decideSyncDecision({
          localUpdatedAt: localData.updatedAt,
          cloudUpdatedAt,
          lastSyncedAt: state.cloudLastSyncedAt.value,
        })
        if (decision === 'conflict') {
          state.cloudConflict.value = createSyncConflict({
            localUpdatedAt: localData.updatedAt,
            cloudUpdatedAt,
            lastSyncedAt: state.cloudLastSyncedAt.value,
          })
          setConflictError(state)
          return cloudRecord
        }
      }

      const record = await api.upsertQuestionBankState(userId, localData)
      state.cloudLastSyncedAt.value = new Date(record.updated_at).getTime()
      return record
    } catch (error) {
      state.cloudSyncError.value = getErrorMessage(error, '题库上传失败')
      throw error
    } finally {
      state.cloudSyncStatus.value = 'idle'
    }
  }

  async function pullFromCloud(userIdValue: string | null | undefined) {
    const userId = requireUserId(userIdValue)
    state.cloudSyncStatus.value = 'pulling'
    state.cloudSyncError.value = ''
    state.cloudConflict.value = null

    try {
      const record = await api.getQuestionBankState(userId)
      if (!record) {
        state.cloudLastSyncedAt.value = null
        return null
      }
      const localData = getData()
      const cloudUpdatedAt = getCloudUpdatedAt(record)
      const decision = state.cloudLastSyncedAt.value === null
        ? 'use-cloud'
        : decideSyncDecision({
          localUpdatedAt: localData.updatedAt,
          cloudUpdatedAt,
          lastSyncedAt: state.cloudLastSyncedAt.value,
        })

      if (decision === 'conflict') {
        state.cloudConflict.value = createSyncConflict({
          localUpdatedAt: localData.updatedAt,
          cloudUpdatedAt,
          lastSyncedAt: state.cloudLastSyncedAt.value,
        })
        setConflictError(state)
        return record
      }

      if (decision === 'use-cloud') {
        loadData(record.data)
      }
      state.cloudLastSyncedAt.value = new Date(record.updated_at).getTime()
      return record
    } catch (error) {
      state.cloudSyncError.value = getErrorMessage(error, '题库拉取失败')
      throw error
    } finally {
      state.cloudSyncStatus.value = 'idle'
    }
  }

  async function resolveConflictWithCloud(userIdValue: string | null | undefined) {
    const userId = requireUserId(userIdValue)
    state.cloudSyncStatus.value = 'pulling'
    state.cloudSyncError.value = ''

    try {
      const record = await api.getQuestionBankState(userId)
      if (!record) {
        state.cloudConflict.value = null
        state.cloudLastSyncedAt.value = null
        return null
      }

      loadData(record.data)
      state.cloudConflict.value = null
      state.cloudLastSyncedAt.value = new Date(record.updated_at).getTime()
      return record
    } catch (error) {
      state.cloudSyncError.value = getErrorMessage(error, '使用云端题库失败')
      throw error
    } finally {
      state.cloudSyncStatus.value = 'idle'
    }
  }

  async function resolveConflictWithLocal(userIdValue: string | null | undefined) {
    const userId = requireUserId(userIdValue)
    state.cloudSyncStatus.value = 'pushing'
    state.cloudSyncError.value = ''

    try {
      const record = await api.upsertQuestionBankState(userId, getData())
      state.cloudConflict.value = null
      state.cloudLastSyncedAt.value = new Date(record.updated_at).getTime()
      return record
    } catch (error) {
      state.cloudSyncError.value = getErrorMessage(error, '保留本地题库失败')
      throw error
    } finally {
      state.cloudSyncStatus.value = 'idle'
    }
  }

  return {
    pushToCloud,
    pullFromCloud,
    resolveConflictWithCloud,
    resolveConflictWithLocal,
  }
}
