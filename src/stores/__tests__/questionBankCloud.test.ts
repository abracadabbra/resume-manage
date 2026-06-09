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
    cloudConflict: { value: null },
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
    expect(state.cloudConflict.value).toBeNull()
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
    expect(state.cloudConflict.value).toBeNull()
  })

  it('skips pull and exposes conflict when local and cloud both changed after last sync', async () => {
    const state = createState()
    state.cloudLastSyncedAt.value = 200
    const localData = createCloudData()
    localData.updatedAt = 300
    const cloudData = createCloudData()
    cloudData.updatedAt = 400
    const loadData = vi.fn()
    const api = createApi({
      getQuestionBankState: vi.fn().mockResolvedValue({
        user_id: 'user-1',
        data: cloudData,
        updated_at: '2026-06-07T11:00:00.000Z',
      }),
    })
    const manager = createQuestionBankCloudManager({
      api,
      state,
      getData: () => localData,
      loadData,
    })

    const result = await manager.pullFromCloud('user-1')

    expect(result?.data).toBe(cloudData)
    expect(loadData).not.toHaveBeenCalled()
    expect(state.cloudConflict.value).toEqual({
      localUpdatedAt: 300,
      cloudUpdatedAt: 400,
      lastSyncedAt: 200,
    })
    expect(state.cloudSyncError.value).toContain('检测到本地和云端都有更新')
    expect(state.cloudLastSyncedAt.value).toBe(200)
  })

  it('skips push and exposes conflict when cloud changed after last sync too', async () => {
    const state = createState()
    state.cloudLastSyncedAt.value = 200
    const localData = createCloudData()
    localData.updatedAt = 300
    const cloudData = createCloudData()
    cloudData.updatedAt = 400
    const api = createApi({
      getQuestionBankState: vi.fn().mockResolvedValue({
        user_id: 'user-1',
        data: cloudData,
        updated_at: '2026-06-07T11:00:00.000Z',
      }),
    })
    const manager = createQuestionBankCloudManager({
      api,
      state,
      getData: () => localData,
      loadData: vi.fn(),
    })

    const result = await manager.pushToCloud('user-1')

    expect(result.data).toBe(cloudData)
    expect(api.upsertQuestionBankState).not.toHaveBeenCalled()
    expect(state.cloudConflict.value).toEqual({
      localUpdatedAt: 300,
      cloudUpdatedAt: 400,
      lastSyncedAt: 200,
    })
    expect(state.cloudSyncError.value).toContain('检测到本地和云端都有更新')
    expect(state.cloudLastSyncedAt.value).toBe(200)
  })

  it('resolves a conflict by loading the cloud version and clearing conflict state', async () => {
    const state = createState()
    state.cloudConflict.value = {
      localUpdatedAt: 300,
      cloudUpdatedAt: 400,
      lastSyncedAt: 200,
    }
    state.cloudSyncError.value = '检测到本地和云端都有更新'
    const cloudData = createCloudData()
    cloudData.updatedAt = 400
    const loadData = vi.fn()
    const api = createApi({
      getQuestionBankState: vi.fn().mockResolvedValue({
        user_id: 'user-1',
        data: cloudData,
        updated_at: '2026-06-07T12:00:00.000Z',
      }),
    })
    const manager = createQuestionBankCloudManager({
      api,
      state,
      getData: createCloudData,
      loadData,
    })

    const result = await manager.resolveConflictWithCloud('user-1')

    expect(result?.data).toBe(cloudData)
    expect(loadData).toHaveBeenCalledWith(cloudData)
    expect(state.cloudConflict.value).toBeNull()
    expect(state.cloudSyncError.value).toBe('')
    expect(state.cloudSyncStatus.value).toBe('idle')
    expect(state.cloudLastSyncedAt.value).toBe(new Date('2026-06-07T12:00:00.000Z').getTime())
  })

  it('resolves a conflict by pushing the local version and clearing conflict state', async () => {
    const state = createState()
    state.cloudConflict.value = {
      localUpdatedAt: 300,
      cloudUpdatedAt: 400,
      lastSyncedAt: 200,
    }
    state.cloudSyncError.value = '检测到本地和云端都有更新'
    const localData = createCloudData()
    localData.updatedAt = 300
    const api = createApi({
      upsertQuestionBankState: vi.fn().mockResolvedValue({
        user_id: 'user-1',
        data: localData,
        updated_at: '2026-06-07T12:30:00.000Z',
      }),
    })
    const manager = createQuestionBankCloudManager({
      api,
      state,
      getData: () => localData,
      loadData: vi.fn(),
    })

    const result = await manager.resolveConflictWithLocal('user-1')

    expect(result.data).toBe(localData)
    expect(api.upsertQuestionBankState).toHaveBeenCalledWith('user-1', localData)
    expect(state.cloudConflict.value).toBeNull()
    expect(state.cloudSyncError.value).toBe('')
    expect(state.cloudSyncStatus.value).toBe('idle')
    expect(state.cloudLastSyncedAt.value).toBe(new Date('2026-06-07T12:30:00.000Z').getTime())
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
