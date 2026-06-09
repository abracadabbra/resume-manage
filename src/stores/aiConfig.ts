import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { loadJson, removeJson, saveJson, type JsonStorage } from '@/services/safeStorage'

export interface AiConfig {
  apiUrl: string
  apiToken: string
  modelName: string
}

const STORAGE_KEY = 'resume-builder-ai-config'
const SESSION_STORAGE_KEY = 'resume-builder-ai-config-session'

export const useAiConfigStore = defineStore('aiConfig', () => {
  const apiUrl = ref('')
  const apiToken = ref('')
  const modelName = ref('')
  const persistConfig = ref(true)

  const isConfigured = computed(
    () => apiUrl.value.trim() !== '' && apiToken.value.trim() !== '' && modelName.value.trim() !== '',
  )

  function applyConfig(data: Partial<AiConfig>) {
    if (data.apiUrl) apiUrl.value = data.apiUrl
    if (data.apiToken) apiToken.value = data.apiToken
    if (data.modelName) modelName.value = data.modelName
  }

  function readStoredConfig(storage: Pick<JsonStorage, 'getItem'>, key: string): Partial<AiConfig> | null {
    const { value, error } = loadJson<Partial<AiConfig> | null>(storage, key, null)
    if (error) {
      console.warn('Failed to load AI config from storage', error)
    }
    return value
  }

  function loadFromStorage() {
    const sessionData = readStoredConfig(sessionStorage, SESSION_STORAGE_KEY)
    if (sessionData) {
      applyConfig(sessionData)
      persistConfig.value = false
      return
    }

    const localData = readStoredConfig(localStorage, STORAGE_KEY)
    if (localData) {
      applyConfig(localData)
      persistConfig.value = true
    }
  }

  function buildConfig(): AiConfig {
    return {
      apiUrl: apiUrl.value,
      apiToken: apiToken.value,
      modelName: modelName.value,
    }
  }

  function saveToStorage(storage: Pick<JsonStorage, 'setItem'>, key: string) {
    saveJson(storage, key, buildConfig())
  }

  function removeStoredConfig() {
    removeJson(localStorage, STORAGE_KEY)
    removeJson(sessionStorage, SESSION_STORAGE_KEY)
  }

  function saveCurrentConfig() {
    removeStoredConfig()
    if (!apiUrl.value.trim() && !apiToken.value.trim() && !modelName.value.trim()) {
      return
    }
    if (persistConfig.value) {
      saveToStorage(localStorage, STORAGE_KEY)
    } else {
      saveToStorage(sessionStorage, SESSION_STORAGE_KEY)
    }
  }

  function updateConfig(config: AiConfig, options: { persist?: boolean } = {}) {
    apiUrl.value = config.apiUrl
    apiToken.value = config.apiToken
    modelName.value = config.modelName
    persistConfig.value = options.persist ?? true
    saveCurrentConfig()
  }

  function clearConfig() {
    apiUrl.value = ''
    apiToken.value = ''
    modelName.value = ''
    persistConfig.value = true
    removeStoredConfig()
  }

  function getConfigSnapshot(): AiConfig {
    const data: AiConfig = {
      apiUrl: apiUrl.value,
      apiToken: apiToken.value,
      modelName: modelName.value,
    }
    return data
  }

  loadFromStorage()

  watch([apiUrl, apiToken, modelName, persistConfig], () => saveCurrentConfig(), { deep: true })

  return {
    apiUrl,
    apiToken,
    modelName,
    persistConfig,
    isConfigured,
    updateConfig,
    clearConfig,
    getConfigSnapshot,
  }
})
