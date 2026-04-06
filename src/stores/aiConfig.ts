import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export interface AiConfig {
  apiUrl: string
  apiToken: string
  modelName: string
}

const STORAGE_KEY = 'resume-builder-ai-config'

export const useAiConfigStore = defineStore('aiConfig', () => {
  const apiUrl = ref('')
  const apiToken = ref('')
  const modelName = ref('')

  const isConfigured = computed(
    () => apiUrl.value.trim() !== '' && apiToken.value.trim() !== '' && modelName.value.trim() !== '',
  )

  function loadFromStorage() {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      const data = JSON.parse(raw) as Partial<AiConfig>
      if (data.apiUrl) apiUrl.value = data.apiUrl
      if (data.apiToken) apiToken.value = data.apiToken
      if (data.modelName) modelName.value = data.modelName
    } catch {
      console.warn('Failed to load AI config from localStorage')
    }
  }

  function saveToStorage() {
    const data: AiConfig = {
      apiUrl: apiUrl.value,
      apiToken: apiToken.value,
      modelName: modelName.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }

  function updateConfig(config: AiConfig) {
    apiUrl.value = config.apiUrl
    apiToken.value = config.apiToken
    modelName.value = config.modelName
    saveToStorage()
  }

  function clearConfig() {
    apiUrl.value = ''
    apiToken.value = ''
    modelName.value = ''
    localStorage.removeItem(STORAGE_KEY)
  }

  loadFromStorage()

  watch([apiUrl, apiToken, modelName], () => saveToStorage(), { deep: true })

  return {
    apiUrl,
    apiToken,
    modelName,
    isConfigured,
    updateConfig,
    clearConfig,
  }
})
