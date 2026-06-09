import { computed, ref } from 'vue'
import MarkdownIt from 'markdown-it'
import {
  optimizeModule,
  parseAiResponse,
  type ModuleData,
} from '@/services/aiService'

interface AiOptimizeConfig {
  apiUrl: string
  apiToken: string
  modelName: string
}

interface UseAiOptimizeOptions {
  getConfig: () => AiOptimizeConfig
  getModuleData: () => ModuleData
  onResetAppliedModule: (moduleKey: string) => void
}

export function useAiOptimize(options: UseAiOptimizeOptions) {
  const selectedModule = ref('')
  const isLoading = ref(false)
  const streamText = ref('')
  const errorMsg = ref('')
  const isDone = ref(false)

  let abortController: AbortController | null = null

  const markdown = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
    typographer: false,
  })

  const parsed = computed(() => parseAiResponse(streamText.value))
  const renderedSuggestions = computed(() => markdown.render(parsed.value.suggestions || ''))
  const resolvedOptimizedContent = computed(() => {
    const optimized = parsed.value.optimizedContent.trim()
    if (optimized) return optimized
    if (selectedModule.value === 'selfIntro') {
      return parsed.value.suggestions.trim()
    }
    return ''
  })
  const renderedOptimizedContent = computed(() => markdown.render(resolvedOptimizedContent.value || ''))

  async function handleOptimize() {
    if (!selectedModule.value) return

    isLoading.value = true
    streamText.value = ''
    errorMsg.value = ''
    isDone.value = false

    abortController = new AbortController()

    await optimizeModule(
      options.getConfig(),
      selectedModule.value,
      options.getModuleData(),
      {
        onChunk(text) {
          streamText.value = text
        },
        onDone(fullText) {
          streamText.value = fullText
          isLoading.value = false
          isDone.value = true
        },
        onError(err) {
          errorMsg.value = err
          isLoading.value = false
        },
      },
      abortController.signal,
    )
  }

  function handleStop() {
    abortController?.abort()
    abortController = null
    isLoading.value = false
    if (streamText.value) {
      isDone.value = true
    }
  }

  function handleReset() {
    streamText.value = ''
    errorMsg.value = ''
    isDone.value = false
    options.onResetAppliedModule(selectedModule.value)
  }

  function setErrorMessage(message: string) {
    errorMsg.value = message
  }

  return {
    selectedModule,
    isLoading,
    streamText,
    errorMsg,
    isDone,
    markdown,
    parsed,
    renderedSuggestions,
    resolvedOptimizedContent,
    renderedOptimizedContent,
    handleOptimize,
    handleStop,
    handleReset,
    setErrorMessage,
  }
}
