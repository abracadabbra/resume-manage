import { ref, type Ref } from 'vue'

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onstart: (() => void) | null
  onresult: ((event: unknown) => void) | null
  onerror: ((event: unknown) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

interface UseVoiceInputOptions {
  inputText: Ref<string>
  sessionStarted: Ref<boolean>
  isLoading: Ref<boolean>
  setErrorMessage: (message: string) => void
}

const SPEECH_STALL_RESTART_MS = 12_000

export function useVoiceInput(options: UseVoiceInputOptions) {
  const { inputText, sessionStarted, isLoading, setErrorMessage } = options
  const isListening = ref(false)

  let speechRecognition: SpeechRecognitionLike | null = null
  let speechSeed = ''
  let speechFinalBuffer = ''
  let speechLastResultIndex = 0
  let speechManuallyStopped = false
  let speechAutoRestart = false
  let speechRestartTimer: ReturnType<typeof setTimeout> | null = null
  let speechLastEventAt = 0

  function clearSpeechRestartTimer() {
    if (speechRestartTimer) {
      clearTimeout(speechRestartTimer)
      speechRestartTimer = null
    }
  }

  function resetVoiceInputState() {
    clearSpeechRestartTimer()
    speechSeed = ''
    speechFinalBuffer = ''
    speechLastResultIndex = 0
    speechManuallyStopped = false
    speechAutoRestart = false
    speechLastEventAt = 0
  }

  function getSpeechCtor(): SpeechRecognitionCtor | null {
    const speechWindow = window as Window & {
      webkitSpeechRecognition?: SpeechRecognitionCtor
      SpeechRecognition?: SpeechRecognitionCtor
    }
    return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
  }

  function ensureSpeechRecognition(): SpeechRecognitionLike | null {
    if (speechRecognition) return speechRecognition
    const Ctor = getSpeechCtor()
    if (!Ctor) return null

    const instance = new Ctor()
    instance.continuous = true
    instance.interimResults = true
    instance.lang = 'zh-CN'
    instance.onstart = () => {
      if (speechAutoRestart) {
        isListening.value = true
        speechLastEventAt = Date.now()
      }
    }

    instance.onresult = (rawEvent: unknown) => {
      if (!isListening.value) return

      const event = rawEvent as {
        resultIndex?: number
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>
      }
      if (!event?.results || typeof event.results.length !== 'number' || event.results.length === 0) return

      speechLastEventAt = Date.now()
      const maxIndex = Math.max(event.results.length - 1, 0)
      const sourceIndex = typeof event.resultIndex === 'number' ? event.resultIndex : speechLastResultIndex
      const startIndex = event.results.length > 0 ? Math.max(0, Math.min(sourceIndex, maxIndex)) : 0

      let finalText = ''
      let interimText = ''
      for (let i = startIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (!result) continue
        const transcript = result[0]?.transcript?.trim() || ''
        if (!transcript) continue
        if (result.isFinal) {
          finalText += `${finalText ? ' ' : ''}${transcript}`
        } else {
          interimText += `${interimText ? ' ' : ''}${transcript}`
        }
      }

      if (finalText) {
        speechFinalBuffer = [speechFinalBuffer, finalText].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
      }
      speechLastResultIndex = event.results.length
      inputText.value = [speechSeed, speechFinalBuffer, interimText]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    }

    instance.onerror = (rawEvent: unknown) => {
      speechLastEventAt = Date.now()
      const event = rawEvent as { error?: string }
      if (speechManuallyStopped || event.error === 'aborted') {
        speechManuallyStopped = false
        isListening.value = false
        speechAutoRestart = false
        return
      }
      if (event.error === 'no-speech') {
        return
      }
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'audio-capture') {
        isListening.value = false
        speechAutoRestart = false
        setErrorMessage('无法访问麦克风，请检查浏览器权限后重试。')
        return
      }
      if (event.error !== 'no-speech') {
        setErrorMessage('语音识别失败，请检查麦克风权限后重试。')
      }
    }
    instance.onend = () => {
      clearSpeechRestartTimer()
      if (!speechAutoRestart || speechManuallyStopped || !sessionStarted.value || isLoading.value) {
        isListening.value = false
        speechManuallyStopped = false
        return
      }

      speechRestartTimer = setTimeout(() => {
        if (!speechRecognition || !speechAutoRestart || speechManuallyStopped || !sessionStarted.value || isLoading.value) {
          return
        }
        try {
          speechRecognition.start()
          isListening.value = true
          speechLastEventAt = Date.now()
        } catch {
          isListening.value = false
          speechAutoRestart = false
          setErrorMessage('语音识别中断，请点击“语音”重新开始。')
        }
      }, 160)

      speechManuallyStopped = false
    }

    speechRecognition = instance
    return speechRecognition
  }

  function stopVoiceInput() {
    if (!speechRecognition) return
    speechManuallyStopped = true
    isListening.value = false
    try {
      speechRecognition.stop()
    } catch {
      // Some browser implementations throw when stop is called while idle.
    }
  }

  function handleToggleVoice() {
    const instance = ensureSpeechRecognition()
    if (!instance) {
      setErrorMessage('当前浏览器不支持语音识别，请改用手动输入。')
      return
    }
    if (!sessionStarted.value || isLoading.value) return

    if (isListening.value) {
      speechManuallyStopped = true
      speechAutoRestart = false
      isListening.value = false
      instance.stop()
      return
    }

    speechSeed = inputText.value.trim()
    speechFinalBuffer = ''
    speechLastResultIndex = 0
    speechManuallyStopped = false
    speechAutoRestart = true
    speechLastEventAt = Date.now()
    setErrorMessage('')
    isListening.value = true
    try {
      instance.start()
    } catch {
      isListening.value = false
      speechAutoRestart = false
      setErrorMessage('语音识别启动失败，请稍后重试。')
    }
  }

  function handleVoiceKeydown(event: KeyboardEvent) {
    if (!event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return
    if (event.key.toLowerCase() !== 'i') return
    event.preventDefault()
    handleToggleVoice()
  }

  function checkSpeechStall() {
    if (
      isListening.value &&
      speechAutoRestart &&
      !isLoading.value &&
      speechRecognition &&
      speechLastEventAt > 0 &&
      Date.now() - speechLastEventAt > SPEECH_STALL_RESTART_MS
    ) {
      speechLastEventAt = Date.now()
      try {
        speechRecognition.stop()
      } catch {
        try {
          speechRecognition.start()
        } catch {
          isListening.value = false
          speechAutoRestart = false
          setErrorMessage('语音识别卡住，请点击“语音”重新开始。')
        }
      }
    }
  }

  function disposeVoiceInput() {
    clearSpeechRestartTimer()
    if (speechRecognition) {
      speechAutoRestart = false
      speechManuallyStopped = true
      try {
        speechRecognition.stop()
      } catch {
        // Some browser implementations throw when stop is called while idle.
      }
      speechRecognition = null
    }
  }

  return {
    isListening,
    resetVoiceInputState,
    stopVoiceInput,
    handleToggleVoice,
    handleVoiceKeydown,
    checkSpeechStall,
    disposeVoiceInput,
  }
}
