import { describe, expect, it, vi } from 'vitest'

import {
  createQuestionBankCloudManager,
  type QuestionBankCloudApi,
  type QuestionBankCloudData,
  type QuestionBankCloudState,
} from '@/stores/questionBankCloud'

function createCloudData(): QuestionBankCloudData {
  return {
    schemaVersion: 1,
    addedQuestions: [],
    practiceRecords: {},
    updatedAt: 100,
  }
}

function createState(): QuestionBankCloudState {
  return {
    cloudSyncStatus: { value: 'idle' },
    cloudSyncError: { value: '' },
    cloudLastSyncedAt: { value: null },
  }
}

function createApi(overrides: Partial<QuestionBankCloudApi> = {}): QuestionBankCloudApi {
  return {
    getQuestionBankState: vi.fn().mockResolvedValue(null),
    upsertQuestionBankState: vi.fn().mockResolvedValue({
      user_id: 'user-1',
      data: createCloudData(),
      updated_at: '2026-06-07T10:00:00.000Z',
    }),
    ...overrides,
  }
}

describe('questionBankCloud', () => {
  it('pushes current question bank data and records sync time', async () => {
    const state = createState()
    const data = createCloudData()
    const api = createApi()
    const manager = createQuestionBankCloudManager({
      api,
      state,
      getData: () => data,
      loadData: vi.fn(),
    })

    await manager.pushToCloud('user-1')

    expect(api.upsertQuestionBankState).toHaveBeenCalledWith('user-1', data)
    expect(state.cloudSyncStatus.value).toBe('idle')
    expect(state.cloudSyncError.value).toBe('')
    expect(state.cloudLastSyncedAt.value).toBe(new Date('2026-06-07T10:00:00.000Z').getTime())
  })

  it('pulls cloud data into the local store when a record exists', async () => {
    const state = createState()
    const data = createCloudData()
    const loadData = vi.fn()
    const api = createApi({
      getQuestionBankState: vi.fn().mockResolvedValue({
        user_id: 'user-1',
        data,
        updated_at: '2026-06-07T11:00:00.000Z',
      }),
    })
    const manager = createQuestionBankCloudManager({
      api,
      state,
      getData: createCloudData,
      loadData,
    })

    await manager.pullFromCloud('user-1')

    expect(loadData).toHaveBeenCalledWith(data)
    expect(state.cloudLastSyncedAt.value).toBe(new Date('2026-06-07T11:00:00.000Z').getTime())
    expect(state.cloudSyncStatus.value).toBe('idle')
  })

  it('returns null when cloud has no question bank record', async () => {
    const state = createState()
    const loadData = vi.fn()
    const manager = createQuestionBankCloudManager({
      api: createApi({
        getQuestionBankState: vi.fn().mockResolvedValue(null),
      }),
      state,
      getData: createCloudData,
      loadData,
    })

    const result = await manager.pullFromCloud('user-1')

    expect(result).toBeNull()
    expect(loadData).not.toHaveBeenCalled()
    expect(state.cloudLastSyncedAt.value).toBeNull()
  })

  it('throws a clear error before syncing without login', async () => {
    const state = createState()
    const api = createApi()
    const manager = createQuestionBankCloudManager({
      api,
      state,
      getData: createCloudData,
      loadData: vi.fn(),
    })

    await expect(manager.pushToCloud(null)).rejects.toThrow('请先登录后再同步题库')

    expect(api.upsertQuestionBankState).not.toHaveBeenCalled()
  })

  it('keeps error text and resets status when cloud sync fails', async () => {
    const state = createState()
    const manager = createQuestionBankCloudManager({
      api: createApi({
        getQuestionBankState: vi.fn().mockRejectedValue(new Error('network down')),
      }),
      state,
      getData: createCloudData,
      loadData: vi.fn(),
    })

    await expect(manager.pullFromCloud('user-1')).rejects.toThrow('network down')

    expect(state.cloudSyncStatus.value).toBe('idle')
    expect(state.cloudSyncError.value).toBe('network down')
  })
})
