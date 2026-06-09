import { describe, expect, it, vi } from 'vitest'

import type { ResumeRecord } from '@/services/supabase'
import { createResumeCloudManager, type ResumeCloudApi, type ResumeCloudState } from '@/stores/resumeCloud'

function createResumeRecord(id: string, overrides: Partial<ResumeRecord> = {}): ResumeRecord {
  return {
    id,
    user_id: 'user-1',
    name: `resume-${id}`,
    data: { id },
    version: 1,
    is_active: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function createState(): ResumeCloudState {
  return {
    isLoggedIn: { value: false },
    userId: { value: null },
    currentResumeId: { value: null },
    resumeVersions: { value: [] },
    cloudLastSyncedAt: { value: null },
    cloudConflict: { value: null },
  }
}

function createApi(overrides: Partial<ResumeCloudApi> = {}): ResumeCloudApi {
  return {
    signUp: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    signIn: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    signOut: vi.fn().mockResolvedValue(undefined),
    getResumes: vi.fn().mockResolvedValue([]),
    getActiveResume: vi.fn().mockResolvedValue(null),
    createResume: vi.fn().mockResolvedValue(createResumeRecord('resume-new')),
    updateResume: vi.fn().mockResolvedValue(createResumeRecord('resume-current')),
    setActiveResume: vi.fn().mockResolvedValue(undefined),
    deleteResume: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('resumeCloud', () => {
  it('logs in and loads active resume data', async () => {
    const state = createState()
    const activeResume = createResumeRecord('resume-active', {
      is_active: true,
      data: { basicInfo: { name: 'Alice' } },
    })
    const api = createApi({
      getResumes: vi.fn().mockResolvedValue([activeResume]),
      getActiveResume: vi.fn().mockResolvedValue(activeResume),
    })
    const loadData = vi.fn()

    const manager = createResumeCloudManager({
      api,
      state,
      getData: () => ({}),
      loadData,
    })

    await manager.login('alice@example.com', 'secret123')

    expect(state.isLoggedIn.value).toBe(true)
    expect(state.userId.value).toBe('user-1')
    expect(state.currentResumeId.value).toBe('resume-active')
    expect(state.resumeVersions.value).toEqual([activeResume])
    expect(loadData).toHaveBeenCalledWith(activeResume.data)
  })

  it('does not load active cloud data when local and cloud both changed after last sync', async () => {
    const state = createState()
    state.cloudLastSyncedAt.value = 200
    const activeResume = createResumeRecord('resume-active', {
      is_active: true,
      updated_at: new Date(400).toISOString(),
      data: { basicInfo: { name: 'Cloud' } },
    })
    const api = createApi({
      getResumes: vi.fn().mockResolvedValue([activeResume]),
      getActiveResume: vi.fn().mockResolvedValue(activeResume),
    })
    const loadData = vi.fn()

    const manager = createResumeCloudManager({
      api,
      state,
      getData: () => ({ basicInfo: { name: 'Local' } }),
      loadData,
      getLocalUpdatedAt: () => 300,
    })

    await manager.login('alice@example.com', 'secret123')

    expect(loadData).not.toHaveBeenCalled()
    expect(state.cloudConflict.value).toEqual({
      localUpdatedAt: 300,
      cloudUpdatedAt: 400,
      lastSyncedAt: 200,
    })
    expect(state.currentResumeId.value).toBe('resume-active')
  })

  it('registers without loading cloud resumes immediately', async () => {
    const state = createState()
    const api = createApi()
    const manager = createResumeCloudManager({
      api,
      state,
      getData: () => ({}),
      loadData: vi.fn(),
    })

    await manager.register('alice@example.com', 'secret123')

    expect(state.isLoggedIn.value).toBe(true)
    expect(state.userId.value).toBe('user-1')
    expect(api.getResumes).not.toHaveBeenCalled()
    expect(api.getActiveResume).not.toHaveBeenCalled()
  })

  it('updates current resume in cloud and refreshes versions', async () => {
    const state = createState()
    state.isLoggedIn.value = true
    state.userId.value = 'user-1'
    state.currentResumeId.value = 'resume-current'
    const resumeList = [createResumeRecord('resume-current', { is_active: true })]
    const api = createApi({
      getResumes: vi.fn().mockResolvedValue(resumeList),
      getActiveResume: vi.fn().mockResolvedValue(resumeList[0]),
    })
    const getData = vi.fn().mockReturnValue({ basicInfo: { name: 'Alice' } })

    const manager = createResumeCloudManager({
      api,
      state,
      getData,
      loadData: vi.fn(),
    })

    await manager.saveToCloud()

    expect(api.updateResume).toHaveBeenCalledWith('resume-current', { basicInfo: { name: 'Alice' } })
    expect(api.createResume).not.toHaveBeenCalled()
    expect(state.resumeVersions.value).toEqual(resumeList)
  })

  it('does not update cloud resume when saving would overwrite a changed cloud version', async () => {
    const state = createState()
    state.isLoggedIn.value = true
    state.userId.value = 'user-1'
    state.currentResumeId.value = 'resume-current'
    state.cloudLastSyncedAt.value = 200
    const activeResume = createResumeRecord('resume-current', {
      is_active: true,
      updated_at: new Date(400).toISOString(),
      data: { basicInfo: { name: 'Cloud' } },
    })
    const api = createApi({
      getActiveResume: vi.fn().mockResolvedValue(activeResume),
    })

    const manager = createResumeCloudManager({
      api,
      state,
      getData: () => ({ basicInfo: { name: 'Local' } }),
      loadData: vi.fn(),
      getLocalUpdatedAt: () => 300,
    })

    const result = await manager.saveToCloud()

    expect(result).toBe(activeResume)
    expect(api.updateResume).not.toHaveBeenCalled()
    expect(state.cloudConflict.value).toEqual({
      localUpdatedAt: 300,
      cloudUpdatedAt: 400,
      lastSyncedAt: 200,
    })
  })

  it('resolves a resume conflict by using the cloud version', async () => {
    const state = createState()
    state.isLoggedIn.value = true
    state.userId.value = 'user-1'
    state.cloudConflict.value = {
      localUpdatedAt: 300,
      cloudUpdatedAt: 400,
      lastSyncedAt: 200,
    }
    const activeResume = createResumeRecord('resume-active', {
      is_active: true,
      updated_at: new Date(400).toISOString(),
      data: { basicInfo: { name: 'Cloud' } },
    })
    const api = createApi({
      getResumes: vi.fn().mockResolvedValue([activeResume]),
      getActiveResume: vi.fn().mockResolvedValue(activeResume),
    })
    const loadData = vi.fn()

    const manager = createResumeCloudManager({
      api,
      state,
      getData: () => ({ basicInfo: { name: 'Local' } }),
      loadData,
      getLocalUpdatedAt: () => 300,
    })

    await manager.resolveConflictWithCloud()

    expect(loadData).toHaveBeenCalledWith(activeResume.data)
    expect(state.currentResumeId.value).toBe('resume-active')
    expect(state.cloudConflict.value).toBeNull()
    expect(state.cloudLastSyncedAt.value).toBe(400)
  })

  it('resolves a resume conflict by keeping the local version', async () => {
    const state = createState()
    state.isLoggedIn.value = true
    state.userId.value = 'user-1'
    state.currentResumeId.value = 'resume-current'
    state.cloudConflict.value = {
      localUpdatedAt: 300,
      cloudUpdatedAt: 400,
      lastSyncedAt: 200,
    }
    const localData = { basicInfo: { name: 'Local' } }
    const savedResume = createResumeRecord('resume-current', {
      updated_at: new Date(500).toISOString(),
      data: localData,
    })
    const api = createApi({
      updateResume: vi.fn().mockResolvedValue(savedResume),
      getResumes: vi.fn().mockResolvedValue([savedResume]),
      getActiveResume: vi.fn().mockResolvedValue(savedResume),
    })

    const manager = createResumeCloudManager({
      api,
      state,
      getData: () => localData,
      loadData: vi.fn(),
      getLocalUpdatedAt: () => 300,
    })

    await manager.resolveConflictWithLocal()

    expect(api.updateResume).toHaveBeenCalledWith('resume-current', localData)
    expect(state.cloudConflict.value).toBeNull()
    expect(state.cloudLastSyncedAt.value).toBe(500)
  })

  it('creates a new cloud version and reloads active resume', async () => {
    const state = createState()
    state.isLoggedIn.value = true
    state.userId.value = 'user-1'
    const created = createResumeRecord('resume-new', { is_active: true })
    const api = createApi({
      createResume: vi.fn().mockResolvedValue(created),
      getResumes: vi.fn().mockResolvedValue([created]),
      getActiveResume: vi.fn().mockResolvedValue(created),
    })

    const manager = createResumeCloudManager({
      api,
      state,
      getData: () => ({ basicInfo: { name: 'Alice' } }),
      loadData: vi.fn(),
    })

    await manager.createNewVersion('社招版')

    expect(api.createResume).toHaveBeenCalledWith('user-1', '社招版', { basicInfo: { name: 'Alice' } })
    expect(state.currentResumeId.value).toBe('resume-new')
    expect(state.resumeVersions.value).toEqual([created])
  })

  it('switches and removes versions while keeping state in sync', async () => {
    const state = createState()
    state.isLoggedIn.value = true
    state.userId.value = 'user-1'
    state.currentResumeId.value = 'resume-a'
    const resumeB = createResumeRecord('resume-b', { is_active: true })
    const api = createApi({
      getResumes: vi.fn().mockResolvedValue([resumeB]),
      getActiveResume: vi.fn().mockResolvedValue(resumeB),
    })

    const manager = createResumeCloudManager({
      api,
      state,
      getData: () => ({}),
      loadData: vi.fn(),
    })

    await manager.switchVersion('resume-b')
    expect(api.setActiveResume).toHaveBeenCalledWith('user-1', 'resume-b')
    expect(state.currentResumeId.value).toBe('resume-b')

    await manager.removeVersion('resume-b')
    expect(api.deleteResume).toHaveBeenCalledWith('resume-b')
    expect(state.currentResumeId.value).toBe('resume-b')
  })

  it('throws when saving to cloud without login', async () => {
    const manager = createResumeCloudManager({
      api: createApi(),
      state: createState(),
      getData: () => ({}),
      loadData: vi.fn(),
    })

    await expect(manager.saveToCloud('社招版')).rejects.toThrow('Not logged in')
  })
})
