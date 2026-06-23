import { streamChatCompletion } from '@/services/aiClient'
import { useAiConfigStore } from '@/stores/aiConfig'
import type { Question } from '@/stores/questionBank'
import type { ChatMessage } from '@/services/aiClient'

export interface AiAnswerData {
  answer: string
  conversations: ChatMessage[]
  updatedAt: number
}

export interface GenerateAnswerCallbacks {
  onChunk: (fullText: string) => void
  onDone: (answer: string) => void
  onError: (error: string) => void
}

interface GenerateAnswerInput {
  question: Question
  conversation: ChatMessage[]
}

const MAX_FOLLOW_UP_PAIRS = 6

function buildFirstPrompt(question: Question): string {
  const followUp = question.answer.followUp
    .map((item, index) => `${index + 1}. ${item.question}\n参考方向：${item.answer}`)
    .join('\n\n')

  return [
    '你是一名资深的技术面试官。',
    '请为以下面试题目生成一份详细、结构化、适合面试口头回答的参考答案。',
    '',
    '要求：',
    '1. 按照面试表达习惯组织答案，条理清晰，分点明确。',
    '2. 每个要点需包含"为什么"和"怎么做"，让面试官感受到你的深度理解。',
    '3. 结合具体的示例、代码片段或场景会让你的回答更有说服力。',
    '4. 涵盖题目涉及的所有核心知识点，不遗漏关键细节。',
    '5. 回答长度适中，既完整又精炼，控制在 500-800 字。',
    '',
    `题目：${question.title}`,
    `难度：${question.difficulty}`,
    question.labels.length > 0 ? `标签：${question.labels.join('、')}` : '',
    '',
    '参考答案：',
    question.answer.content || '（无）',
    '',
    '高频追问：',
    followUp || '（无）',
  ].filter(Boolean).join('\n')
}

function buildFollowUpPrompt(question: Question, userMessage: string): string {
  return [
    `面试题目：${question.title}`,
    '',
    `用户追问：${userMessage}`,
    '',
    '请基于原题和上下文，回答用户的追问。',
  ].join('\n')
}

function buildMessages(
  question: Question,
  conversation: ChatMessage[],
): ChatMessage[] {
  const systemMessage: ChatMessage = {
    role: 'system',
    content: '你是一个专业的技术面试教练，擅长生成详细、结构化的面试参考答案。',
  }

  const messages: ChatMessage[] = [systemMessage]

  // Build conversation context: last MAX_FOLLOW_UP_PAIRS pairs
  const userAssistantPairs = conversation.filter(
    (m) => m.role === 'user' || m.role === 'assistant',
  )

  const recentPairs: ChatMessage[] = []
  let count = 0
  for (let i = userAssistantPairs.length - 1; i >= 0 && count < MAX_FOLLOW_UP_PAIRS * 2; i--) {
    const msg = userAssistantPairs[i]!
    recentPairs.unshift(msg)
    if (msg.role === 'user') count++
  }

  for (const msg of recentPairs) {
    if (msg.role === 'system') continue
    messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content })
  }

  return messages
}

export async function generateQuestionAnswer(
  input: GenerateAnswerInput,
  callbacks: GenerateAnswerCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const config = useAiConfigStore()

  if (!config.apiUrl || !config.apiToken || !config.modelName) {
    callbacks.onError('请先在 AI 设置中配置模型与密钥')
    return
  }

  try {
    const messages = buildMessages(input.question, input.conversation)
    const isFollowUp = input.conversation.some((m) => m.role === 'user')
    const lastUserContent = input.conversation.length > 0
      ? input.conversation[input.conversation.length - 1]?.content ?? ''
      : ''

    const promptContent = isFollowUp
      ? buildFollowUpPrompt(input.question, lastUserContent)
      : buildFirstPrompt(input.question)

    messages.push({ role: 'user', content: promptContent })

    const fullText = await streamChatCompletion({
      config,
      messages,
      signal,
      onChunk: callbacks.onChunk,
    })

    callbacks.onDone(fullText)
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    const message = err instanceof Error ? err.message : String(err)
    callbacks.onError(`请求出错: ${message}`)
  }
}
