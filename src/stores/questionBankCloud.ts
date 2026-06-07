import type { PracticeRecord, Question } from '@/stores/questionBank'

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

export function createQuestionBankCloudManager(options: QuestionBankCloudManagerOptions) {
  const { api, state, getData, loadData } = options

  async function pushToCloud(userIdValue: string | null | undefined) {
    const userId = requireUserId(userIdValue)
    state.cloudSyncStatus.value = 'pushing'
    state.cloudSyncError.value = ''

    try {
      const record = await api.upsertQuestionBankState(userId, getData())
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

    try {
      const record = await api.getQuestionBankState(userId)
      if (!record) {
        state.cloudLastSyncedAt.value = null
        return null
      }
      loadData(record.data)
      state.cloudLastSyncedAt.value = new Date(record.updated_at).getTime()
      return record
    } catch (error) {
      state.cloudSyncError.value = getErrorMessage(error, '题库拉取失败')
      throw error
    } finally {
      state.cloudSyncStatus.value = 'idle'
    }
  }

  return {
    pushToCloud,
    pullFromCloud,
  }
}
