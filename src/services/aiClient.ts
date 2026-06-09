export interface AiClientConfig {
  apiUrl: string
  apiToken: string
  modelName: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionOptions {
  config: AiClientConfig
  messages: ChatMessage[]
  signal?: AbortSignal
  timeoutMs?: number
  body?: Record<string, unknown>
}

export interface StreamChatCompletionOptions extends ChatCompletionOptions {
  onChunk?: (fullText: string) => void
  onDelta?: (delta: string) => void
}

export function normalizeChatCompletionsUrl(raw: string): string {
  let baseUrl = raw.trim().replace(/\/+$/, '')
  if (!baseUrl.includes('/v1/chat/completions')) {
    if (!baseUrl.endsWith('/v1')) {
      baseUrl += '/v1'
    }
    baseUrl += '/chat/completions'
  }
  return baseUrl
}

export function extractJsonPayload(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()

  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first >= 0 && last > first) return raw.slice(first, last + 1).trim()
  return raw.trim()
}

function extractErrorText(text: string): string {
  const cleaned = text.trim()
  if (!cleaned) return ''
  try {
    const parsed = JSON.parse(cleaned) as { error?: { message?: string }; message?: string }
    return parsed.error?.message?.trim() || parsed.message?.trim() || cleaned
  } catch {
    return cleaned
  }
}

function createRequestSignal(signal: AbortSignal | undefined, timeoutMs: number | undefined) {
  if (!timeoutMs) return { signal, cleanup: () => undefined }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const handleAbort = () => controller.abort()
  signal?.addEventListener('abort', handleAbort, { once: true })

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', handleAbort)
    },
  }
}

async function fetchChatCompletion(
  options: ChatCompletionOptions,
  stream: boolean,
): Promise<Response> {
  const { signal, cleanup } = createRequestSignal(options.signal, options.timeoutMs)
  try {
    const response = await fetch(normalizeChatCompletionsUrl(options.config.apiUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.config.apiToken}`,
      },
      body: JSON.stringify({
        model: options.config.modelName,
        messages: options.messages,
        ...options.body,
        stream,
      }),
      signal,
    })

    if (!response.ok) {
      const errorText = extractErrorText(await response.text().catch(() => ''))
      throw new Error(`API 请求失败 (${response.status}): ${errorText || response.statusText}`)
    }

    return response
  } finally {
    cleanup()
  }
}

function readChoiceContent(parsed: unknown): { delta?: string; message?: string } {
  if (!parsed || typeof parsed !== 'object') return {}
  const choices = (parsed as { choices?: unknown[] }).choices
  const first = Array.isArray(choices) ? choices[0] : null
  if (!first || typeof first !== 'object') return {}
  const choice = first as {
    delta?: { content?: unknown }
    message?: { content?: unknown }
  }
  const delta = typeof choice.delta?.content === 'string' ? choice.delta.content : undefined
  const message = typeof choice.message?.content === 'string' ? choice.message.content : undefined
  return { delta, message }
}

export function mergeMessageSnapshot(fullContent: string, messageContent: string): string {
  if (!fullContent) return messageContent
  if (messageContent === fullContent) return fullContent
  if (messageContent.startsWith(fullContent)) return messageContent
  if (messageContent.includes(fullContent)) return messageContent
  if (fullContent.startsWith(messageContent)) return fullContent
  if (fullContent.includes(messageContent)) return fullContent
  return `${fullContent}${messageContent}`
}

function appendChatContent(
  fullText: string,
  parsed: unknown,
  hasDeltaChunks: boolean,
): { fullText: string; delta: string; hasDeltaChunks: boolean } {
  const { delta, message } = readChoiceContent(parsed)
  if (delta) {
    return {
      fullText: fullText + delta,
      delta,
      hasDeltaChunks: true,
    }
  }
  if (!hasDeltaChunks && message) {
    const merged = mergeMessageSnapshot(fullText, message)
    return {
      fullText: merged,
      delta: merged === fullText ? '' : merged.slice(fullText.length),
      hasDeltaChunks,
    }
  }
  return { fullText, delta: '', hasDeltaChunks }
}

function parseSseDataLine(line: string): unknown | null {
  const trimmed = line.trim()
  if (!trimmed || !trimmed.startsWith('data:')) return null
  const data = trimmed.slice(5).trim()
  if (!data || data === '[DONE]') return null
  return JSON.parse(data)
}

export async function streamChatCompletion(options: StreamChatCompletionOptions): Promise<string> {
  const response = await fetchChatCompletion(options, true)
  const reader = response.body?.getReader()
  if (!reader) {
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = payload.choices?.[0]?.message?.content?.trim() ?? ''
    if (content) {
      options.onDelta?.(content)
      options.onChunk?.(content)
    }
    return content
  }

  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''
  let hasDeltaChunks = false

  function handleParsed(parsed: unknown) {
    const result = appendChatContent(fullText, parsed, hasDeltaChunks)
    if (result.fullText === fullText) return
    fullText = result.fullText
    hasDeltaChunks = result.hasDeltaChunks
    if (result.delta) options.onDelta?.(result.delta)
    options.onChunk?.(fullText)
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      try {
        const parsed = parseSseDataLine(line)
        if (parsed) handleParsed(parsed)
      } catch {
        // Ignore malformed streaming chunks from compatible providers.
      }
    }
  }

  const tail = buffer.trim()
  if (tail.startsWith('data:')) {
    try {
      const parsed = parseSseDataLine(tail)
      if (parsed) handleParsed(parsed)
    } catch {
      // Ignore malformed tail chunk.
    }
  }

  return fullText
}

export async function requestChatCompletion(options: ChatCompletionOptions): Promise<string> {
  const response = await fetchChatCompletion(options, false)
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  return payload.choices?.[0]?.message?.content?.trim() ?? ''
}
