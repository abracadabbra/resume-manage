import { streamChatCompletion } from '@/services/aiClient'
import { useAiConfigStore } from '@/stores/aiConfig'
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

interface TechInterviewQuestionInput {
  q: string
  company?: string
  position?: string
  round?: string
  techField?: string
  noteTitle?: string
}

interface GenerateAnswerInput {
  question: TechInterviewQuestionInput
  conversation: ChatMessage[]
}

const MAX_FOLLOW_UP_PAIRS = 6

function buildFirstPrompt(question: TechInterviewQuestionInput): string {
  const meta: string[] = []
  if (question.company) meta.push(`公司：${question.company}`)
  if (question.position) meta.push(`岗位：${question.position}`)
  if (question.round) meta.push(`轮次：${question.round}`)
  if (question.techField) meta.push(`技术领域：${question.techField}`)

  return [
    '你是一名资深的技术面试官。',
    '请为以下大厂面经题目生成一份详细、结构化、适合面试口头回答的参考答案。',
    '',
    '要求：',
    '1. 按照面试表达习惯组织答案，条理清晰，分点明确。',
    '2. 每个要点需包含"为什么"和"怎么做"，让面试官感受到你的深度理解。',
    '3. 结合具体的代码示例或实际场景会让你的回答更有说服力。',
    '4. 涵盖题目涉及的所有核心知识点。',
    '5. 回答长度适中，既完整又精炼，控制在 400-600 字。',
    '6. 必要的时候（如讲解架构、组件关系、流程、模块划分时），用 ASCII 线框图辅助说明，例如：',
    '   Client -> API Gateway -> Auth Service -> Order Service -> MySQL',
    '   线框图使用 -> 表达调用方向、用 |-> 表示包含或归属，文字尽量贴近代码风格。',
    '',
    `题目：${question.q}`,
    meta.length > 0 ? `背景：${meta.join(' | ')}` : '',
    question.noteTitle ? `来源：${question.noteTitle}` : '',
  ].filter(Boolean).join('\n')
}

function buildFollowUpPrompt(question: TechInterviewQuestionInput, userMessage: string): string {
  return [
    `题目：${question.q}`,
    question.company ? `公司：${question.company}` : '',
    '',
    `用户追问：${userMessage}`,
    '',
    '请基于原题和上下文，回答用户的追问。',
  ].filter(Boolean).join('\n')
}

function buildMessages(
  question: TechInterviewQuestionInput,
  conversation: ChatMessage[],
): ChatMessage[] {
  const systemMessage: ChatMessage = {
    role: 'system',
    content: '你是一个专业的技术面试教练，擅长生成详细、结构化的大厂面经参考答案。',
  }

  const messages: ChatMessage[] = [systemMessage]

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

export async function generateTechInterviewAnswer(
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
