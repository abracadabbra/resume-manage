import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAiConfigStore } from '@/stores/aiConfig'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key)
    }),
  }
}

describe('aiConfig store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('localStorage', createStorage())
    vi.stubGlobal('sessionStorage', createStorage())
  })

  it('persists config to localStorage by default', () => {
    const store = useAiConfigStore()

    store.updateConfig({
      apiUrl: 'https://api.example.com',
      apiToken: 'secret',
      modelName: 'model',
    })

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'resume-builder-ai-config',
      JSON.stringify({
        apiUrl: 'https://api.example.com',
        apiToken: 'secret',
        modelName: 'model',
      }),
    )
    expect(sessionStorage.setItem).not.toHaveBeenCalled()
  })

  it('can keep config in sessionStorage only', () => {
    const store = useAiConfigStore()

    store.updateConfig(
      {
        apiUrl: 'https://api.example.com',
        apiToken: 'secret',
        modelName: 'model',
      },
      { persist: false },
    )

    expect(sessionStorage.setItem).toHaveBeenCalledWith(
      'resume-builder-ai-config-session',
      JSON.stringify({
        apiUrl: 'https://api.example.com',
        apiToken: 'secret',
        modelName: 'model',
      }),
    )
    expect(store.persistConfig).toBe(false)
  })

  it('clears both local and session config caches', () => {
    const store = useAiConfigStore()

    store.updateConfig(
      {
        apiUrl: 'https://api.example.com',
        apiToken: 'secret',
        modelName: 'model',
      },
      { persist: false },
    )
    store.clearConfig()

    expect(localStorage.removeItem).toHaveBeenCalledWith('resume-builder-ai-config')
    expect(sessionStorage.removeItem).toHaveBeenCalledWith('resume-builder-ai-config-session')
    expect(store.isConfigured).toBe(false)
  })
})
