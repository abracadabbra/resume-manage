import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  extractJsonPayload,
  normalizeChatCompletionsUrl,
  requestChatCompletion,
  streamChatCompletion,
} from './aiClient'

const config = {
  apiUrl: 'https://api.example.com',
  apiToken: 'token',
  modelName: 'model',
}

function streamResponse(chunks: string[]) {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
        controller.close()
      },
    }),
  )
}

describe('aiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('normalizes OpenAI-compatible chat completion URLs', () => {
    expect(normalizeChatCompletionsUrl('https://api.example.com')).toBe(
      'https://api.example.com/v1/chat/completions',
    )
    expect(normalizeChatCompletionsUrl('https://api.example.com/v1')).toBe(
      'https://api.example.com/v1/chat/completions',
    )
    expect(normalizeChatCompletionsUrl('https://api.example.com/v1/chat/completions')).toBe(
      'https://api.example.com/v1/chat/completions',
    )
  })

  it('extracts fenced or embedded JSON payloads', () => {
    expect(extractJsonPayload('```json\n{"ok":true}\n```')).toBe('{"ok":true}')
    expect(extractJsonPayload('prefix {"ok":true} suffix')).toBe('{"ok":true}')
  })

  it('streams SSE delta chunks and ignores DONE markers', async () => {
    const onChunk = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        streamResponse([
          'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      ),
    )

    const result = await streamChatCompletion({
      config,
      messages: [{ role: 'user', content: 'ping' }],
      onChunk,
    })

    expect(result).toBe('你好')
    expect(onChunk).toHaveBeenLastCalledWith('你好')
  })

  it('throws normalized errors for failed responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }),
      ),
    )

    await expect(
      requestChatCompletion({
        config,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    ).rejects.toThrow('API 请求失败 (401): bad key')
  })
})
